#!/usr/bin/env python3
"""Jour J (15 septembre), modèle Parcours : fin du tarif de lancement.

Fait TOUT en une commande :
  1. lit outils/prix-jour-j.json (pack + 4 formations à part ; à valider avant)
  2. crée les nouveaux prix + liens de paiement Stripe RÉELS
     (Managed Payments coupé, redirection merci, adresse requise)
  3. désactive les anciens liens
  4. met à jour : catalogue.js, catalogue-en.js, fonctions/catalogue.json,
     config.js, les prix codés en dur des deux accueils (297, 3 × 99)
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
SITE = 'https://academy.capmedia.app'
MERCI = f'{SITE}/merci.html?session_id={{CHECKOUT_SESSION_ID}}'

def lire(chemin): return open(os.path.join(RACINE, chemin), encoding='utf-8').read()
def ecrire(chemin, contenu): open(os.path.join(RACINE, chemin), 'w', encoding='utf-8').write(contenu)

mode = sys.argv[1] if len(sys.argv) > 1 else '--sec'
if mode not in ('--sec', '--go'):
    sys.exit('usage : jour-j.py --sec (aperçu) ou --go (exécution)')

PLAN = json.load(open(os.path.join(RACINE, 'outils/prix-jour-j.json')))
CAT = json.load(open(os.path.join(RACINE, 'fonctions/catalogue.json')))
SOLOS_ACTUELS = {f['slug']: f for f in CAT['formations'] if f.get('acces') == 'solo'}

# --- 0. Garde-fous --------------------------------------------------------
erreurs = []
if PLAN['pack'] < CAT['pack']['prix']:
    erreurs.append(f"pack : baisse interdite ({CAT['pack']['prix']} -> {PLAN['pack']})")
for slug, prix in PLAN['solos'].items():
    if slug not in SOLOS_ACTUELS: erreurs.append(f'slug inconnu : {slug}')
    elif prix < SOLOS_ACTUELS[slug]['prix']: erreurs.append(f'{slug} : baisse interdite')
for slug in SOLOS_ACTUELS:
    if slug not in PLAN['solos']: erreurs.append(f'prix manquant pour {slug}')
if erreurs: sys.exit('ARRÊT :\n  ' + '\n  '.join(erreurs))

print('Plan de la hausse :')
print(f"  pack parcours   {CAT['pack']['prix']:>4} → {PLAN['pack']}")
for slug, prix in PLAN['solos'].items():
    print(f"  {slug:15s} {SOLOS_ACTUELS[slug]['prix']:>4} → {prix}")
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
liens['pack:parcours'] = creer_lien("Le Parcours Developpeur d'Apps (acces a vie)",
                                    PLAN['pack'], {'pack': 'parcours'})
print('  lien pack créé :', PLAN['pack'], 'EUR')
for slug, prix in PLAN['solos'].items():
    nom = SOLOS_ACTUELS[slug]['nom'].replace(',', ' -')
    liens[f'{slug}:complet'] = creer_lien(f'{nom} (acces a vie)', prix,
                                          {'formation': slug, 'offre': 'complet'})
    print(f'  lien créé : {slug} {prix} EUR')

# --- 3. Désactivation des anciens liens -----------------------------------
config = lire('assets/js/config.js')
anciennes = set(re.findall(r"'(https://buy\.stripe\.com/[^']+)'", config))
carte, apres = {}, None
while True:
    args = ['payment_links', 'list', '--limit', '100'] + (['--starting-after', apres] if apres else [])
    page = stripe(*args)
    for l in page.get('data', []):
        if l.get('active'): carte[l['url']] = l['id']
    if not page.get('has_more'): break
    apres = page['data'][-1]['id']
eteints = 0
for url in anciennes:
    if url in carte and url not in liens.values():
        stripe('payment_links', 'update', carte[url], '-d', 'active=false')
        eteints += 1
print(f'  {eteints} anciens liens désactivés')

# --- 4. Fichiers du site --------------------------------------------------
vieux_pack = CAT['pack']['prix']
tiers_vieux = round(vieux_pack / 3)
tiers_neuf = round(PLAN['pack'] / 3)

def hausse_catalogue(chemin):
    src = lire(chemin)
    src, n = re.subn(r"(pack: \{[\s\S]*?prix: )\d+", lambda m: m.group(1) + str(PLAN['pack']), src, count=1)
    if n != 1: sys.exit(f'{chemin} : prix du pack introuvable')
    for slug, prix in PLAN['solos'].items():
        bloc = re.compile(r"(slug: '" + re.escape(slug) + r"',[\s\S]*?prix: )\d+")
        src, n = bloc.subn(lambda m: m.group(1) + str(prix), src, count=1)
        if n != 1: sys.exit(f'{chemin} : prix de {slug} introuvable')
    ecrire(chemin, src)
hausse_catalogue('assets/js/catalogue.js')
hausse_catalogue('assets/js/catalogue-en.js')

CAT['pack']['prix'] = PLAN['pack']
for f in CAT['formations']:
    if f.get('acces') == 'solo': f['prix'] = PLAN['solos'][f['slug']]
ecrire('fonctions/catalogue.json', json.dumps(CAT, ensure_ascii=False, indent=2) + '\n')

for cle_lien, url in liens.items():
    config, n = re.subn(r"'" + re.escape(cle_lien) + r"':\s*'https://buy\.stripe\.com/[^']+'",
                        f"'{cle_lien}': '{url}'", config, count=1)
    if n != 1: sys.exit(f'config.js : lien {cle_lien} introuvable')
ecrire('assets/js/config.js', config)

# Les prix codés en dur des accueils (héros + carte pack + FAQ éventuelle).
for page, paires in {
    'index.html': [(f'{vieux_pack} €', f"{PLAN['pack']} €"), (f'3 × {tiers_vieux} €', f'3 × {tiers_neuf} €')],
    'en/index.html': [(f'€{vieux_pack}', f"€{PLAN['pack']}"), (f'3 × €{tiers_vieux}', f'3 × €{tiers_neuf}')],
}.items():
    src = lire(page)
    for v, n in paires:
        src = src.replace(v, n)
    ecrire(page, src)
    if str(vieux_pack) in src:
        print(f'  ATTENTION {page} : il reste des occurrences de {vieux_pack}, vérifie à la main')

# --- 5. Landings ----------------------------------------------------------
for gen in ('outils/generer-landings.mjs', 'outils/generer-landings-en.mjs'):
    r = subprocess.run(['node', os.path.join(RACINE, gen)], capture_output=True, text=True, cwd=RACINE)
    if r.returncode != 0: sys.exit(f'{gen} : {r.stderr[:300]}')
print('  landings FR et EN régénérées')

print(f"""
TERMINÉ. Il reste 3 gestes (docs/jour-j.md) :
  1. cd fonctions && firebase deploy --only functions --project capmedia-academy
     (le pack et les solos se vendent aux nouveaux prix côté serveur)
  2. git add -A && git commit -m "Jour J : fin du tarif de lancement" && git push
  3. E-mail à la liste d'attente : console > Écrire (textes dans docs/jour-j.md)
""")
