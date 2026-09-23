/* ==========================================================================
   Devis, factures, paiements : la vue du client. Il consulte, télécharge,
   accepte ou refuse un devis, pose une question, voit ce qui reste à payer.
   ========================================================================== */

import { echapper, dateCourte, dateHeure, montant, parDateDesc, joursAvant, avecLiens, STATUTS_DEVIS, STATUTS_FACTURE, FACTURES_DUES, MOYENS_PAIEMENT, PORTEES_DEVIS } from '../noyau.js';
import { icone, pastille, ligne, vide, squelette, titrePage, modale, confirmer, toast, sur, agir, metrique, fait, encart, brancherPieces, depot } from '../ui.js';
import { appelServeur } from '../serveur.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, ecrire, resteAPayer } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { lienPiece } from '../noyau.js';
import { friseDevis, brancherFrise } from './frise.js';

const ttcDe = (d) => (typeof d.ttc === 'number' ? d.ttc : (typeof d.montant === 'number' ? d.montant * (1 + (Number(d.tva) || 0) / 100) : 0));

export const ouvrirDocument = (d, env, { projets, paiements }) => {
  const equipe = env.role === 'equipe';
  const projet = projets.find((p) => p.id === d.projet) || {};
  const devis = d.type === 'devis';
  const carte = devis ? STATUTS_DEVIS : STATUTS_FACTURE;
  const payes = paiements.filter((p) => p.facture === d.id && p.statut !== 'annule');
  const totalPaye = payes.reduce((s, p) => s + (Number(p.montant) || 0), 0);
  const reste = Math.max(0, ttcDe(d) - totalPaye);
  const decidable = !equipe && devis && ['envoye', 'consulte'].includes(d.statut);
  if (!equipe && devis && d.statut === 'envoye') ecrire.consulterDevis(d.id).catch(() => {});

  const m = modale({
    titre: `${devis ? 'Devis' : 'Facture'} ${d.numero || ''}`, sousTitre: `${d.libelle || ''} · ${projet.nom || ''}`, feuille: true,
    corps: `
      <div class="rang" style="margin-bottom:16px">${pastille(carte, d.statut, { equipe })}${devis ? `<span class="etiquette">${echapper((PORTEES_DEVIS[d.portee || 'initial'] || {}).libelle || '')}</span>` : ''}${d.echeance && !devis && FACTURES_DUES.includes(d.statut) ? `<span class="puce puce--${joursAvant(d.echeance) < 0 ? 'rouge' : 'ambre'}"><i></i>Échéance ${echapper(dateCourte(d.echeance))}</span>` : ''}${devis && d.expiration && decidable ? `<span class="puce"><i></i>Valable jusqu'au ${echapper(dateCourte(d.expiration))}</span>` : ''}</div>
      <div class="carte carte--creuse">
        <dl class="faits" style="grid-template-columns:repeat(3,1fr)">
          ${fait('Hors taxes', echapper(montant(d.montant, 2)))}
          ${fait(`TVA${typeof d.tva === 'number' ? ` ${d.tva} %` : ''}`, echapper(montant(ttcDe(d) - (Number(d.montant) || 0), 2)))}
          ${fait('TTC', `<strong>${echapper(montant(ttcDe(d), 2))}</strong>`)}
        </dl>
        ${!devis && (payes.length || FACTURES_DUES.includes(d.statut)) ? `<dl class="faits" style="grid-template-columns:repeat(2,1fr);margin-top:14px;padding-top:14px;border-top:1px solid var(--trait)">${fait('Payé', echapper(montant(totalPaye, 2)))}${fait('Reste à payer', `<strong style="color:${reste > 0 ? 'var(--attention)' : 'var(--ok)'}">${echapper(montant(reste, 2))}</strong>`)}</dl>` : ''}
      </div>
      ${devis ? (() => {
        /* Les lignes du devis, à cocher. Pour l'équipe la lecture en groupe
           porte toutes les étapes ; le client n'a que celles de son projet. */
        const jalons = [...(magasin.lire(K.jalons(d.projet)) || []), ...(magasin.lire(K.jalonsTous) || []).filter((j) => (j.projet || j._parent) === d.projet)]
          .filter((j, i, l) => l.findIndex((y) => y.id === j.id) === i);
        const frise = friseDevis(d, jalons, { equipe, pid: d.projet });
        return frise
          ? `<div style="margin-top:20px">${frise}${equipe ? `<p class="t-micro t-3" style="margin-top:8px"><a href="#/projets/${echapper(d.projet)}/etapes">Gérer les étapes</a></p>` : ''}</div>`
          : (equipe ? `<p class="aide" style="margin-top:16px">Ce devis n'a pas encore ses lignes en étapes. <a href="#/projets/${echapper(d.projet)}/etapes">Posez-les dans la feuille de route</a>, avec ce devis en « ligne du devis » : le client les verra se cocher.</p>` : '');
      })() : ''}
      <dl class="faits" style="margin-top:20px">${fait('Émis le', echapper(dateCourte(d.date)))}${fait(devis ? 'Expire le' : 'Échéance', echapper(dateCourte(devis ? d.expiration : d.echeance)))}${d.description ? fait('Détail', avecLiens(d.description)) : ''}</dl>
      ${d.reponse ? `<div style="margin-top:20px">${encart(`<strong>${d.statut === 'accepte' ? 'Accepté' : 'Refusé'}</strong> par ${echapper(d.reponse.nom || '')} le ${echapper(dateHeure(d.reponse.date))}${d.reponse.commentaire ? `<div style="margin-top:6px">${avecLiens(d.reponse.commentaire)}</div>` : ''}`, d.statut === 'accepte' ? 'ok' : 'attention', d.statut === 'accepte' ? 'check' : 'info')}</div>` : ''}
      ${(d.liens || []).length ? `<div style="margin-top:20px"><p class="surtitre">À consulter</p><div class="pile" style="margin-top:8px;gap:8px">${d.liens.map((l) => `<a class="lien-env" href="${echapper(l.url)}" target="_blank" rel="noopener"><span class="ligne-icone ligne-icone--bleu">${icone('externe')}</span><span style="min-width:0"><span class="t-corps-fort" style="display:block">${echapper(l.nom)}</span><span class="url" style="display:block">${echapper(l.url.replace(/^https?:\/\//, ''))}</span></span><span class="chevron" style="color:var(--encre-4)">${icone('externe')}</span></a>`).join('')}</div></div>` : ''}
      ${payes.length ? `<div style="margin-top:20px"><p class="surtitre">Paiements</p><div class="liste" style="margin-top:6px">${payes.map((p) => ligne({ icone: 'paiement', ton: 'vert', titre: echapper(montant(p.montant, 2)), sous: `${echapper(dateCourte(p.date))} · ${echapper(MOYENS_PAIEMENT[p.moyen] || p.moyen || '')}${p.reference ? ` · ${echapper(p.reference)}` : ''}` })).join('')}</div></div>` : ''}
      ${decidable ? `${encart((d.portee || 'initial') === 'initial'
        ? "<strong>C'est le devis qui lance le projet.</strong> En l'acceptant, vous donnez le départ : le travail commence et vous suivez tout ici."
        : "<strong>C'est un devis complémentaire.</strong> Il s'ajoute à un projet déjà lancé, sans en changer le déroulé.", 'info', 'receipt')}
      <form id="forme-devis" class="forme" style="margin-top:24px" novalidate><div class="groupe"><label class="etiquette-champ" for="commentaire-devis">Un mot pour nous <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="commentaire-devis" rows="3" maxlength="2000"></textarea></div></form>` : ''}
      ${!equipe && !devis && FACTURES_DUES.includes(d.statut) ? encart('<strong>Pour régler :</strong> virement aux coordonnées indiquées sur la facture. Le paiement en ligne arrivera prochainement. Un souci sur cette facture ? Ouvrez une demande, nous regardons.', 'info', 'paiement') : ''}`,
    pied: `${d.fichier && d.fichier.chemin ? `<button class="btn btn-secondaire" type="button" data-piece="${echapper(d.fichier.chemin)}">${icone('telecharger')} Télécharger le PDF</button>` : (equipe ? `<button class="btn btn-secondaire" type="button" data-joindre>${icone('trombone')} Joindre le PDF</button>` : '')}
      ${equipe ? `<button class="btn btn-doux" type="button" data-liens>${icone('liens')} Liens</button>` : ''}
      ${decidable ? `<button class="btn btn-secondaire" type="button" data-refuser>Refuser</button><span class="pousse"></span><button class="btn btn-ok" type="button" data-accepter>${icone('check')} Accepter le devis</button>`
      : !equipe ? `<span class="pousse"></span><a class="btn btn-doux" href="#/projets/${echapper(d.projet)}/nouvelle-demande?type=question">Poser une question</a><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`
      : `<span class="pousse"></span><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`}`,
  });
  brancherPieces(m.el);
  brancherFrise(m.el, env);
  sur(m.el, 'click', '[data-joindre]', async () => { m.fermer(); await joindreFichier(d); });
  sur(m.el, 'click', '[data-liens]', async () => { m.fermer(); await editerLiens(d); });
  const commentaire = () => (m.el.querySelector('#commentaire-devis') || { value: '' }).value.trim();
  sur(m.el, 'click', '[data-accepter]', async (el) => {
    const ok = await confirmer({ titre: `Accepter le devis ${d.numero || ''} ?`, texte: `${montant(ttcDe(d), 2)} TTC. Votre acceptation vaut accord et est horodatée à votre nom.`, ok: "J'accepte" });
    if (!ok) return;
    if (await agir(el, () => ecrire.repondreDevis(env.session, d.id, 'accepte', commentaire()), 'Devis accepté. Merci, on lance.')) m.fermer(true);
  });
  sur(m.el, 'click', '[data-refuser]', async (el) => {
    const ok = await confirmer({ titre: 'Refuser ce devis ?', texte: 'Dites-nous ce qui coince dans le commentaire, on peut ajuster.', ok: 'Refuser', danger: true });
    if (!ok) return;
    if (await agir(el, () => ecrire.repondreDevis(env.session, d.id, 'refuse', commentaire()), 'Devis refusé. Nous revenons vers vous.')) m.fermer(true);
  });
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
  const boite = depot(m.el.querySelector('#zone-pdf'), { chemin: `projets/${d.projet}/documents/${d.type}`, max: 1, texte: 'Déposez le <strong>PDF</strong>.', aide: '' });
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

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Devis et factures');
  filAriane([{ libelle: 'Devis et factures' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  let ouvert = ctx.params.did || null;

  const rendre = () => {
    const projets = magasin.lire(K.projets) || session.projets;
    /* Un brouillon est une réflexion de l'agence : il ne s'affiche pas. */
    const documents = agreger(session, G.documents).filter((d) => !d.archive && d.statut !== 'brouillon');
    const paiements = agreger(session, G.paiements);
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const devis = documents.filter((d) => d.type === 'devis').sort(parDateDesc('date'));
    const factures = documents.filter((d) => d.type === 'facture').sort(parDateDesc('date'));
    const { total: du, factures: dues } = resteAPayer(documents, paiements);
    const aDecider = devis.filter((d) => ['envoye', 'consulte'].includes(d.statut));
    const totalPaye = paiements.filter((p) => p.statut !== 'annule').reduce((s, p) => s + (Number(p.montant) || 0), 0);

    const ligneDoc = (d) => ligne({
      icone: d.type === 'devis' ? 'receipt' : 'euro', ton: d.type === 'devis' ? (['envoye', 'consulte'].includes(d.statut) ? 'ambre' : d.statut === 'accepte' ? 'vert' : '') : (d.statut === 'en-retard' ? 'rouge' : FACTURES_DUES.includes(d.statut) ? 'ambre' : d.statut === 'payee' ? 'vert' : ''),
      titre: `${d.numero ? `<span class="t-mono t-3" style="font-weight:400">${echapper(d.numero)}</span> ` : ''}${echapper(d.libelle || '')}`,
      sous: `${echapper(nomProjet(d.projet))} · ${echapper(dateCourte(d.date))}${d.type === 'facture' && d.echeance && FACTURES_DUES.includes(d.statut) ? ` · échéance ${echapper(dateCourte(d.echeance))}` : ''}`,
      fin: `${(d.liens || []).length ? `<span class="puce puce--bleu"><i></i>${icone('externe')}</span>` : ''}${d.fichier && d.fichier.chemin ? `<span class="puce t-3">${icone('telecharger')}</span>` : ''}<span class="nb t-fort">${echapper(montant(ttcDe(d), 0))}</span>${pastille(d.type === 'devis' ? STATUTS_DEVIS : STATUTS_FACTURE, d.statut)}`,
      action: 'ouvrir', attrs: `data-id="${echapper(d.id)}"`,
    });

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Devis et factures</h1><p class="chapo">Tout ce qui a été émis pour vos projets. Un devis accepté ici vaut accord.</p></div></div>
      <div class="metriques">
        ${metrique(montant(du), 'Reste à payer', { ton: du > 0 ? 'ambre' : 'vert', nuance: dues.length ? `${dues.length} facture${dues.length > 1 ? 's' : ''}` : 'Rien en attente' })}
        ${metrique(aDecider.length, 'Devis à décider', { ton: aDecider.length ? 'ambre' : '' })}
        ${metrique(montant(totalPaye), 'Réglé au total')}
        ${metrique(factures.length, 'Factures émises')}
      </div>
      ${aDecider.length ? `<section class="section"><div class="attente"><p class="attente-tete">${icone('receipt')} Devis en attente de votre décision</p><div class="liste" style="margin-top:8px">${aDecider.map(ligneDoc).join('')}</div></div></section>` : ''}
      <section class="section"><div class="section-tete"><h2>Factures</h2></div>${factures.length ? `<div class="liste">${factures.map(ligneDoc).join('')}</div>` : vide({ icone: 'euro', titre: 'Aucune facture', compact: true })}</section>
      <section class="section"><div class="section-tete"><h2>Devis</h2></div>${devis.length ? `<div class="liste">${devis.map(ligneDoc).join('')}</div>` : vide({ icone: 'receipt', titre: 'Aucun devis', compact: true })}</section>
      ${paiements.length ? `<section class="section"><div class="section-tete"><h2>Paiements</h2></div><div class="liste">${paiements.slice().sort(parDateDesc('date')).map((p) => { const f = documents.find((d) => d.id === p.facture) || {}; return ligne({ icone: 'paiement', ton: 'vert', titre: echapper(montant(p.montant, 2)), sous: `${echapper(dateCourte(p.date))} · ${echapper(MOYENS_PAIEMENT[p.moyen] || p.moyen || '')}${f.numero ? ` · ${echapper(f.numero)}` : ''}${p.reference ? ` · ${echapper(p.reference)}` : ''}` }); }).join('')}</div></section>` : ''}
    </div>`;

    if (ouvert) {
      const d = documents.find((x) => x.id === ouvert);
      ouvert = null;
      if (d) ouvrirDocument(d, env, { projets, paiements }).then(() => naviguer('/finances', { remplacer: true }));
    }
  };

  const gestes = sur(sortie, 'click', '[data-action="ouvrir"]', (el) => {
    const projets = magasin.lire(K.projets) || session.projets;
    const d = agreger(session, G.documents).find((x) => x.id === el.dataset.id);
    if (d) ouvrirDocument(d, env, { projets, paiements: agreger(session, G.paiements) });
  });
  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  [K.projets, ...session.projets.flatMap((p) => [K.documents(p.id), K.paiements(p.id)])].forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { clearTimeout(minuteur); gestes(); lot.fin(); };
};

void toast; void lienPiece;
