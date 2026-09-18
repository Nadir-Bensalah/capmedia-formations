/* ==========================================================================
   Les clients : la fiche de chaque organisation, ses contacts, ses accès,
   ses projets, ses pièces comptables, ses notes internes.
   ========================================================================== */

import { echapper, dateCourte, montant, pluriel, parDateDesc, STATUTS_PROJET, STATUTS_FACTURE, STATUTS_DEVIS, statutProjet, projetEstActif} from '../noyau.js';
import { icone, pastille, avatar, avatarProjet, ligne, vide, squelette, titrePage, modale, confirmer, toast, sur, agir, lireForme, valider, obligatoire, emailValide, fait, metrique, menu } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, resteAPayer } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { appelServeur } from '../serveur.js';

export const liste = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Clients');
  filAriane([{ libelle: 'Clients' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const rendre = () => {
    const organisations = magasin.lire(K.organisations) || [];
    const projets = magasin.lire(K.projets) || [];
    const documents = magasin.lire(K.documentsTous) || [];
    const paiements = magasin.lire(K.paiementsTous) || [];
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Clients</h1><p class="chapo">${pluriel(organisations.length, 'organisation cliente', 'organisations clientes')}.</p></div><div class="actions"><a class="btn btn-principal" href="#/clients/nouveau">${icone('plus')} Nouveau client</a></div></div>
      ${organisations.length ? `<div class="liste">${organisations.map((o) => {
        const sesProjets = projets.filter((p) => p.organisation === o.id);
        const actifs = sesProjets.filter(projetEstActif);
        const { total } = resteAPayer(documents.filter((d) => sesProjets.some((p) => p.id === d.projet)), paiements);
        return ligne({ href: `#/clients/${echapper(o.id)}`, titre: `<span class="rang" style="gap:10px">${avatar(o.entreprise || o.nom)} ${echapper(o.entreprise || o.nom)}</span>`, sous: `${echapper([o.nom !== o.entreprise ? o.nom : '', o.email, pluriel(actifs.length, 'projet actif', 'projets actifs')].filter(Boolean).join(' · '))}`, fin: total > 0 ? `<span class="puce puce--ambre"><i></i>${echapper(montant(total))} dû</span>` : '' });
      }).join('')}</div>` : vide({ icone: 'entreprise', titre: 'Aucun client', texte: 'Créez la première organisation, puis rattachez-lui ses projets.', action: '<a class="btn btn-principal" href="#/clients/nouveau">Nouveau client</a>' })}
    </div>`;
  };
  [K.organisations, K.projets, K.documentsTous, K.paiementsTous].forEach((c) => lot.sur(c, rendre));
  return () => lot.fin();
};

const formulaireOrganisation = (o = {}) => `
  <div class="forme-rang">
    <div class="groupe"><label class="etiquette-champ" for="entreprise">Société</label><input class="champ" id="entreprise" name="entreprise" value="${echapper(o.entreprise || '')}" maxlength="120" placeholder="[nom retire] Capital"></div>
    <div class="groupe"><label class="etiquette-champ" for="nom">Contact principal</label><input class="champ" id="nom" name="nom" value="${echapper(o.nom || '')}" maxlength="120" placeholder="[nom retire] [nom retire]"></div>
  </div>
  <div class="forme-rang">
    <div class="groupe"><label class="etiquette-champ" for="email">E-mail du contact</label><input class="champ" id="email" name="email" type="email" value="${echapper(o.email || '')}" maxlength="120"></div>
    <div class="groupe"><label class="etiquette-champ" for="telephone">Téléphone <span class="facultatif">(facultatif)</span></label><input class="champ" id="telephone" name="telephone" value="${echapper(o.telephone || '')}" maxlength="40"></div>
  </div>
  <div class="groupe"><label class="etiquette-champ" for="adresse">Adresse <span class="facultatif">(facultatif)</span></label><input class="champ" id="adresse" name="adresse" value="${echapper(o.adresse || '')}" maxlength="240"></div>
  <div class="groupe"><label class="etiquette-champ" for="notesInternes">Notes internes <span class="facultatif">(jamais visibles par le client)</span></label><textarea class="zone" id="notesInternes" name="notesInternes" rows="3" maxlength="4000">${echapper(o.notesInternes || '')}</textarea></div>`;

export const nouveau = async (ctx, env) => {
  const sortie = ctx.sortie;
  titrePage('Nouveau client');
  filAriane([{ libelle: 'Clients', chemin: '/clients' }, { libelle: 'Nouveau client' }]);
  sortie.innerHTML = `<div class="page" style="max-width:760px">
    <div class="page-tete"><div><h1>Nouveau client</h1><p class="chapo">Une organisation, un contact principal. Le compte du contact est créé tout de suite, l'invitation part quand vous rattachez un projet.</p></div></div>
    <form class="forme carte" id="forme-org" novalidate>${formulaireOrganisation()}<div class="forme-pied"><a class="btn btn-secondaire" href="#/clients">Annuler</a><button class="btn btn-principal" type="submit">Créer le client</button></div></form></div>`;
  const forme = sortie.querySelector('#forme-org');
  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(forme, { entreprise: obligatoire(), nom: obligatoire(), email: (v) => obligatoire()(v) || emailValide()(v) })) return;
    await agir(forme.querySelector('[type="submit"]'), async () => {
      const r = await appelServeur('creerOrganisation', lireForme(forme));
      naviguer(`/clients/${r.id}`);
    }, 'Client créé.');
  });
  return () => {};
};

export const detail = async (ctx, env) => {
  const id = ctx.params.id;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const rendre = () => {
    const o = (magasin.lire(K.organisations) || []).find((x) => x.id === id);
    if (!magasin.chargee(K.organisations)) return;
    if (!o) { sortie.innerHTML = `<div class="page">${vide({ icone: 'entreprise', titre: 'Client introuvable', action: '<a class="btn btn-secondaire" href="#/clients">Retour</a>' })}</div>`; return; }
    const projets = (magasin.lire(K.projets) || []).filter((p) => p.organisation === id);
    const documents = (magasin.lire(K.documentsTous) || []).filter((d) => projets.some((p) => p.id === d.projet) && !d.archive).sort(parDateDesc('date'));
    const paiements = (magasin.lire(K.paiementsTous) || []).filter((p) => projets.some((x) => x.id === p.projet));
    const { total, factures } = resteAPayer(documents, paiements);
    const totalPaye = paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0);
    const contacts = o.contacts || [];
    titrePage(o.entreprise || o.nom);
    filAriane([{ libelle: 'Clients', chemin: '/clients' }, { libelle: o.entreprise || o.nom }]);
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div class="rang" style="gap:16px">${avatar(o.entreprise || o.nom, { taille: 'xl' })}<div><p class="surtitre">Client</p><h1 style="margin-top:2px">${echapper(o.entreprise || o.nom)}</h1><p class="t-petit t-2" style="margin-top:4px">${echapper([o.nom, o.email, o.telephone].filter(Boolean).join(' · '))}</p></div></div>
        <div class="actions"><button class="btn btn-secondaire" type="button" data-action="modifier">${icone('edit')} Modifier</button><a class="btn btn-principal" href="#/projets/nouveau?organisation=${echapper(id)}">${icone('plus')} Projet</a></div></div>
      <div class="metriques">${metrique(projets.filter((p) => !p.archive).length, 'Projets')}${metrique(montant(total), 'Reste dû', { ton: total > 0 ? 'ambre' : 'vert', nuance: factures.length ? pluriel(factures.length, 'facture') : '' })}${metrique(montant(totalPaye), 'Réglé au total')}${metrique(contacts.length, 'Contacts')}</div>
      <div class="grille grille-tiers section">
        <div class="pile" style="gap:var(--e-7)">
          <section><div class="section-tete"><h2>Projets</h2></div>${projets.length ? `<div class="liste">${projets.map((p) => ligne({ href: `#/projets/${echapper(p.id)}`, titre: `<span class="rang" style="gap:10px">${avatarProjet(p.nom, 'petit')} ${echapper(p.nom)}</span>`, sous: echapper(p.ref || ''), fin: pastille(STATUTS_PROJET, statutProjet(p)) })).join('')}</div>` : vide({ icone: 'projets', titre: 'Aucun projet', compact: true, action: `<a class="btn btn-secondaire" href="#/projets/nouveau?organisation=${echapper(id)}">Créer un projet</a>` })}</section>
          <section><div class="section-tete"><h2>Contacts et accès</h2><button class="btn btn-secondaire btn-petit" type="button" data-action="inviter">${icone('plus')} Ajouter un contact</button></div>
            ${contacts.length ? `<div class="liste">${contacts.map((c) => ligne({ titre: `<span class="rang" style="gap:10px">${avatar(c.nom || c.email)} ${echapper(c.nom || c.email)}</span>`, sous: `${echapper(c.email)}${c.role ? ` · ${echapper(c.role === 'owner' ? 'Responsable' : 'Collaborateur')}` : ''}${c.uid ? ' · compte ouvert' : ''}`, fin: `<button class="btn-icone" type="button" data-action="menu-contact" data-email="${echapper(c.email)}" aria-label="Actions">${icone('points')}</button>`, attrs: 'style="cursor:default"' })).join('')}</div>` : vide({ icone: 'utilisateurs', titre: 'Aucun contact', texte: 'Ajoutez les personnes qui doivent accéder aux projets.', compact: true })}
            <p class="t-micro t-3" style="margin-top:8px">Un contact ajouté est membre de tous les projets de ce client. Retirez-le pour fermer l'accès.</p></section>
          <section><div class="section-tete"><h2>Devis et factures</h2><a class="lien" href="#/finances">Finances</a></div>${documents.length ? `<div class="liste">${documents.slice(0, 12).map((d) => ligne({ href: `#/finances/${echapper(d.id)}`, icone: d.type === 'devis' ? 'receipt' : 'euro', titre: `${echapper(d.numero || '')} ${echapper(d.libelle || '')}`, sous: echapper(dateCourte(d.date)), fin: `<span class="nb t-fort">${echapper(montant(d.montant))}</span>${pastille(d.type === 'devis' ? STATUTS_DEVIS : STATUTS_FACTURE, d.statut, { equipe: true })}` })).join('')}</div>` : vide({ icone: 'receipt', titre: 'Aucune pièce', compact: true })}</section>
        </div>
        <aside class="pile" style="gap:var(--e-5)">
          <div class="carte carte--creuse"><p class="surtitre">Coordonnées</p><dl class="faits" style="margin-top:10px;grid-template-columns:1fr">${fait('Contact', echapper(o.nom || ''))}${fait('E-mail', echapper(o.email || ''))}${fait('Téléphone', echapper(o.telephone || ''))}${fait('Adresse', echapper(o.adresse || ''))}</dl></div>
          <div class="carte carte--creuse"><p class="surtitre">Notes internes</p><p class="t-petit" style="margin-top:8px;white-space:pre-wrap">${echapper(o.notesInternes || 'Aucune note.')}</p></div>
        </aside>
      </div></div>`;
  };
  const gestes = sur(sortie, 'click', '[data-action]', async (el) => {
    const o = (magasin.lire(K.organisations) || []).find((x) => x.id === id);
    if (!o) return;
    if (el.dataset.action === 'modifier') {
      const m = modale({ titre: 'Le client', feuille: true, corps: `<form class="forme" id="f-org" novalidate>${formulaireOrganisation(o)}</form>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-org">Enregistrer</button>' });
      m.el.querySelector('#f-org').addEventListener('submit', async (e) => { e.preventDefault(); if (!valider(e.target, { entreprise: obligatoire(), nom: obligatoire(), email: emailValide() })) return; if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('majOrganisation', { id, ...lireForme(e.target) }), 'Client mis à jour.')) m.fermer(true); });
    }
    if (el.dataset.action === 'inviter') {
      const m = modale({ titre: 'Ajouter un contact', sousTitre: 'Il reçoit une invitation et accède aux projets de ce client.', corps: `<form class="forme" id="f-inv" novalidate><div class="groupe"><label class="etiquette-champ" for="inv-nom">Nom</label><input class="champ" id="inv-nom" name="nom" maxlength="120"></div><div class="groupe"><label class="etiquette-champ" for="inv-email">E-mail</label><input class="champ" id="inv-email" name="email" type="email"></div><div class="groupe"><label class="etiquette-champ" for="inv-role">Rôle</label><select class="select" id="inv-role" name="role"><option value="member">Collaborateur</option><option value="owner">Responsable</option></select></div></form>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-inv">Inviter</button>' });
      m.el.querySelector('#f-inv').addEventListener('submit', async (e) => { e.preventDefault(); if (!valider(e.target, { nom: obligatoire(), email: (v) => obligatoire()(v) || emailValide()(v) })) return; if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('inviterMembreOrganisation', { id, ...lireForme(e.target) }), 'Invitation envoyée.')) m.fermer(true); });
    }
    if (el.dataset.action === 'menu-contact') {
      const email = el.dataset.email;
      menu(el, [{ libelle: 'Renvoyer l\'invitation', icone: 'mail', action: () => agir(null, () => appelServeur('inviterMembreOrganisation', { id, email, nom: ((o.contacts || []).find((c) => c.email === email) || {}).nom || '' }), 'Invitation renvoyée.') },
        '-', { libelle: 'Retirer l\'accès', icone: 'corbeille', danger: true, action: async () => { if (await confirmer({ titre: `Retirer ${email} ?`, texte: 'Cette personne perd l\'accès à tous les projets de ce client.', ok: 'Retirer', danger: true })) agir(null, () => appelServeur('retirerMembreOrganisation', { id, email }), 'Accès retiré.'); } }]);
    }
  });
  [K.organisations, K.projets, K.documentsTous, K.paiementsTous].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};

void toast;
