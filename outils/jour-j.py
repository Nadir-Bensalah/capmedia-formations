#!/usr/bin/env python3
"""Jour J (15 septembre) : fin du tarif de lancement, hausse des prix.

Fait TOUT en une commande :
  1. lit outils/prix-jour-j.json (à valider avant)
  2. crée les nouveaux prix + liens de paiement Stripe RÉELS
     (e-mail requis, adresse requise, redirection merci, Managed Payments coupé)
  3. désactive les anciens liens
  4. met à jour : catalogue.js, catalogue-en.js, fonctions/catalogue.json,
     config.js, prix mobile des deux accueils
  5. régénère les landings FR et EN

Usage :
  python3 outils/jour-j.py --sec    aperçu, ne touche à rien
  python3 outils/jour-j.py --go     exécute tout

La clé Stripe n'est jamais affichée : lue dans Secret Manager au lancement.
Il reste ensuite 3 gestes, listés en fin d'exécution (déploiement des
fonctions, commit, e-mail à la liste d'attente depuis la console).
"""
import json, os, re, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://capmedia.app'
MERCI = f'{SITE}/merci.html?session_id={{CHECKOUT_SESSION_ID}}'

def lire(chemin): return open(os.path.join(RACINE, chemin), encoding='utf-8').read()
def ecrire(chemin, contenu): open(os.path.join(RACINE, chemin), 'w', encoding='utf-8').write(contenu)

mode = sys.argv[1] if len(sys.argv) > 1 else '--sec'
if mode not in ('--sec', '--go'):
    sys.exit('usage : jour-j.py --sec (aperçu) ou --go (exécution)')

NOUVEAUX = {k: v for k, v in json.load(open(os.path.join(RACINE, 'outils/prix-jour-j.json'))).items()
            if not k.startswith('_')}
CAT = json.load(open(os.path.join(RACINE, 'fonctions/catalogue.json')))
ACTUELS = {f['slug']: f for f in CAT['formations']}

# --- 0. Garde-fous --------------------------------------------------------
erreurs = []
for slug, p in NOUVEAUX.items():
    if slug not in ACTUELS: erreurs.append(f'slug inconnu : {slug}')
    elif p['prixE'] < ACTUELS[slug]['prixE'] or p['prixC'] < ACTUELS[slug]['prixC']:
        erreurs.append(f'{slug} : baisse de prix interdite')
for slug in ACTUELS:
    if slug not in NOUVEAUX: erreurs.append(f'prix manquant pour {slug}')
if erreurs: sys.exit('ARRÊT :\n  ' + '\n  '.join(erreurs))

somme_e = sum(p['prixE'] for p in NOUVEAUX.values())
somme_c = sum(p['prixC'] for p in NOUVEAUX.values())
pack_basic = round(somme_e * (1 - CAT['pack']['remise']))
pack_avance = round(somme_c * (1 - CAT['pack']['remise']))

print('Plan de la hausse :')
for slug, p in NOUVEAUX.items():
    a = ACTUELS[slug]
    print(f"  {slug:15s} {a['prixE']:>4} → {p['prixE']:<4}  |  {a['prixC']:>4} → {p['prixC']}")
print(f"  {'pack basic':15s} → {pack_basic} EUR   pack avancé → {pack_avance} EUR")
if mode == '--sec':
    print('\nAperçu seulement. Relance avec --go pour exécuter.')
    sys.exit(0)

# --- 1. Clé Stripe depuis Secret Manager (jamais affichée) ----------------
cle = subprocess.run(['firebase', 'functions:secrets:access', 'STRIPE_SECRET',
                      '--project', 'capmedia-academy'],
                     capture_output=True, text=True).stdout.strip()
if not cle.startswith('sk_live_'):
    sys.exit('Impossible de lire STRIPE_SECRET (firebase CLI connecté ?)')
ENV = {**os.environ, 'STRIPE_API_KEY': cle}

def stripe(*args):
    r = subprocess.run(['stripe'] + list(args), capture_output=True, text=True, env=ENV)
    d = json.loads(r.stdout) if r.stdout.strip().startswith('{') else {}
    if r.returncode != 0 or d.get('error'):
        sys.exit(f"ERREUR stripe {args[:2]} : {d.get('error', {}).get('message', r.stderr[:200])}")
    return d

def creer_lien(nom, montant, meta):
    prix = stripe('prices', 'create', '-d', 'currency=eur',
                  '-d', f'unit_amount={montant * 100}',
                  '-d', f'product_data[name]={nom}')
    args = ['payment_links', 'create',
            '-d', f'line_items[0][price]={prix["id"]}',
            '-d', 'line_items[0][quantity]=1',
            '-d', 'managed_payments[enabled]=false',
            '-d', 'billing_address_collection=required',
            '-d', 'after_completion[type]=redirect',
            '-d', f'after_completion[redirect][url]={MERCI}']
    for k, v in meta.items(): args += ['-d', f'metadata[{k}]={v}']
    return stripe(*args)['url']

# --- 2. Nouveaux liens ----------------------------------------------------
liens = {}
for slug, p in NOUVEAUX.items():
    nom = ACTUELS[slug]['nom'].replace(',', ' -')
    liens[f'{slug}:essentiel'] = creer_lien(f'{nom} : Offre Essentiel', p['prixE'],
                                            {'formation': slug, 'offre': 'essentiel'})
    liens[f'{slug}:complet'] = creer_lien(f'{nom} : Offre Complete', p['prixC'],
                                          {'formation': slug, 'offre': 'complet'})
    print(f'  liens créés : {slug}')
liens['pack:basic'] = creer_lien('Pack Academy : Basic (toutes les formations - Essentiel)',
                                 pack_basic, {'pack': 'basic'})
liens['pack:avance'] = creer_lien('Pack Academy : Avance (toutes les formations - Complet)',
                                  pack_avance, {'pack': 'avance'})

# --- 3. Désactivation des anciens liens (repérés par leur URL dans config.js)
config = lire('assets/js/config.js')
anciennes = set(re.findall(r"'(https://buy\.stripe\.com/[^']+)'", config))
carte = {}
apres = None
while True:
    args = ['payment_links', 'list', '--limit', '100'] + (['--starting-after', apres] if apres else [])
    page = stripe(*args)
    for l in page.get('data', []): carte[l['url']] = l['id']
    if not page.get('has_more'): break
    apres = page['data'][-1]['id']
eteints = 0
for url in anciennes:
    if url in carte and url not in liens.values():
        stripe('payment_links', 'update', carte[url], '-d', 'active=false')
        eteints += 1
print(f'  {eteints} anciens liens désactivés')

# --- 4. Fichiers du site --------------------------------------------------
def hausse_catalogue(chemin):
    src = lire(chemin)
    for slug, p in NOUVEAUX.items():
        bloc = re.compile(
            r"(slug:\s*'" + re.escape(slug) + r"'[\s\S]*?prixE:\s*)\d+([\s\S]*?prixC:\s*)\d+")
        src, n = bloc.subn(lambda m: f"{m.group(1)}{p['prixE']}{m.group(2)}{p['prixC']}", src, count=1)
        if n != 1: sys.exit(f'{chemin} : bloc {slug} introuvable')
    ecrire(chemin, src)
hausse_catalogue('assets/js/catalogue.js')
hausse_catalogue('assets/js/catalogue-en.js')

for f in CAT['formations']:
    f['prixE'] = NOUVEAUX[f['slug']]['prixE']
    f['prixC'] = NOUVEAUX[f['slug']]['prixC']
ecrire('fonctions/catalogue.json', json.dumps(CAT, ensure_ascii=False, indent=2) + '\n')

for cle_lien, url in liens.items():
    config = re.sub(r"'" + re.escape(cle_lien) + r"':\s*'https://buy\.stripe\.com/[^']+'",
                    f"'{cle_lien}': '{url}'", config)
config = re.sub(r"(essentiel:\s*)'https://buy\.stripe\.com/[^']+'",
                lambda m: f"{m.group(1)}'{liens['mobile:essentiel']}'", config, count=1)
config = re.sub(r"(complet:\s*)'https://buy\.stripe\.com/[^']+'",
                lambda m: f"{m.group(1)}'{liens['mobile:complet']}'", config, count=1)
ecrire('assets/js/config.js', config)

# Prix mobile codés en dur sur les deux accueils.
vE, vC = ACTUELS['mobile']['prixE'], ACTUELS['mobile']['prixC']
nE, nC = NOUVEAUX['mobile']['prixE'], NOUVEAUX['mobile']['prixC']
for page, (aE, aC, bE, bC) in {
    'index.html': (f'{vE} €', f'{vC} €', f'{nE} €', f'{nC} €'),
    'en/index.html': (f'€{vE}', f'€{vC}', f'€{nE}', f'€{nC}'),
}.items():
    src = lire(page)
    src = src.replace(f'<span class="montant">{aE}</span>', f'<span class="montant">{bE}</span>')
    src = src.replace(f'<span class="montant">{aC}</span>', f'<span class="montant">{bC}</span>')
    ecrire(page, src)
    if bE not in lire(page): sys.exit(f'{page} : prix mobile non remplacés, vérifier à la main')

# --- 5. Landings ----------------------------------------------------------
for gen in ('outils/generer-landings.mjs', 'outils/generer-landings-en.mjs'):
    r = subprocess.run(['node', os.path.join(RACINE, gen)], capture_output=True, text=True, cwd=RACINE)
    if r.returncode != 0: sys.exit(f'{gen} : {r.stderr[:300]}')
print('  landings FR et EN régénérées')

print("""
TERMINÉ. Il reste 3 gestes (docs/jour-j.md) :
  1. cd fonctions && firebase deploy --only functions --project capmedia-academy
     (les fonctions vendent aux nouveaux prix)
  2. git add -A && git commit -m "Jour J : fin du tarif de lancement" && git push
  3. E-mail à la liste d'attente : console > Écrire (textes dans docs/jour-j.md)
""")
