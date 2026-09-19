/* ==========================================================================
   Les projets côté équipe : la liste, et l'assistant de création en dix
   étapes qui pose d'un coup la structure initiale.
   ========================================================================== */

import { echapper, dateCourte, pluriel, joursAvant, parDateDesc, STATUTS_PROJET, TYPES_PROJET, TYPES_COMPOSANT, CATEGORIES_LIEN, PLATEFORMES, projetEstActif, statutProjet, verdictDelai } from '../noyau.js';
import { icone, pastille, avatarProjet, progression, progressionOuPas, verdictHtml, ligne, vide, squelette, titrePage, toast, sur, agir, lireForme, valider, obligatoire, emailValide, urlValide, optionsDe, encart, choixPlateformes, pucePlateforme } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, progressionProjet, risquesProjet } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { appelServeur } from '../serveur.js';

/* Les plateformes d'un projet, en jetons : l'icône seule dans sa couleur,
   alignée à droite avec le reste des indicateurs. Le libellé tient dans
   l'info-bulle : sur une ligne de liste, le pictogramme suffit. */
const jetonsPlateformes = (cles) => {
  const liste = (cles || []).filter((c) => PLATEFORMES[c]);
  if (!liste.length) return '';
  return `<span class="jetons">${liste.map((c) => {
    const f = PLATEFORMES[c];
    return `<span class="jeton jeton--${f.voile}" data-astuce="${echapper(f.libelle)}">${icone(f.icone)}</span>`;
  }).join('')}</span>`;
};

export const liste = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Projets');
  filAriane([{ libelle: 'Projets' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const etat = { filtre: 'actifs' };
  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const organisations = magasin.lire(K.organisations) || [];
    const tickets = (magasin.lire(K.ticketsTous) || []).filter((t) => !t.archive);
    const jalons = magasin.lire(K.jalonsTous) || [];
    const taches = (magasin.lire(K.tachesToutes) || []).filter((t) => !t.archive);
    const nomOrg = (id) => ((organisations.find((o) => o.id === id) || {}).entreprise || (organisations.find((o) => o.id === id) || {}).nom || '');
    /* Mes propres projets se rangent à part : ce ne sont pas des affaires
       clientes, et les mêler fausserait la lecture du portefeuille. */
    const groupes = {
      actifs: projets.filter((p) => projetEstActif(p) && !p.interne),
      maison: projets.filter((p) => p.interne && !p.archive),
      tous: projets.filter((p) => !p.archive),
      termines: projets.filter((p) => !p.archive && statutProjet(p) === 'termine'),
      archives: projets.filter((p) => p.archive),
    };
    const liste = groupes[etat.filtre] || groupes.actifs;
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Projets</h1><p class="chapo">${pluriel(groupes.actifs.length, 'projet client actif', 'projets clients actifs')} et ${pluriel(groupes.maison.length, 'projet à moi', 'projets à moi')}, sur ${projets.length} au total.</p></div><div class="actions"><a class="btn btn-principal" href="#/projets/nouveau">${icone('plus')} Nouveau projet</a></div></div>
      <div class="filtres" style="margin-bottom:16px">${[['actifs', 'Clients'], ['maison', 'Mes projets'], ['tous', 'Tous'], ['termines', 'Terminés'], ['archives', 'Archivés']].map(([cle, lib]) => `<button class="filtre${etat.filtre === cle ? ' actif' : ''}" type="button" data-filtre="${cle}">${lib}<span class="compte">${groupes[cle].length}</span></button>`).join('')}</div>
      ${liste.length ? `<div class="liste">${liste.map((p) => { const prog = progressionProjet(p, jalons.filter((j) => j.projet === p.id), { taches: taches.filter((t) => t.projet === p.id) }); const ouverts = tickets.filter((t) => t.projet === p.id && !['resolu', 'ferme', 'refuse', 'annulee'].includes(t.statut)).length; return ligne({ href: `#/projets/${echapper(p.id)}`, titre: `<span class="rang" style="gap:10px">${avatarProjet(p, 'petit')} ${echapper(p.nom)} <span class="t-3 t-petit" style="font-weight:400">${echapper(p.ref || '')}</span></span>`, sous: echapper([p.interne ? 'Mon projet' : (nomOrg(p.organisation) || (p.client || {}).entreprise || (p.client || {}).nom), p.cible ? `cible ${dateCourte(p.cible)}` : '', ouverts ? pluriel(ouverts, 'demande ouverte', 'demandes ouvertes') : ''].filter(Boolean).join(' · ')), fin: `${jetonsPlateformes(p.plateformes)}<span style="width:90px">${progressionOuPas(prog)}</span>${pastille(STATUTS_PROJET, statutProjet(p))}${verdictHtml(verdictDelai(p.cible, { clos: statutProjet(p) === 'termine', risques: risquesProjet({ jalons: jalons.filter((j) => j.projet === p.id), taches: taches.filter((t) => t.projet === p.id) }) }), { vide: false, detail: false })}` }); }).join('')}</div>` : vide({ icone: 'projets', titre: 'Aucun projet ici', compact: true })}
    </div>`;
  };
  const gestes = sur(sortie, 'click', '[data-filtre]', (el) => { etat.filtre = el.dataset.filtre; rendre(); });
  [K.projets, K.organisations, K.ticketsTous, K.jalonsTous, K.tachesToutes].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};

/* ==========================================================================
   L'assistant de création
   ========================================================================== */

const ETAPES = ['Identité', 'Client', 'Type', 'Les parties', 'Équipe', 'Dates', 'Budget', 'Liens', 'Accès', 'Récapitulatif'];

export const nouveau = async (ctx, env) => {
  const sortie = ctx.sortie;
  titrePage('Nouveau projet');
  filAriane([{ libelle: 'Projets', chemin: '/projets' }, { libelle: 'Nouveau projet' }]);
  const organisations = magasin.lire(K.organisations) || [];
  const equipe = magasin.lire(K.equipe) || [];
  const depuis = ctx.requete.depuis ? (magasin.lire(K.demandesProjet) || []).find((d) => d.id === ctx.requete.depuis) : null;
  const d = {
    nom: depuis ? depuis.titre : '', ref: '', description: depuis ? depuis.idee : '',
    organisation: ctx.requete.organisation || (depuis && depuis.organisation) || '', clientNom: '', clientEmail: '', clientEntreprise: '',
    type: depuis ? depuis.type : 'application-mobile', statut: 'cadrage',
    plateformes: depuis && depuis.plateformes && depuis.plateformes.length ? depuis.plateformes.slice() : ['ios', 'android'],
    composants: (depuis && depuis.plateformes && depuis.plateformes.length ? depuis.plateformes : ['ios', 'android']).map((p) => ({ nom: TYPES_COMPOSANT[p] || p, type: p })),
    responsable: env.session.equipe.uid, debut: '', cible: '', budget: '', budgetNote: depuis ? depuis.budget : '',
    liens: [], inviter: true, demandeProjet: depuis ? depuis.id : '',
  };
  let etape = 0;

  const orgChoisie = () => organisations.find((o) => o.id === d.organisation);
  const corps = () => {
    switch (etape) {
      case 0: return `<div class="groupe"><label class="etiquette-champ" for="nom">Nom du projet</label><input class="champ" id="nom" name="nom" value="${echapper(d.nom)}" maxlength="80" placeholder="Nom du projet"></div>
        <div class="groupe"><label class="etiquette-champ" for="ref">Référence</label><input class="champ" id="ref" name="ref" value="${echapper(d.ref)}" maxlength="16" placeholder="Ex. ATELIER" style="text-transform:uppercase"><p class="aide">Préfixe des numéros de demande, par exemple ATELIER-001. Lettres et chiffres, sans espace, unique.</p></div>
        <div class="groupe"><label class="etiquette-champ" for="description">Description <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="description" name="description" rows="3" maxlength="2000">${echapper(d.description)}</textarea></div>`;
      case 1: return `<div class="groupe"><label class="etiquette-champ" for="organisation">Client</label><select class="select" id="organisation" name="organisation"><option value="">Nouveau client</option>${organisations.map((o) => `<option value="${echapper(o.id)}" ${d.organisation === o.id ? 'selected' : ''}>${echapper(o.entreprise || o.nom)}</option>`).join('')}</select></div>
        <div id="nouveau-client" class="${d.organisation ? 'masque' : ''}"><div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="clientEntreprise">Société</label><input class="champ" id="clientEntreprise" name="clientEntreprise" value="${echapper(d.clientEntreprise)}"></div><div class="groupe"><label class="etiquette-champ" for="clientNom">Contact principal</label><input class="champ" id="clientNom" name="clientNom" value="${echapper(d.clientNom)}"></div></div><div class="groupe"><label class="etiquette-champ" for="clientEmail">E-mail du contact</label><input class="champ" id="clientEmail" name="clientEmail" type="email" value="${echapper(d.clientEmail)}"></div></div>`;
      case 2: return `<div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="type">Type</label><select class="select" id="type" name="type">${optionsDe(TYPES_PROJET, d.type)}</select></div><div class="groupe"><label class="etiquette-champ" for="statut">Statut de départ</label><select class="select" id="statut" name="statut">${optionsDe(STATUTS_PROJET, d.statut, { exclure: ['archive'] })}</select></div></div>
        <div class="groupe"><span class="etiquette-champ">Plateformes du projet</span>${choixPlateformes('plateformes', d.plateformes)}<p class="aide">Un projet peut en réunir plusieurs : iPhone, Android, web, tableau de bord. Chacune devient un composant que vous suivez à part, et que le client peut désigner dans ses demandes.</p></div>`;
      case 3: return `<p class="t-petit t-2">Les briques du projet, posées d'après les plateformes choisies. Chacune aura sa progression, sa version, ses tâches. Vous pouvez en ajouter d'autres.</p><div id="liste-composants" class="pile" style="margin-top:12px">${d.composants.map((c, i) => `<div class="forme-rang" data-i="${i}"><input class="champ" name="cnom" value="${echapper(c.nom)}" placeholder="Nom"><div class="rang" style="gap:6px"><select class="select" name="ctype">${optionsDe(TYPES_COMPOSANT, c.type)}</select><button class="btn-icone" type="button" data-retirer="${i}" aria-label="Retirer">${icone('fermer')}</button></div></div>`).join('')}</div><button class="btn btn-doux btn-petit" type="button" data-ajouter-composant style="margin-top:12px">${icone('plus')} Ajouter un composant</button>`;
      case 4: return `<div class="groupe"><label class="etiquette-champ" for="responsable">Responsable Capmedia</label><select class="select" id="responsable" name="responsable">${equipe.map((e) => `<option value="${echapper(e.id)}" ${d.responsable === e.id ? 'selected' : ''}>${echapper(e.nom || e.email)}</option>`).join('')}</select><p class="aide">D'autres membres pourront être assignés tâche par tâche.</p></div>`;
      case 5: return `<div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="debut">Début</label><input class="champ" id="debut" name="debut" type="date" value="${echapper(d.debut)}"></div><div class="groupe"><label class="etiquette-champ" for="cible">Date cible <span class="facultatif">(facultatif)</span></label><input class="champ" id="cible" name="cible" type="date" value="${echapper(d.cible)}"></div></div>`;
      case 6: return `<div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="budget">Budget HT <span class="facultatif">(facultatif, interne)</span></label><input class="champ" id="budget" name="budget" type="number" min="0" step="100" value="${echapper(d.budget)}"></div><div class="groupe"><label class="etiquette-champ" for="budgetNote">Note <span class="facultatif">(facultatif)</span></label><input class="champ" id="budgetNote" name="budgetNote" value="${echapper(d.budgetNote)}" placeholder="Forfait, régie, phases"></div></div><p class="aide">Le budget reste interne. Le client voit ses devis et ses factures.</p>`;
      case 7: return `<p class="t-petit t-2">Les adresses utiles au client, dès l'ouverture. Vous pourrez en ajouter ensuite.</p><div id="liste-liens" class="pile" style="margin-top:12px">${d.liens.map((l, i) => `<div class="forme-rang" data-i="${i}"><input class="champ" name="lnom" value="${echapper(l.nom)}" placeholder="Nom"><div class="rang" style="gap:6px;flex-wrap:nowrap"><input class="champ" name="lurl" value="${echapper(l.url)}" placeholder="https://"><select class="select" name="lcat" style="width:150px;flex:none">${optionsDe(CATEGORIES_LIEN, l.categorie)}</select><button class="btn-icone" type="button" data-retirer-lien="${i}" aria-label="Retirer">${icone('fermer')}</button></div></div>`).join('')}</div><button class="btn btn-doux btn-petit" type="button" data-ajouter-lien style="margin-top:12px">${icone('plus')} Ajouter un lien</button>`;
      case 8: return `<label class="interrupteur"><input type="checkbox" name="inviter" ${d.inviter ? 'checked' : ''}><i></i> Inviter le contact principal dès la création</label><p class="aide" style="margin-top:8px">Il reçoit un e-mail avec le lien de son espace. Décochez pour préparer le projet avant d'ouvrir l'accès.</p>${encart('Les contacts déjà rattachés au client ont automatiquement accès au nouveau projet.', 'info')}`;
      case 9: { const o = orgChoisie(); return `<dl class="faits" style="grid-template-columns:1fr 1fr">${[['Projet', `${d.nom} (${d.ref.toUpperCase()})`], ['Client', o ? (o.entreprise || o.nom) : `${d.clientEntreprise} · ${d.clientNom} · ${d.clientEmail}`], ['Type', TYPES_PROJET[d.type]], ['Statut', (STATUTS_PROJET[d.statut] || {}).libelle], ['Les parties', d.composants.map((c) => c.nom).join(', ') || 'Aucune'], ['Responsable', (equipe.find((e) => e.id === d.responsable) || {}).nom || ''], ['Dates', [d.debut, d.cible].filter(Boolean).join(' → ') || 'Non fixées'], ['Budget', d.budget ? `${d.budget} € HT` : 'Non renseigné'], ['Liens', d.liens.length ? pluriel(d.liens.length, 'lien') : 'Aucun'], ['Invitation', d.inviter ? 'Envoyée à la création' : 'Plus tard']].map(([l, v]) => `<div class="fait"><dt>${echapper(l)}</dt><dd>${echapper(v)}</dd></div>`).join('')}</dl>${depuis ? encart(`Ce projet reprend la demande « ${echapper(depuis.titre)} ». Sa discussion et ses fichiers restent accessibles depuis la fiche de la demande.`, 'info', 'sparkle') : ''}`; }
      default: return '';
    }
  };

  const rendre = () => {
    sortie.innerHTML = `<div class="page" style="max-width:760px">
      <div class="page-tete"><div><p class="surtitre">Étape ${etape + 1} sur ${ETAPES.length}</p><h1>${echapper(ETAPES[etape])}</h1></div></div>
      <div class="rang" style="gap:6px;margin-bottom:24px;flex-wrap:nowrap;overflow-x:auto">${ETAPES.map((e, i) => `<span class="progression" style="flex:1;min-width:16px"><i style="width:${i <= etape ? 100 : 0}%"></i></span>`).join('')}</div>
      <form class="forme carte" id="forme-etape" novalidate>${corps()}<div class="forme-pied" style="justify-content:space-between"><div>${etape > 0 ? '<button class="btn btn-secondaire" type="button" data-prec>Précédent</button>' : '<a class="btn btn-fantome" href="#/projets">Annuler</a>'}</div><button class="btn btn-principal" type="submit">${etape === ETAPES.length - 1 ? 'Créer le projet' : 'Continuer'}</button></div></form></div>`;
    const forme = sortie.querySelector('#forme-etape');
    const sel = forme.querySelector('#organisation');
    if (sel) sel.addEventListener('change', () => { forme.querySelector('#nouveau-client').classList.toggle('masque', Boolean(sel.value)); });
    forme.addEventListener('submit', async (e) => {
      e.preventDefault();
      collecter(forme);
      if (!verifier(forme)) return;
      if (etape < ETAPES.length - 1) { etape += 1; rendre(); return; }
      await agir(forme.querySelector('[type="submit"]'), async () => {
        const r = await appelServeur('creerProjet', {
          nom: d.nom, ref: d.ref.toUpperCase(), description: d.description, type: d.type, statut: d.statut, plateformes: d.plateformes,
          organisation: d.organisation || null, client: d.organisation ? null : { nom: d.clientNom, email: d.clientEmail, entreprise: d.clientEntreprise },
          responsable: d.responsable, debut: d.debut || null, cible: d.cible || null, budget: d.budget ? Number(d.budget) : null, budgetNote: d.budgetNote,
          inviter: d.inviter, demandeProjet: d.demandeProjet || null,
        });
        const pid = r.id;
        for (const [i, c] of d.composants.entries()) if (c.nom) await ecrire.creerComposant(pid, { nom: c.nom, type: c.type, statut: 'a-venir', ordre: i + 1 });
        for (const l of d.liens) if (l.nom && l.url) await ecrire.creerLien(pid, { nom: l.nom, url: l.url, categorie: l.categorie, visibilite: 'client' });
        naviguer(`/projets/${pid}`);
      }, 'Projet créé.');
    });
  };

  const collecter = (forme) => {
    const v = lireForme(forme);
    if (etape === 0) Object.assign(d, { nom: v.nom, ref: v.ref, description: v.description });
    if (etape === 1) Object.assign(d, { organisation: v.organisation, clientEntreprise: v.clientEntreprise, clientNom: v.clientNom, clientEmail: v.clientEmail });
    if (etape === 2) {
      const choisies = Array.from(forme.querySelectorAll('[name="plateformes"]:checked')).map((c) => c.value);
      Object.assign(d, { type: v.type, statut: v.statut, plateformes: choisies });
      /* Les composants suivent les plateformes : on ajoute les manquants et on
         retire ceux d'une plateforme décochée, sans toucher aux composants
         ajoutés à la main. */
      const parType = new Map(d.composants.map((c) => [c.type, c]));
      d.composants = choisies.map((t) => parType.get(t) || { nom: TYPES_COMPOSANT[t] || t, type: t })
        .concat(d.composants.filter((c) => !PLATEFORMES[c.type]));
    }
    if (etape === 3) d.composants = Array.from(forme.querySelectorAll('#liste-composants [data-i]')).map((r) => ({ nom: r.querySelector('[name="cnom"]').value.trim(), type: r.querySelector('[name="ctype"]').value }));
    if (etape === 4) d.responsable = v.responsable;
    if (etape === 5) Object.assign(d, { debut: v.debut, cible: v.cible });
    if (etape === 6) Object.assign(d, { budget: v.budget === null ? '' : v.budget, budgetNote: v.budgetNote });
    if (etape === 7) d.liens = Array.from(forme.querySelectorAll('#liste-liens [data-i]')).map((r) => ({ nom: r.querySelector('[name="lnom"]').value.trim(), url: r.querySelector('[name="lurl"]').value.trim(), categorie: r.querySelector('[name="lcat"]').value }));
    if (etape === 8) d.inviter = Boolean(v.inviter);
  };
  const verifier = (forme) => {
    if (etape === 0) return valider(forme, { nom: obligatoire(), ref: (v) => (obligatoire()(v) || (!/^[A-Za-z][A-Za-z0-9]{1,15}$/.test(v) ? 'Lettres et chiffres, 2 à 16 caractères.' : '')) });
    if (etape === 1 && !d.organisation) return valider(forme, { clientEntreprise: obligatoire(), clientNom: obligatoire(), clientEmail: (v) => obligatoire()(v) || emailValide()(v) });
    if (etape === 7) { const faux = d.liens.find((l) => l.url && urlValide()(l.url)); if (faux) { toast('Une adresse de lien est invalide.', 'erreur'); return false; } }
    return true;
  };

  const gestes = sur(sortie, 'click', '[data-prec], [data-ajouter-composant], [data-retirer], [data-ajouter-lien], [data-retirer-lien]', (el) => {
    const forme = sortie.querySelector('#forme-etape');
    collecter(forme);
    if (el.hasAttribute('data-prec')) { etape -= 1; }
    if (el.hasAttribute('data-ajouter-composant')) d.composants.push({ nom: '', type: 'web' });
    if (el.dataset.retirer !== undefined) d.composants.splice(Number(el.dataset.retirer), 1);
    if (el.hasAttribute('data-ajouter-lien')) d.liens.push({ nom: '', url: '', categorie: 'production' });
    if (el.dataset.retirerLien !== undefined) d.liens.splice(Number(el.dataset.retirerLien), 1);
    rendre();
  });
  rendre();
  return () => gestes();
};

void parDateDesc;
