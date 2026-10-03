/* ==========================================================================
   Devis, factures, paiements : la vue du client. Il consulte, télécharge,
   accepte ou refuse un devis (avec un motif), pose une question, voit ce
   qui reste à payer et comment le régler, déclare un règlement.
   ========================================================================== */

import { echapper, dateCourte, dateHeure, dateISO, montant, montantHT, montantTTC, montantPiece, ttcDe, parDateDesc, joursAvant, avecLiens, STATUTS_DEVIS, STATUTS_FACTURE, FACTURES_DUES, MOYENS_PAIEMENT, PORTEES_DEVIS, estResponsable, devisADecider, devisExpire, statutPiece, peut } from '../noyau.js';
import { icone, pastille, ligne, vide, squelette, titrePage, modale, confirmer, toast, sur, agir, metrique, fait, encart, brancherPieces, depot, lireForme, valider, optionsDe, obligatoire } from '../ui.js';
import { dessinPhoto, estimationCourte } from '../panier.js';
import { appelServeur } from '../serveur.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, ecrire, resteAPayer } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { lienPiece } from '../noyau.js';
import { friseDevis, brancherFrise } from './frise.js';
import { telechargerPiece } from '../telecharger-piece.js';

/* Une case vide se lit avec un tiret, jamais avec rien. */
const TIRET = '-';

/* Les pièces d'un projet, telles que le magasin les a : le client sur sa
   clé, l'équipe en groupe. Sert à retrouver le devis d'où découle une
   facture. */
const piecesDe = (pid, documents = []) => [...documents, ...(magasin.lire(K.documents(pid)) || []), ...(magasin.lire(K.documentsTous) || [])]
  .filter((x, i, l) => x && l.findIndex((y) => y.id === x.id) === i);

/* Le lien vers une question sur un devis : la fiche de demande lit le
   type, le titre et le devis dans l'adresse. */
const lienQuestion = (d) => `#/projets/${encodeURIComponent(d.projet)}/nouvelle-demande?type=question&devis=${encodeURIComponent(d.id)}&titre=${encodeURIComponent(`Question sur le devis ${d.numero || ''}`.trim())}`;

/* « J'ai réglé cette facture » : date, moyen, référence, montant (le
   reste à payer, modifiable). Le client déclare, l'équipe confirme. */
const declarerReglement = (env, d, reste) => {
  const m = modale({
    titre: "J'ai réglé cette facture", sousTitre: `${d.numero || ''} · nous confirmons dès réception du règlement.`,
    corps: `<form class="forme" id="f-regl" novalidate>
      <div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="r-montant">Montant réglé (€ TTC)</label><input class="champ" id="r-montant" name="montant" type="number" min="0.01" step="0.01" value="${reste.toFixed(2)}"></div><div class="groupe"><label class="etiquette-champ" for="r-date">Réglé le</label><input class="champ" id="r-date" name="date" type="date" value="${dateISO(new Date())}" max="${dateISO(new Date())}"></div></div>
      <div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="r-moyen">Moyen</label><select class="select" id="r-moyen" name="moyen">${optionsDe(MOYENS_PAIEMENT, 'virement', { exclure: ['stripe'] })}</select></div><div class="groupe"><label class="etiquette-champ" for="r-ref">Référence <span class="facultatif">(facultatif)</span></label><input class="champ" id="r-ref" name="reference" maxlength="80" placeholder="Libellé ou numéro du virement"></div></div>
      <p class="aide">Cette déclaration nous prévient tout de suite. La facture reste « ${echapper((STATUTS_FACTURE[statutPiece(d)] || {}).libelle || '')} » jusqu'à ce que nous ayons enregistré le règlement.</p></form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><span class="pousse"></span><button class="btn btn-principal" type="submit" form="f-regl">Déclarer ce règlement</button>`,
  });
  m.el.querySelector('#f-regl').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(e.target, { montant: (v) => (v === null || v <= 0 ? 'Un montant est attendu.' : ''), date: (v) => (!v ? 'Une date est attendue.' : '') })) return;
    const r = lireForme(e.target);
    if (await agir(m.pied.querySelector('[type="submit"]'), () => ecrire.declarerReglement(env.session, d.id, r), 'Merci. Nous confirmons dès réception.')) m.fermer(true);
  });
  return m.fin;
};

/* Le refus d'un devis demande son motif : sans lui, l'équipe ne sait pas
   quoi ajuster, et le client a déjà cliqué une fois. */
const refuserDevis = (env, d, motifPropose = '') => {
  const m = modale({
    titre: `Refuser le devis ${d.numero || ''}`.trim(), sousTitre: 'Dites-nous ce qui coince : on peut ajuster, et revenir vers vous.',
    corps: `<form class="forme" id="f-refus" novalidate><div class="groupe"><label class="etiquette-champ" for="motif-refus">Le motif</label><textarea class="zone" id="motif-refus" name="motif" rows="4" maxlength="2000" placeholder="Trop cher, pas le bon périmètre, un délai qui ne convient pas…">${echapper(motifPropose)}</textarea></div></form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><span class="pousse"></span><button class="btn btn-danger" type="submit" form="f-refus">Refuser le devis</button>`,
  });
  m.el.querySelector('#f-refus').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(e.target, { motif: (v) => (!v ? 'Un motif est attendu : il part avec votre refus.' : '') })) return;
    const { motif } = lireForme(e.target);
    if (await agir(m.pied.querySelector('[type="submit"]'), () => ecrire.repondreDevis(env.session, d.id, 'refuse', motif), 'Devis refusé. Nous revenons vers vous.')) m.fermer(true);
  });
  return m.fin;
};

/* --- La demande de devis née du calculateur des axes ---------------------
   Une seule fiche, qui change d'état : « Devis demandé » (le client peut
   l'annuler), puis le vrai devis joint par l'équipe (« À votre
   décision »), puis accepté ou refusé comme tout devis. Tant qu'elle
   n'a pas de devis, elle s'ouvre ici, avec la photo du panier. */
export const estDemandePanier = (d) => Boolean(d) && d.type === 'devis' && (d.statut === 'demande' || (d.origine === 'panier' && d.statut === 'annule' && !d.numero));

/** « Joindre le devis » : le PDF fait ailleurs, son numéro, son montant ;
    la demande devient un devis à décider chez le client. */
export const joindreDevis = (d) => {
  const photo = d.photo || {};
  const m = modale({
    titre: 'Joindre le devis', sousTitre: `${(d.par || {}).nom || 'Le client'} · demande du ${dateCourte(d.date) || '-'}`, feuille: true,
    corps: `<form class="forme" id="f-joindre" novalidate>
      <div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="j-numero">Numéro</label><input class="champ" id="j-numero" name="numero" placeholder="D-2026-031"></div><div class="groupe"><label class="etiquette-champ" for="j-echeance">Valable jusqu'au</label><input class="champ" id="j-echeance" name="echeance" type="date"></div></div>
      <div class="groupe"><label class="etiquette-champ" for="j-libelle">Libellé</label><input class="champ" id="j-libelle" name="libelle" maxlength="160" value="${echapper(d.libelle || '')}"></div>
      <div class="forme-rang"><div class="groupe"><label class="etiquette-champ" for="j-montant">Montant HT (€)</label><input class="champ" id="j-montant" name="montant" type="number" min="0" step="0.01" value="${photo.periode && Number.isFinite(photo.periode.ht) ? photo.periode.ht : ''}"><p class="aide">L'estimation du client : ${echapper(estimationCourte(photo) || '-')}.</p></div><div class="groupe"><label class="etiquette-champ" for="j-tva">TVA (%)</label><input class="champ" id="j-tva" name="tva" type="number" min="0" step="0.1" value="${Number.isFinite(Number(d.tva)) ? Number(d.tva) : (photo && Number.isFinite(Number(photo.tva)) ? Number(photo.tva) : 0)}"><p class="aide">0 pour une auto-entreprise sans TVA.</p></div></div>
      <div class="groupe"><span class="etiquette-champ">Le PDF</span><div id="j-depot"></div></div></form>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-joindre">Joindre le devis</button>',
  });
  const forme = m.el.querySelector('#f-joindre');
  const boite = depot(m.el.querySelector('#j-depot'), { chemin: `projets/${d.projet}/pieces/${d.id}`, max: 1, texte: 'Déposez le <strong>PDF</strong>.', aide: '' });
  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(forme, { numero: obligatoire(), libelle: obligatoire(), montant: (v) => (v === null || v < 0 ? 'Un montant est attendu.' : '') })) return;
    if (boite.occupe) { toast('Attendez la fin de l\'envoi.', 'erreur'); return; }
    const v = lireForme(forme);
    const fichier = boite.pieces[0] || null;
    if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('joindreDevis', { id: d.id, numero: v.numero, libelle: v.libelle, montant: v.montant, tva: v.tva || 0, echeance: v.echeance || null, fichier }), 'Devis joint : le client peut l\'accepter.')) m.fermer(true);
  });
  return m.fin;
};

const ouvrirDemande = (d, env, { projets }) => {
  const equipe = env.role === 'equipe';
  const projet = projets.find((p) => p.id === d.projet) || {};
  const ouverte = d.statut === 'demande';
  const responsable = !equipe && estResponsable(env.session, projet.id ? projet : d.projet);
  const chiffrer = equipe && ouverte && peut(env.session, 'finance.gerer', d.projet);
  const m = modale({
    titre: equipe ? 'Demande de devis' : 'Devis demandé',
    sousTitre: `${projet.nom || ''} · ${equipe ? `${(d.par || {}).nom || 'le client'}, ` : ''}le ${dateCourte(d.date) || '-'}`,
    feuille: true,
    corps: `<div class="rang" style="margin-bottom:16px">${pastille(STATUTS_DEVIS, d.statut, { equipe })}</div>
      ${ouverte ? encart(equipe
    ? '<strong>À chiffrer.</strong> Le client a envoyé son calculateur. Faites le devis, puis « Joindre le devis » : il le reçoit ici, à accepter ou refuser.'
    : '<strong>Nous préparons votre devis.</strong> Il arrivera ici, à accepter ou refuser. Vous pouvez annuler la demande tant que nous n\'avons pas répondu.', 'info', 'receipt')
    : encart(`<strong>Demande annulée</strong>${d.annuleLe ? ` le ${echapper(dateHeure(d.annuleLe))}` : ''}.`, 'attention', 'info')}
      <div class="demande-photo"><p class="surtitre" style="margin-bottom:10px">${equipe ? 'Le calculateur du client' : 'Votre sélection'}, le ${echapper(dateCourte(d.date) || '-')}</p>${dessinPhoto(d.photo)}</div>`,
    pied: `${responsable && ouverte ? '<button class="btn btn-secondaire" type="button" data-annuler-demande>Annuler la demande</button>' : ''}<span class="pousse"></span><button class="btn ${chiffrer ? 'btn-secondaire' : 'btn-principal'}" type="button" data-fermer>Fermer</button>${chiffrer ? '<button class="btn btn-principal" type="button" data-joindre-devis>Joindre le devis</button>' : ''}`,
  });
  sur(m.el, 'click', '[data-annuler-demande]', async (el) => {
    if (!(await confirmer({ titre: 'Annuler cette demande ?', texte: 'Nous ne préparerons pas ce devis. Les axes restent sur leur page : vous pourrez en redemander un.', ok: 'Annuler la demande', annuler: 'Garder', danger: true }))) return;
    if (await agir(el, () => ecrire.annulerDemandeDevis(d.id), 'Demande annulée.')) m.fermer(true);
  });
  sur(m.el, 'click', '[data-joindre-devis]', async () => { m.fermer(); await joindreDevis(d); });
  return m.fin;
};

export const ouvrirDocument = (d, env, { projets, paiements, documents = [] }) => {
  if (estDemandePanier(d)) return ouvrirDemande(d, env, { projets });
  const equipe = env.role === 'equipe';
  const projet = projets.find((p) => p.id === d.projet) || {};
  const devis = d.type === 'devis';
  const carte = devis ? STATUTS_DEVIS : STATUTS_FACTURE;
  const payes = paiements.filter((p) => p.facture === d.id && p.statut !== 'annule');
  const totalPaye = payes.reduce((s, p) => s + (Number(p.montant) || 0), 0);
  const reste = Math.max(0, ttcDe(d) - totalPaye);
  /* Accepter un devis engage le client : seul le responsable du projet le
     peut. Les règles et le serveur le refusent aux autres ; l'écran ne
     leur propose donc pas le bouton. */
  const responsable = !equipe && estResponsable(env.session, projet.id ? projet : d.projet);
  const decidable = !equipe && responsable && devisADecider(d);
  const perime = devisExpire(d);
  const due = !devis && FACTURES_DUES.includes(d.statut);
  const etat = statutPiece(d);
  if (decidable && d.statut === 'envoye') ecrire.consulterDevis(d.id).catch(() => {});

  /* Le devis dont une facture découle, s'il est lisible d'ici. */
  const origine = !devis && d.devis ? (piecesDe(d.projet, documents).find((x) => x.id === d.devis) || null) : null;
  /* Le règlement déclaré par le client, confirmé ou en attente. */
  const declare = !devis && d.reglementDeclare ? d.reglementDeclare : null;
  const confirme = Boolean(declare && (declare.confirme || d.statut === 'payee'));
  const coordonnees = magasin.lire(K.reglages) || null;
  const avecIban = Boolean(coordonnees && coordonnees.iban);
  const ibanLisible = avecIban ? String(coordonnees.iban).replace(/(.{4})/g, '$1 ').trim() : '';

  const encartDeclaration = declare ? encart(confirme
    ? `<strong>Confirmé.</strong> Vous avez déclaré un règlement de ${echapper(montantTTC(declare.montant, 2))} le ${echapper(dateCourte(declare.date))}${declare.moyen ? ` par ${echapper((MOYENS_PAIEMENT[declare.moyen] || declare.moyen).toLowerCase())}` : ''} : nous l'avons enregistré.`
    : (equipe
      ? `<strong>Règlement déclaré par ${echapper(declare.nom || 'le client')}</strong> le ${echapper(dateHeure(declare.le || declare.date))} : ${echapper(montantTTC(declare.montant, 2))} · ${echapper(MOYENS_PAIEMENT[declare.moyen] || declare.moyen || TIRET)} · réf. ${echapper(declare.reference || TIRET)} · réglé le ${echapper(dateCourte(declare.date))}. En attente de votre confirmation : enregistrez le paiement dès réception.`
      : `<strong>Vous avez déclaré un règlement le ${echapper(dateCourte(declare.date))}</strong> · ${echapper(montantTTC(declare.montant, 2))}${declare.moyen ? ` par ${echapper((MOYENS_PAIEMENT[declare.moyen] || declare.moyen).toLowerCase())}` : ''}${declare.reference ? ` · réf. ${echapper(declare.reference)}` : ''} · en attente de confirmation. La facture reste « ${echapper((STATUTS_FACTURE[etat] || {}).libelle || '')} » jusqu'à ce que nous l'ayons enregistré.`),
  confirme ? 'ok' : 'info', confirme ? 'check' : 'paiement') : '';

  const encartReglement = !equipe && due ? (avecIban
    ? encart(`<strong>Pour régler :</strong> virement à ${echapper(coordonnees.titulaire || 'Capmedia Digital')}${coordonnees.banque ? ` (${echapper(coordonnees.banque)})` : ''}.<div class="rang" style="margin-top:8px;gap:10px;flex-wrap:wrap"><span class="t-mono" id="iban-texte">IBAN ${echapper(ibanLisible)}</span><button class="btn btn-petit btn-doux" type="button" data-copier-iban="${echapper(coordonnees.iban)}">${icone('copier')} Copier l'IBAN</button></div>${coordonnees.bic ? `<div class="t-mono" style="margin-top:4px">BIC ${echapper(coordonnees.bic)}</div>` : ''}${coordonnees.mention ? `<div style="margin-top:6px">${avecLiens(coordonnees.mention)}</div>` : ''}<div style="margin-top:6px">Mettez le numéro ${echapper(d.numero || 'de la facture')} en libellé, puis dites-nous « J'ai réglé cette facture » : nous confirmons dès réception. Un souci sur cette facture ? Ouvrez une demande, nous regardons.</div>`, 'info', 'paiement')
    : encart(`<strong>Pour régler :</strong> virement aux coordonnées indiquées sur la facture. Une fois le règlement parti, dites-le nous avec « J'ai réglé cette facture ». Un souci sur cette facture ? Ouvrez une demande, nous regardons.`, 'info', 'paiement')) : '';

  const m = modale({
    titre: `${devis ? 'Devis' : 'Facture'} ${d.numero || ''}`, sousTitre: `${d.libelle || ''} · ${projet.nom || ''}`, feuille: true,
    corps: `
      <div class="rang" style="margin-bottom:16px">${pastille(carte, etat, { equipe })}${devis ? `<span class="etiquette">${echapper((PORTEES_DEVIS[d.portee || 'initial'] || {}).libelle || '')}</span>` : ''}${d.echeance && due ? `<span class="puce puce--${joursAvant(d.echeance) < 0 ? 'rouge' : 'ambre'}"><i></i>Échéance ${echapper(dateCourte(d.echeance))}</span>` : ''}${devis && d.expiration && decidable ? `<span class="puce"><i></i>Valable jusqu'au ${echapper(dateCourte(d.expiration))}</span>` : ''}${perime ? `<span class="puce puce--rouge"><i></i>Validité dépassée le ${echapper(dateCourte(d.expiration))}</span>` : ''}${declare && !confirme ? '<span class="puce puce--bleu"><i></i>Règlement déclaré</span>' : ''}</div>
      ${perime && !equipe ? encart("<strong>Ce devis n'est plus valable.</strong> Sa date de validité est passée : il ne peut plus être accepté tel quel. Demandez-nous un devis à jour, nous vous le déposons ici.", 'attention', 'info') : ''}
      <div class="carte carte--creuse">
        <dl class="faits" style="grid-template-columns:repeat(3,1fr)">
          ${fait('Hors taxes', echapper(montant(d.montant, 2) || TIRET))}
          ${fait(`TVA${typeof d.tva === 'number' ? ` ${d.tva} %` : ''}`, echapper(montant(ttcDe(d) - (Number(d.montant) || 0), 2) || TIRET))}
          ${fait('TTC', `<strong>${echapper(montant(ttcDe(d), 2) || TIRET)}</strong>`)}
        </dl>
        ${!devis && (payes.length || due) ? `<dl class="faits" style="grid-template-columns:repeat(2,1fr);margin-top:14px;padding-top:14px;border-top:1px solid var(--trait)">${fait('Payé', echapper(montantTTC(totalPaye, 2) || `${montant(0, 2)} TTC`))}${fait('Reste à payer', `<strong style="color:${reste > 0 ? 'var(--attention)' : 'var(--ok)'}">${echapper(montantTTC(reste, 2) || `${montant(0, 2)} TTC`)}</strong>`)}</dl>` : ''}
      </div>
      ${origine ? `<p class="t-petit" style="margin-top:12px">${icone('receipt')} Découle du devis <a href="#/finances/${echapper(origine.id)}">${echapper(origine.numero || 'accepté')}</a>${origine.libelle ? ` · ${echapper(origine.libelle)}` : ''}.</p>` : (!devis && d.devis ? `<p class="t-petit" style="margin-top:12px">${icone('receipt')} Découle du devis <a href="#/finances/${echapper(d.devis)}">lié</a>.</p>` : '')}
      ${devis ? (() => {
        /* Les lignes du devis, à cocher. Pour l'équipe la lecture en groupe
           porte toutes les étapes ; le client n'a que celles de son projet. */
        const jalons = [...(magasin.lire(K.jalons(d.projet)) || []), ...(magasin.lire(K.jalonsTous) || []).filter((j) => (j.projet || j._parent) === d.projet)]
          .filter((j, i, l) => l.findIndex((y) => y.id === j.id) === i);
        const frise = friseDevis(d, jalons, { equipe, pid: d.projet });
        return frise
          ? `<div style="margin-top:20px">${frise}${equipe ? `<p class="t-micro t-3" style="margin-top:8px"><a href="#/projets/${echapper(d.projet)}/etapes">Gérer les étapes</a></p>` : ''}</div>`
          : (equipe ? `<p class="aide" style="margin-top:16px">Ce devis n'a pas encore ses lignes en étapes. <a href="#/projets/${echapper(d.projet)}/etapes">Posez-les dans la feuille de route</a>, avec ce devis en « ligne du devis » : le client les verra se cocher.</p>`
            : `<p class="aide" style="margin-top:16px">Le détail ligne par ligne est dans le PDF, qui fait foi. Ce qui est écrit ici en résume l'objet.</p>`);
      })() : ''}
      ${devis && d.photo ? `<details class="demande-photo"><summary class="t-petit">${equipe ? 'Le calculateur du client' : 'Votre sélection'}, le ${echapper(dateCourte(d.demandeLe || d.date) || '-')}</summary><div style="margin-top:12px">${dessinPhoto(d.photo)}</div></details>` : ''}
      <dl class="faits" style="margin-top:20px">${fait('Émis le', echapper(dateCourte(d.date) || TIRET))}${fait(devis ? 'Expire le' : 'Échéance', echapper(dateCourte(devis ? d.expiration : d.echeance) || TIRET))}${devis || d.description ? fait('Détail', d.description ? avecLiens(d.description) : echapper(TIRET)) : ''}</dl>
      ${d.reponse ? `<div style="margin-top:20px">${encart(`<strong>${d.statut === 'accepte' ? 'Accepté' : 'Refusé'}</strong> par ${echapper(d.reponse.nom || '')} le ${echapper(dateHeure(d.reponse.date))}${d.reponse.commentaire ? `<div style="margin-top:6px">${avecLiens(d.reponse.commentaire)}</div>` : ''}`, d.statut === 'accepte' ? 'ok' : 'attention', d.statut === 'accepte' ? 'check' : 'info')}</div>` : ''}
      ${(d.liens || []).length ? `<div style="margin-top:20px"><p class="surtitre">À consulter</p><div class="pile" style="margin-top:8px;gap:8px">${d.liens.map((l) => `<a class="lien-env" href="${echapper(l.url)}" target="_blank" rel="noopener"><span class="ligne-icone ligne-icone--bleu">${icone('externe')}</span><span style="min-width:0"><span class="t-corps-fort" style="display:block">${echapper(l.nom)}</span><span class="url" style="display:block">${echapper(l.url.replace(/^https?:\/\//, ''))}</span></span><span class="chevron" style="color:var(--encre-4)">${icone('externe')}</span></a>`).join('')}</div></div>` : ''}
      ${payes.length ? `<div style="margin-top:20px"><p class="surtitre">Paiements</p><div class="liste" style="margin-top:6px">${payes.map((p) => ligne({ icone: 'paiement', ton: 'vert', titre: echapper(montantTTC(p.montant, 2)), sous: `${echapper(dateCourte(p.date))} · ${echapper(MOYENS_PAIEMENT[p.moyen] || p.moyen || TIRET)}${p.reference ? ` · ${echapper(p.reference)}` : ''}` })).join('')}</div></div>` : ''}
      ${encartDeclaration ? `<div style="margin-top:20px">${encartDeclaration}</div>` : ''}
      ${decidable ? `${encart((d.portee || 'initial') === 'initial'
        ? "<strong>C'est le devis qui lance le projet.</strong> En l'acceptant, vous donnez le départ : le travail commence et vous suivez tout ici."
        : "<strong>C'est un devis complémentaire.</strong> Il s'ajoute à un projet déjà lancé, sans en changer le déroulé.", 'info', 'receipt')}
      <form id="forme-devis" class="forme" style="margin-top:24px" novalidate><div class="groupe"><label class="etiquette-champ" for="commentaire-devis">Un mot pour nous <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="commentaire-devis" rows="3" maxlength="2000"></textarea></div></form>` : ''}
      ${encartReglement ? `<div style="margin-top:20px">${encartReglement}</div>` : ''}`,
    pied: `${d.fichier && d.fichier.chemin ? `<button class="btn btn-secondaire" type="button" data-telecharger-piece>${icone('telecharger')} Télécharger le PDF</button>${equipe ? `<button class="btn btn-doux" type="button" data-joindre aria-label="Remplacer le PDF" data-astuce="Remplacer le PDF">${icone('trombone')}</button>` : ''}` : (equipe ? `<button class="btn btn-secondaire" type="button" data-joindre>${icone('trombone')} Joindre le PDF</button>` : '')}
      ${equipe ? `<button class="btn btn-doux" type="button" data-liens>${icone('liens')} Liens</button>` : ''}
      ${decidable ? `<button class="btn btn-secondaire" type="button" data-refuser>Refuser</button><a class="btn btn-doux" href="${lienQuestion(d)}">J'ai une question</a><span class="pousse"></span><button class="btn btn-doux" type="button" data-fermer>Fermer</button><button class="btn btn-ok" type="button" data-accepter>${icone('check')} Accepter le devis</button>`
      : !equipe ? `<span class="pousse"></span><a class="btn btn-doux" href="#/projets/${echapper(d.projet)}/nouvelle-demande?type=question">Poser une question</a>${responsable && due && !(declare && !confirme) ? `<button class="btn btn-secondaire" type="button" data-declarer>${icone('paiement')} J'ai réglé cette facture</button>` : ''}<button class="btn btn-principal" type="button" data-fermer>Fermer</button>`
      : `<span class="pousse"></span><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`}`,
  });
  brancherPieces(m.el);
  brancherFrise(m.el, env);
  sur(m.el, 'click', '[data-joindre]', async () => { m.fermer(); await joindreFichier(d); });
  /* Le PDF arrive par le serveur, qui vérifie qui demande : pas de
     nouvel onglet, pas de règle de stockage entre le client et sa pièce. */
  sur(m.el, 'click', '[data-telecharger-piece]', (el) => agir(el, () => telechargerPiece(d)));
  sur(m.el, 'click', '[data-liens]', async () => { m.fermer(); await editerLiens(d); });
  sur(m.el, 'click', '[data-copier-iban]', async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.copierIban); toast('IBAN copié.'); } catch (e) { toast("Le presse-papiers n'est pas accessible : recopiez l'IBAN à la main.", 'erreur'); }
  });
  sur(m.el, 'click', '[data-declarer]', async () => { if (await declarerReglement(env, d, reste)) m.fermer(true); });
  const commentaire = () => (m.el.querySelector('#commentaire-devis') || { value: '' }).value.trim();
  sur(m.el, 'click', '[data-accepter]', async (el) => {
    const ok = await confirmer({ titre: `Accepter le devis ${d.numero || ''} ?`, texte: `${montant(ttcDe(d), 2)} TTC. Votre acceptation vaut accord et est horodatée à votre nom.`, ok: "J'accepte" });
    if (!ok) return;
    /* « On lance » ne vaut que pour le devis qui lance le projet. */
    const merci = (d.portee || 'initial') === 'initial' ? 'Devis accepté. Merci, on lance.' : 'Devis accepté. Merci.';
    if (await agir(el, () => ecrire.repondreDevis(env.session, d.id, 'accepte', commentaire()), merci)) m.fermer(true);
  });
  sur(m.el, 'click', '[data-refuser]', async () => { if (await refuserDevis(env, d, commentaire())) m.fermer(true); });
  return m.fin;
};

/** Joindre le PDF d'une pièce déjà déposée. */
export const joindreFichier = (d) => {
  const m = modale({
    titre: `Le PDF de ${d.numero || (d.type === 'devis' ? 'ce devis' : 'cette facture')}`,
    sousTitre: 'Le client pourra le télécharger depuis son espace.',
    corps: '<div id="zone-pdf"></div>',
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-ok>Enregistrer</button>',
  });
  const boite = depot(m.el.querySelector('#zone-pdf'), { chemin: `projets/${d.projet}/pieces/${d.id}`, max: 1, texte: 'Déposez le <strong>PDF</strong>.', aide: '' });
  m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
    if (boite.occupe) { toast("Attendez la fin de l'envoi.", 'erreur'); return; }
    const f = boite.pieces[0];
    if (!f) { toast('Choisissez un fichier.', 'erreur'); return; }
    if (await agir(e.currentTarget, () => appelServeur('majDocument', { id: d.id, fichier: f }), 'PDF joint.')) m.fermer(true);
  });
  return m.fin;
};

/** Les liens d'une pièce : une proposition en ligne, un justificatif. */
export const editerLiens = (d) => {
  const liens = (d.liens || []).slice();
  const m = modale({
    titre: `Les liens de ${d.numero || 'cette pièce'}`,
    sousTitre: 'Une proposition en ligne, un détail, un justificatif. Le client les voit sur la pièce.',
    corps: '<form class="forme" id="f-liens" novalidate><div id="liste-liens" class="pile"></div><button class="btn btn-doux btn-petit" type="button" data-ajouter style="align-self:flex-start">Ajouter un lien</button></form>',
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-ok>Enregistrer</button>',
  });
  const zone = m.el.querySelector('#liste-liens');
  const rendre = () => {
    zone.innerHTML = liens.map((l, i) => `<div class="forme-rang" data-i="${i}"><input class="champ" name="nom" value="${echapper(l.nom || '')}" placeholder="Nom du lien"><div class="rang" style="gap:6px;flex-wrap:nowrap"><input class="champ" name="url" value="${echapper(l.url || '')}" placeholder="https://"><button class="btn-icone" type="button" data-retirer="${i}" aria-label="Retirer">${icone('fermer')}</button></div></div>`).join('')
      || '<p class="t-petit t-3">Aucun lien pour le moment.</p>';
  };
  const collecter = () => {
    const lignes = Array.from(zone.querySelectorAll('[data-i]'));
    liens.length = 0;
    lignes.forEach((r) => liens.push({ nom: r.querySelector('[name="nom"]').value.trim(), url: r.querySelector('[name="url"]').value.trim() }));
  };
  rendre();
  sur(m.el, 'click', '[data-ajouter]', () => { collecter(); liens.push({ nom: '', url: '' }); rendre(); });
  sur(m.el, 'click', '[data-retirer]', (el) => { collecter(); liens.splice(Number(el.dataset.retirer), 1); rendre(); });
  m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
    collecter();
    const propres = liens.filter((l) => l.url);
    const faux = propres.find((l) => !/^https?:\/\/\S+$/.test(l.url));
    if (faux) { toast('Une adresse commence par http:// ou https://.', 'erreur'); return; }
    if (await agir(e.currentTarget, () => appelServeur('majDocument', { id: d.id, liens: propres }), 'Liens enregistrés.')) m.fermer(true);
  });
  return m.fin;
};

/* La ligne d'une pièce comptable, la même ici et dans « Documents » :
   numéro, libellé, projet, date, puis trois colonnes fixes (Télécharger ou
   sa place vide, le montant, l'état). `detailHT` ajoute le hors taxes
   quand le montant affiché est TTC. */
export const lignePiece = (d, nomProjet, { detailHT = false } = {}) => {
  const etatPiece = statutPiece(d);
  const demande = estDemandePanier(d);
  const declare = d.type === 'facture' && d.reglementDeclare && !d.reglementDeclare.confirme && d.statut !== 'payee';
  const ttc = ttcDe(d);
  const ht = Number(d.montant);
  const avecHT = detailHT && Number.isFinite(ht) && d.montant !== null && d.montant !== undefined && d.montant !== '' && Math.abs(ttc - ht) > 0.004;
  return ligne({
    icone: d.type === 'devis' ? 'receipt' : 'euro', ton: d.type === 'devis' ? (devisADecider(d) ? 'ambre' : d.statut === 'accepte' ? 'vert' : '') : (etatPiece === 'en-retard' ? 'rouge' : FACTURES_DUES.includes(d.statut) ? 'ambre' : d.statut === 'payee' ? 'vert' : ''),
    titre: `${d.numero ? `<span class="t-mono t-3" style="font-weight:400">${echapper(d.numero)}</span> ` : ''}${echapper(d.libelle || '')}`,
    sous: `${echapper(nomProjet(d.projet) || TIRET)} · ${echapper(dateCourte(d.date) || TIRET)}${demande ? ' · estimation du calculateur' : ''}${avecHT ? ` · ${echapper(montantHT(ht, 2))}` : ''}${d.type === 'facture' && d.echeance && FACTURES_DUES.includes(d.statut) ? ` · échéance ${echapper(dateCourte(d.echeance))}` : ''}${declare ? ' · règlement déclaré, en attente de confirmation' : ''}`,
    /* Trois colonnes fixes, alignées d'une ligne à l'autre : le bouton
       Télécharger (ou sa place vide), le montant, le statut. */
    fin: `${(d.liens || []).length ? `<span class="puce puce--bleu"><i></i>${icone('externe')}</span>` : ''}<span class="piece-fin"><span class="piece-fin-voir">${d.fichier && d.fichier.chemin ? `<button class="btn btn-voir" type="button" data-telecharger="${echapper(d.id)}">${icone('telecharger')} Télécharger</button>` : ''}</span><span class="nb t-fort">${echapper((demande ? estimationCourte(d.photo) : montantPiece(d, 2)) || TIRET)}</span><span class="piece-fin-statut">${pastille(d.type === 'devis' ? STATUTS_DEVIS : STATUTS_FACTURE, etatPiece)}</span></span>`,
    action: 'ouvrir', attrs: `data-id="${echapper(d.id)}"`,
  });
};

/* Les gestes sur ces lignes : la ligne ouvre la fiche de la pièce,
   « Télécharger » remet le PDF par le serveur (suiviPiece), sans aperçu.
   Rend la fonction qui les débranche. */
export const brancherPiecesComptables = (racine, env) => {
  const { session } = env;
  const ouvrir = sur(racine, 'click', '[data-action="ouvrir"]', (el, ev) => {
    if (ev && ev.target.closest('[data-telecharger]')) return;
    const projets = magasin.lire(K.projets) || session.projets;
    const documents = agreger(session, G.documents);
    const d = documents.find((x) => x.id === el.dataset.id);
    if (d) ouvrirDocument(d, env, { projets, paiements: agreger(session, G.paiements), documents });
  });
  /* « Télécharger » dans la liste : le PDF, direct, sans passer par la fiche. */
  const telecharger = sur(racine, 'click', '[data-telecharger]', (el, ev) => {
    ev.stopPropagation();
    const d = agreger(session, G.documents).find((x) => x.id === el.dataset.telecharger);
    if (d) agir(el, () => telechargerPiece(d));
  });
  return () => { ouvrir(); telecharger(); };
};

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Devis et factures');
  filAriane([{ libelle: 'Devis et factures' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  let ouvert = ctx.params.did || null;
  /* Le filtre par projet, quand le client en a plusieurs. */
  /* Arrivé par l'arbre d'un projet (?projet=<p>) : ce projet seulement, le
     choix du projet se fait dans le rail. */
  const projetFixe = String((ctx.requete || {}).projet || '');
  const etat = { projet: projetFixe };

  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    /* La partie financière est au responsable du projet. Un collaborateur
       ne la lit pas (les règles la lui refusent) : on le lui dit plutôt
       que de lui montrer une page vide. */
    const miens = projets.filter((p) => estResponsable(session, p));
    if (!miens.length) {
      sortie.innerHTML = `<div class="page" style="max-width:720px">
        <div class="page-tete"><div><h1>Devis et factures</h1></div></div>
        ${encart("<strong>Réservé au responsable du projet.</strong> Les devis, les factures et les paiements sont suivis par la personne qui engage votre société auprès de Capmedia. Vous voyez tout le reste du projet.", 'info', 'cadenas')}
      </div>`;
      return;
    }
    if (etat.projet && !miens.some((p) => p.id === etat.projet)) etat.projet = '';
    const duProjet = (x) => !etat.projet || x.projet === etat.projet;
    /* Un brouillon est une réflexion de l'agence : il ne s'affiche pas. */
    /* Une demande de devis annulée avant toute réponse n'est plus rien pour
       le client : elle quitte la liste. */
    const tousDocuments = agreger(session, G.documents).filter((d) => !d.archive && d.statut !== 'brouillon' && !(estDemandePanier(d) && d.statut === 'annule'));
    const documents = tousDocuments.filter(duProjet);
    /* Un paiement annulé n'en est pas un : il ne se montre pas. */
    const paiements = agreger(session, G.paiements).filter((p) => p.statut !== 'annule').filter(duProjet);
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const devis = documents.filter((d) => d.type === 'devis').sort(parDateDesc('date'));
    const factures = documents.filter((d) => d.type === 'facture').sort(parDateDesc('date'));
    const { total: du, factures: dues } = resteAPayer(documents, paiements);
    const aDecider = devis.filter(devisADecider);
    /* Une seule liste : ce qui attend une décision est dans le bloc du
       haut, la section « Devis » garde les autres. */
    const autresDevis = devis.filter((d) => !devisADecider(d));
    /* Une annulée ou un avoir n'est pas une facture « émise ». */
    const emises = factures.filter((f) => !['annulee', 'avoir'].includes(f.statut));
    const totalPaye = paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0);

    const ligneDoc = (d) => lignePiece(d, nomProjet);

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Devis et factures</h1><p class="chapo">Tout ce qui a été émis pour vos projets. Un devis accepté ici vaut accord.</p></div>${miens.length > 1 && !projetFixe ? `<div class="actions"><label class="etiquette-champ" for="filtre-projet" style="margin:0">Projet</label><select class="select" id="filtre-projet" style="width:auto"><option value="">Tous vos projets</option>${miens.map((p) => `<option value="${echapper(p.id)}"${etat.projet === p.id ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select></div>` : ''}</div>
      <div class="metriques">
        ${metrique(montantTTC(du) || `${montant(0)} TTC`, 'Reste à payer', { ton: du > 0 ? 'ambre' : 'vert', nuance: dues.length ? `${dues.length} facture${dues.length > 1 ? 's' : ''}` : 'Rien en attente' })}
        ${metrique(aDecider.length, 'Devis à décider', { ton: aDecider.length ? 'ambre' : '' })}
        ${metrique(montantTTC(totalPaye) || `${montant(0)} TTC`, 'Réglé au total')}
        ${metrique(emises.length, 'Factures émises')}
      </div>
      ${aDecider.length ? `<section class="section"><div class="attente"><p class="attente-tete">${icone('receipt')} Devis en attente de votre décision</p><div class="liste" style="margin-top:8px">${aDecider.map(ligneDoc).join('')}</div></div></section>` : ''}
      <section class="section"><div class="section-tete"><h2>Factures</h2></div>${factures.length ? `<div class="liste">${factures.map(ligneDoc).join('')}</div>` : vide({ icone: 'euro', titre: 'Aucune facture', texte: "Elles apparaîtront ici dès qu'une sera émise, avec son échéance et comment la régler.", compact: true })}</section>
      <section class="section"><div class="section-tete"><h2>Devis</h2></div>${autresDevis.length ? `<div class="liste">${autresDevis.map(ligneDoc).join('')}</div>` : vide({ icone: 'receipt', titre: aDecider.length ? 'Aucun autre devis' : 'Aucun devis', texte: aDecider.length ? 'Ceux qui attendent votre décision sont juste au-dessus.' : "Ils apparaîtront ici dès qu'un vous sera proposé. Besoin d'un chiffrage ? Ouvrez une demande de devis depuis votre projet.", compact: true })}</section>
      <section class="section"><div class="section-tete"><h2>Paiements</h2></div>${paiements.length ? `<div class="liste">${paiements.slice().sort(parDateDesc('date')).map((p) => { const f = documents.find((d) => d.id === p.facture) || {}; return ligne({ icone: 'paiement', ton: 'vert', titre: echapper(montantTTC(p.montant, 2)), sous: `${echapper(dateCourte(p.date) || TIRET)} · ${echapper(MOYENS_PAIEMENT[p.moyen] || p.moyen || TIRET)}${f.numero ? ` · ${echapper(f.numero)}` : ''}${p.reference ? ` · ${echapper(p.reference)}` : ''}` }); }).join('')}</div>` : vide({ icone: 'paiement', titre: 'Aucun paiement', texte: 'Chaque règlement que nous enregistrons apparaîtra ici.', compact: true })}</section>
    </div>`;

    const filtre = sortie.querySelector('#filtre-projet');
    if (filtre) filtre.addEventListener('change', (e) => { etat.projet = e.target.value; rendre(); });

    if (ouvert) {
      const d = tousDocuments.find((x) => x.id === ouvert);
      if (d) {
        ouvert = null;
        ouvrirDocument(d, env, { projets, paiements: agreger(session, G.paiements), documents: tousDocuments }).then(() => naviguer(`/finances${projetFixe ? `?projet=${encodeURIComponent(projetFixe)}` : ''}`, { remplacer: true }));
      } else if (miens.every((p) => magasin.chargee(K.documents(p.id)))) {
        /* Tout est arrivé et la pièce n'y est pas : fermée, archivée ou
           inconnue. Le dire vaut mieux qu'une page qui ne réagit pas. */
        ouvert = null;
        toast("Cette pièce n'est pas disponible.", 'info');
        naviguer('/finances', { remplacer: true });
      }
    }
  };

  const gestes = brancherPiecesComptables(sortie, env);
  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là. */
  /* Un projet où le client n'est que collaborateur n'ouvre pas sa finance :
     sa clé n'arrive jamais, et le premier dessin l'attendait pour rien. */
  const cles = [K.projets, K.reglages, ...session.projets.filter((p) => estResponsable(session, p)).flatMap((p) => [K.documents(p.id), K.paiements(p.id)])];
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { planifier.arreter(); gestes(); lot.fin(); };
};

void toast; void lienPiece;
