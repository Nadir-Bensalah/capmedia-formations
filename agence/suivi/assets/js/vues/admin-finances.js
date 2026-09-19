/* ==========================================================================
   Les finances côté équipe : déposer un devis ou une facture, suivre les
   statuts, enregistrer un paiement, voir ce qui reste dû.
   ========================================================================== */

import { echapper, dateCourte, dateISO, montant, pluriel, parDateDesc, joursAvant, STATUTS_DEVIS, STATUTS_FACTURE, FACTURES_DUES, MOYENS_PAIEMENT, age, retard } from '../noyau.js';
import { icone, pastille, ligne, vide, squelette, titrePage, sur, modale, toast, agir, lireForme, valider, obligatoire, optionsDe, depot, metrique, menu, confirmer } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, resteAPayer } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { appelServeur } from '../serveur.js';
import { ouvrirDocument, joindreFichier, editerLiens } from './finances.js';

const ttcDe = (d) => (typeof d.ttc === 'number' ? d.ttc : (Number(d.montant) || 0) * (1 + (Number(d.tva) || 0) / 100));

const deposer = (env, projets, type) => {
  const m = modale({
    titre: type === 'devis' ? 'Déposer un devis' : 'Déposer une facture', sousTitre: 'Le PDF part dans le stockage, la fiche est créée, le client est prévenu.', feuille: true,
    corps: `<form class="forme" id="f-doc" novalidate>
      <div class="groupe"><label class="etiquette-champ" for="d-projet">Projet</label><select class="select" id="d-projet" name="projet">${projets.map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom)}</option>`).join('')}</select></div>
      <div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="d-numero">Numéro</label><input class="champ" id="d-numero" name="numero" placeholder="${type === 'devis' ? 'D-2026-015' : 'F-2026-032'}"></div><div class="groupe"><label class="etiquette-champ" for="d-date">Date</label><input class="champ" id="d-date" name="date" type="date" value="${dateISO(new Date())}"></div></div>
      <div class="groupe"><label class="etiquette-champ" for="d-libelle">Libellé</label><input class="champ" id="d-libelle" name="libelle" maxlength="160" placeholder="Développement de la version 1.2"></div>
      <div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="d-montant">Montant HT (€)</label><input class="champ" id="d-montant" name="montant" type="number" min="0" step="0.01"></div><div class="groupe"><label class="etiquette-champ" for="d-tva">TVA (%)</label><input class="champ" id="d-tva" name="tva" type="number" min="0" step="0.1" value="0"><p class="aide">0 pour une auto-entreprise sans TVA.</p></div></div>
      <div class="groupe"><label class="etiquette-champ" for="d-echeance">${type === 'devis' ? 'Valable jusqu\'au' : 'Échéance de paiement'}</label><input class="champ" id="d-echeance" name="echeance" type="date"></div>
      <div class="groupe"><label class="etiquette-champ" for="d-desc">Détail <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="d-desc" name="description" rows="2" maxlength="2000"></textarea></div>
      <div class="groupe"><label class="etiquette-champ" for="d-lien">Lien <span class="facultatif">(facultatif)</span></label><input class="champ" id="d-lien" name="lien" type="url" placeholder="https://... proposition en ligne, détail, justificatif"></div>
      <div class="groupe"><span class="etiquette-champ">Le PDF</span><div id="d-depot"></div></div></form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-doc">Déposer</button>`,
  });
  const forme = m.el.querySelector('#f-doc');
  const sel = forme.querySelector('#d-projet');
  let boite = null;
  const rebrancher = () => { boite = depot(m.el.querySelector('#d-depot'), { chemin: `projets/${sel.value}/documents/${type}`, max: 1, texte: 'Déposez le <strong>PDF</strong>.', aide: '' }); };
  rebrancher(); sel.addEventListener('change', rebrancher);
  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(forme, { numero: obligatoire(), libelle: obligatoire(), montant: (v) => (v === null || v < 0 ? 'Un montant est attendu.' : '') })) return;
    if (boite.occupe) { toast('Attendez la fin de l\'envoi.', 'erreur'); return; }
    const d = lireForme(forme);
    const fichier = boite.pieces[0] || null;
    const liens = d.lien ? [{ nom: type === 'devis' ? 'La proposition en ligne' : 'Le justificatif', url: d.lien }] : [];
    if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('deposerDocument', { projet: d.projet, type, numero: d.numero, libelle: d.libelle, montant: d.montant, tva: d.tva || 0, echeance: d.echeance || null, date: d.date || null, description: d.description, fichier, liens }), `${type === 'devis' ? 'Devis' : 'Facture'} déposé.`)) m.fermer(true);
  });
};

const enregistrerPaiement = (env, facture, projets) => {
  const m = modale({
    titre: 'Enregistrer un paiement', sousTitre: `${facture.numero || ''} · ${(projets.find((p) => p.id === facture.projet) || {}).nom || ''}`,
    corps: `<form class="forme" id="f-pai" novalidate>
      <div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="p-montant">Montant (€ TTC)</label><input class="champ" id="p-montant" name="montant" type="number" min="0" step="0.01" value="${ttcDe(facture).toFixed(2)}"></div><div class="groupe"><label class="etiquette-champ" for="p-date">Date</label><input class="champ" id="p-date" name="date" type="date" value="${dateISO(new Date())}"></div></div>
      <div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="p-moyen">Moyen</label><select class="select" id="p-moyen" name="moyen">${optionsDe(MOYENS_PAIEMENT, 'virement')}</select></div><div class="groupe"><label class="etiquette-champ" for="p-ref">Référence <span class="facultatif">(facultatif)</span></label><input class="champ" id="p-ref" name="reference" maxlength="80"></div></div>
      <div class="groupe"><label class="etiquette-champ" for="p-note">Note <span class="facultatif">(interne)</span></label><input class="champ" id="p-note" name="note" maxlength="200"></div></form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-pai">Enregistrer</button>`,
  });
  m.el.querySelector('#f-pai').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(e.target, { montant: (v) => (v === null || v <= 0 ? 'Un montant est attendu.' : '') })) return;
    const d = lireForme(e.target);
    if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('enregistrerPaiement', { facture: facture.id, projet: facture.projet, ...d }), 'Paiement enregistré.')) m.fermer(true);
  });
};

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Finances');
  filAriane([{ libelle: 'Finances' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;
  const etat = { onglet: 'factures', projet: '' };
  let ouvert = ctx.params.did || null;

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const documents = (magasin.lire(K.documentsTous) || []).filter((d) => !d.archive && (!etat.projet || d.projet === etat.projet));
    const paiements = (magasin.lire(K.paiementsTous) || []).filter((p) => !etat.projet || p.projet === etat.projet);
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const factures = documents.filter((d) => d.type === 'facture').sort(parDateDesc('date'));
    const devis = documents.filter((d) => d.type === 'devis').sort(parDateDesc('date'));
    const { total: impaye, factures: dues } = resteAPayer(documents, paiements);
    const annee = new Date().getFullYear();
    const factureAnnee = factures.filter((d) => !['brouillon', 'annulee', 'avoir'].includes(d.statut) && d.date && (d.date.toDate ? d.date.toDate() : new Date(d.date)).getFullYear() === annee).reduce((s, d) => s + (Number(d.montant) || 0), 0);
    const encaisse = paiements.filter((p) => p.date && (p.date.toDate ? p.date.toDate() : new Date(p.date)).getFullYear() === annee).reduce((s, p) => s + (Number(p.montant) || 0), 0);
    const enRetardNonMarquees = factures.filter((d) => d.statut === 'a-payer' && d.echeance && joursAvant(d.echeance) < 0);

    const ligneDoc = (d) => ligne({ icone: d.type === 'devis' ? 'receipt' : 'euro', ton: d.type === 'devis' ? (['envoye', 'consulte'].includes(d.statut) ? 'ambre' : d.statut === 'accepte' ? 'vert' : '') : (d.statut === 'en-retard' || (d.statut === 'a-payer' && d.echeance && joursAvant(d.echeance) < 0) ? 'rouge' : FACTURES_DUES.includes(d.statut) ? 'ambre' : d.statut === 'payee' ? 'vert' : ''),
      titre: `<span class="t-mono t-3" style="font-weight:400">${echapper(d.numero || '')}</span> ${echapper(d.libelle || '')}`, sous: `${echapper(nomProjet(d.projet))} · ${echapper(dateCourte(d.date))}${d.echeance ? ` · ${retard(d.echeance) && d.statut !== 'payee' ? `en retard de ${echapper(retard(d.echeance))}` : `${d.type === 'devis' ? 'expire' : 'échéance'} ${echapper(dateCourte(d.echeance))}`}` : ''}${['envoye', 'consulte'].includes(d.statut) ? ` · envoyé il y a ${echapper(age(d.date))}` : ''}`,
      fin: `${d.fichier && d.fichier.chemin ? '' : '<span class="etiquette" title="Le client ne peut rien télécharger">Sans PDF</span>'}${(d.liens || []).length ? `<span class="puce puce--bleu"><i></i>${d.liens.length} lien${d.liens.length > 1 ? 's' : ''}</span>` : ''}<span class="nb t-fort">${echapper(montant(ttcDe(d)))}</span>${pastille(d.type === 'devis' ? STATUTS_DEVIS : STATUTS_FACTURE, d.statut, { equipe: true })}<button class="btn-icone" type="button" data-menu-doc="${echapper(d.id)}" aria-label="Actions">${icone('points')}</button>`, action: 'ouvrir', attrs: `data-id="${echapper(d.id)}"` });

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Finances</h1><p class="chapo">Devis, factures et paiements de tous les projets.</p></div><div class="actions"><select class="select" id="f-projet" style="width:auto"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select><button class="btn btn-secondaire" type="button" data-deposer="devis">${icone('receipt')} Devis</button><button class="btn btn-principal" type="button" data-deposer="facture">${icone('euro')} Facture</button></div></div>
      <div class="metriques">${metrique(montant(impaye), 'Impayé', { ton: impaye > 0 ? 'ambre' : 'vert', nuance: dues.length ? pluriel(dues.length, 'facture') : '' })}${metrique(montant(factureAnnee), `Facturé HT ${annee}`)}${metrique(montant(encaisse), `Encaissé ${annee}`, { ton: 'vert' })}${metrique(devis.filter((d) => ['envoye', 'consulte'].includes(d.statut)).length, 'Devis en attente')}</div>
      ${enRetardNonMarquees.length ? `<div class="encart encart--attention" style="margin-top:16px">${icone('alerte')}<div>${pluriel(enRetardNonMarquees.length, 'facture a dépassé son échéance', 'factures ont dépassé leur échéance')} sans être marquée${enRetardNonMarquees.length > 1 ? 's' : ''} en retard. <button class="btn btn-petit btn-doux" type="button" data-marquer-retard style="margin-left:8px">Marquer en retard</button></div></div>` : ''}
      <div class="onglets" style="margin-top:24px">${[['factures', 'Factures', factures.length], ['devis', 'Devis', devis.length], ['paiements', 'Paiements', paiements.length]].map(([c, l, n]) => `<button class="onglet${etat.onglet === c ? ' actif' : ''}" type="button" data-onglet="${c}">${l}<span class="badge">${n}</span></button>`).join('')}</div>
      ${etat.onglet === 'factures' ? (factures.length ? `<div class="liste">${factures.map(ligneDoc).join('')}</div>` : vide({ icone: 'euro', titre: 'Aucune facture', compact: true }))
      : etat.onglet === 'devis' ? (devis.length ? `<div class="liste">${devis.map(ligneDoc).join('')}</div>` : vide({ icone: 'receipt', titre: 'Aucun devis', compact: true }))
      : (paiements.length ? `<div class="liste">${paiements.slice().sort(parDateDesc('date')).map((p) => { const f = documents.find((d) => d.id === p.facture) || {}; return ligne({ icone: 'paiement', ton: 'vert', titre: echapper(montant(p.montant, 2)), sous: `${echapper(dateCourte(p.date))} · ${echapper(MOYENS_PAIEMENT[p.moyen] || p.moyen || '')} · ${echapper(f.numero || '')} · ${echapper(nomProjet(p.projet))}${p.reference ? ` · ${echapper(p.reference)}` : ''}${p.note ? ` · ${echapper(p.note)}` : ''}` }); }).join('')}</div>` : vide({ icone: 'paiement', titre: 'Aucun paiement', compact: true }))}
    </div>`;
    sortie.querySelector('#f-projet').addEventListener('change', (e) => { etat.projet = e.target.value; rendre(); });
    if (ouvert) { const d = documents.find((x) => x.id === ouvert); ouvert = null; if (d) ouvrirDocument(d, env, { projets, paiements }).then(() => naviguer('/finances', { remplacer: true })); }
  };

  const gestes = sur(sortie, 'click', '[data-onglet], [data-deposer], [data-action="ouvrir"], [data-menu-doc], [data-marquer-retard]', async (el, ev) => {
    const projets = magasin.lire(K.projets) || [];
    const documents = magasin.lire(K.documentsTous) || [];
    if (el.dataset.onglet) { etat.onglet = el.dataset.onglet; rendre(); return; }
    if (el.dataset.deposer) { if (!projets.length) { toast('Créez d\'abord un projet.', 'erreur'); return; } deposer(env, projets, el.dataset.deposer); return; }
    if (el.hasAttribute('data-marquer-retard')) {
      const retard = documents.filter((d) => d.type === 'facture' && d.statut === 'a-payer' && d.echeance && joursAvant(d.echeance) < 0);
      await agir(el, async () => { for (const d of retard) await appelServeur('statutFacture', { id: d.id, statut: 'en-retard' }); }, 'Factures marquées en retard.');
      return;
    }
    if (el.dataset.menuDoc) {
      ev.stopPropagation();
      const d = documents.find((x) => x.id === el.dataset.menuDoc);
      if (!d) return;
      const items = d.type === 'facture'
        ? [{ libelle: 'Enregistrer un paiement', icone: 'paiement', action: () => enregistrerPaiement(env, d, projets) }, { titre: 'Statut' }, ...['envoyee', 'a-payer', 'partielle', 'payee', 'en-retard', 'annulee'].map((s) => ({ libelle: STATUTS_FACTURE[s].libelle, cle: `s-${s}`, action: () => agir(null, () => appelServeur('statutFacture', { id: d.id, statut: s }), 'Statut mis à jour.') }))]
        : [{ titre: 'Statut' }, ...['envoye', 'accepte', 'refuse', 'expire', 'annule'].map((s) => ({ libelle: STATUTS_DEVIS[s].equipe || STATUTS_DEVIS[s].libelle, cle: `s-${s}`, action: () => agir(null, () => appelServeur('statutDevis', { id: d.id, statut: s }), 'Statut mis à jour.') }))];
      items.unshift(
        { libelle: d.fichier && d.fichier.chemin ? 'Remplacer le PDF' : 'Joindre le PDF', icone: 'trombone', action: () => joindreFichier(d) },
        { libelle: (d.liens || []).length ? `Liens (${d.liens.length})` : 'Ajouter un lien', icone: 'liens', action: () => editerLiens(d) },
        '-',
      );
      items.push('-', { libelle: 'Archiver', icone: 'archive', danger: true, action: async () => { if (await confirmer({ titre: 'Archiver cette pièce ?', texte: 'Elle reste consultable dans les archives.', ok: 'Archiver' })) agir(null, () => appelServeur('archiverDocument', { id: d.id, archive: true }), 'Pièce archivée.'); } });
      menu(el, items);
      return;
    }
    const d = documents.find((x) => x.id === el.dataset.id);
    if (d) ouvrirDocument(d, env, { projets, paiements: magasin.lire(K.paiementsTous) || [] });
  });
  [K.projets, K.documentsTous, K.paiementsTous].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};
