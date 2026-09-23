/* ==========================================================================
   LA MAINTENANCE CONTINUE

   Une application livrée n'est pas finie : les systèmes changent, les
   défauts se découvrent à l'usage, et le client a des idées. Le forfait de
   maintenance, c'est un nombre de jours par période, des modalités
   écrites, et tout ce qu'on en fait, jour par jour.

   La même page sert aux deux côtés. Le client demande un forfait, lit ses
   modalités, suit les séquences et les jours travaillés, propose des
   évolutions. L'équipe configure tout le reste : le forfait lui-même, les
   séquences, les journées, et le sort de chaque évolution.

   Tout ce que l'équipe écrit ici, le client le voit dans la minute.
   ========================================================================== */

import {
  echapper, dateCourte, dateHeure, montant, pluriel, enDate, joursAvant, joursEnClair,
  STATUTS_MAINTENANCE, RECONDUCTIONS_MAINTENANCE, ETAPES_FORFAIT, STATUTS_SEQUENCE, STATUTS_JOURNEE, STATUTS_EVOLUTION,
} from '../noyau.js';
import {
  icone, pastille, ligne, vide, squelette, titrePage, sur, modale, toast, agir, menu, fait,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire } from '../donnees.js';
import { editer } from './editeurs.js';
import { filAriane } from '../coquille.js';
import { friseDevis, brancherFrise } from './frise.js';

const lire = (ctx, cle, defaut) => (ctx.requete && ctx.requete[cle]) || defaut;

const poser = (cles) => {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  Object.entries(cles).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
  const chaine = p.toString();
  location.hash = `/maintenance${chaine ? `?${chaine}` : ''}`;
};

/* --------------------------------------------------------------------------
   Ce qu'on lit
   -------------------------------------------------------------------------- */

const projetDe = (x) => x.projet || x._parent || '';

const lireTout = (env) => {
  const equipe = env.role === 'equipe';
  const projets = (magasin.lire(K.projets) || []).filter((p) => !p.archive);
  const rassembler = (globale, parProjet) => (equipe
    ? (magasin.lire(globale) || [])
    : projets.flatMap((p) => (magasin.lire(parProjet(p.id)) || []).map((x) => ({ ...x, projet: x.projet || p.id }))));
  return {
    projets,
    maintenance: rassembler(K.maintenanceToute, K.maintenance),
    documents: rassembler(K.documentsTous, K.documents),
    jalons: rassembler(K.jalonsTous, K.jalons),
  };
};

/* Le dossier d'un projet : le contrat, et ce qui vit autour. Les séquences
   en cours d'abord, puis les prochaines, puis les closes ; les journées de
   la plus récente à la plus ancienne ; les évolutions par sort, ce qui
   attend une décision en tête. */
const dossier = (d, pid) => {
  const tout = d.maintenance.filter((x) => projetDe(x) === pid);
  const genre = (g) => tout.filter((x) => x.genre === g);
  const contrat = tout.find((x) => x.id === 'contrat') || null;
  const sequences = genre('sequence').sort((a, b) => ((STATUTS_SEQUENCE[a.statut] || {}).ordre || 9) - ((STATUTS_SEQUENCE[b.statut] || {}).ordre || 9) || (enDate(b.debut) || 0) - (enDate(a.debut) || 0));
  const journees = genre('journee').sort((a, b) => (enDate(b.date) || 0) - (enDate(a.date) || 0));
  const evolutions = genre('evolution').sort((a, b) => ((STATUTS_EVOLUTION[a.statut] || {}).ordre || 9) - ((STATUTS_EVOLUTION[b.statut] || {}).ordre || 9) || (enDate(b.maj) || 0) - (enDate(a.maj) || 0));
  const devis = contrat && contrat.devis ? d.documents.find((x) => x.id === contrat.devis && x.projet === pid) : null;
  const jalons = d.jalons.filter((j) => projetDe(j) === pid);
  return { contrat, sequences, journees, evolutions, devis, jalons };
};

const joursFaits = (journees, sequence) => journees
  .filter((j) => (!sequence || j.sequence === sequence.id) && j.statut === 'faite')
  .reduce((n, j) => n + (Number(j.duree) || 0), 0);

const enClair = (n) => (Number.isInteger(Number(n)) ? String(Number(n) || 0) : String(Number(n) || 0).replace('.', ','));

/* --------------------------------------------------------------------------
   Ce que chaque section veut dire, pour quelqu'un qui n'a jamais eu de
   contrat de maintenance
   -------------------------------------------------------------------------- */

const EXPLICATIONS = {
  'forfait': { titre: 'Le forfait de maintenance', corps: `
    <p>Une application livrée n'est pas finie. Les téléphones changent de système chaque année, les boutiques d'applications changent leurs règles, des défauts se découvrent à l'usage, et vous avez des idées en la voyant vivre.</p>
    <p>Le forfait, c'est un <b>nombre de jours de travail par période</b>, réservés pour votre application, à un prix fixe. Ces jours servent aux corrections, aux mises à jour, à la surveillance, et aux petites évolutions.</p>
    <p>Il passe par quatre pas : vous le <b>demandez</b>, nous envoyons une <b>proposition</b> avec les modalités et un devis, vous <b>acceptez le devis</b>, et le forfait <b>tourne</b>. Chaque pas est coché ici, dans l'ordre.</p>` },
  'modalites': { titre: 'Les modalités', corps: `
    <p>Ce qui est écrit noir sur blanc : les jours et heures où nous répondons, le délai pour vous répondre, le délai pour corriger un défaut qui bloque tout, ce qui est <b>compris</b> dans les jours du forfait, et ce qui ne l'est <b>pas</b> et passe par un devis à part.</p>
    <p>Quand un devis est rattaché au forfait, ses lignes apparaissent en dessous, et se cochent à mesure qu'elles sont faites.</p>` },
  'sequences': { titre: 'Les séquences', corps: `
    <p>Une séquence, c'est une période du forfait : le plus souvent un mois. Elle a un nombre de jours prévus, et la jauge montre combien ont été travaillés.</p>
    <p>Elle passe par trois états : <b>à venir</b>, <b>en cours</b>, puis <b>close</b> quand la période est finie. Les jours non consommés suivent la règle écrite dans les modalités.</p>` },
  'journal': { titre: 'Les jours de travail', corps: `
    <p>Chaque jour travaillé sur votre application est noté ici, avec la date, la durée (une journée, une demi-journée, un quart) et ce qui a été fait, en une phrase.</p>
    <p>Une journée <b>prévue</b> est posée dans le calendrier. Une journée <b>faite</b> est passée, et compte dans la séquence.</p>` },
  'evolutions': { titre: 'Les évolutions', corps: `
    <p>Une évolution, c'est quelque chose qu'on ajoute ou qu'on change dans l'application, en dehors des corrections : un nouvel écran, une option, un export.</p>
    <p>Vous pouvez en proposer une à tout moment. Elle est d'abord <b>proposée</b>, puis <b>acceptée</b> ou <b>écartée</b> avec une raison, puis <b>planifiée</b> dans une séquence, et enfin <b>livrée</b> dans une version de l'application.</p>
    <p>Une évolution qui tient dans les jours du forfait y passe. Une plus grosse fait l'objet d'un devis à part : c'est dit dans les modalités.</p>` },
};

const infoBouton = (cle) => `<button class="btn-info" type="button" data-info="${echapper(cle)}" aria-label="Qu'est-ce que c'est ?" data-astuce="Qu'est-ce que c'est ?">${icone('info')}</button>`;

/* --------------------------------------------------------------------------
   Les morceaux de la page
   -------------------------------------------------------------------------- */

const etage = (id, surtitre, resume, corps) => `<div class="etage" id="${echapper(id)}">
  <div class="etage-tete"><span class="etage-sur">${echapper(surtitre)}</span><p class="etage-resume">${resume}</p></div>
  ${corps}
</div>`;

const periodeDe = (contrat) => (RECONDUCTIONS_MAINTENANCE[(contrat || {}).reconduction] || RECONDUCTIONS_MAINTENANCE.mensuelle).periode;

/* Les quatre pas du forfait, cochés d'après son état. Rien à cocher à la
   main : c'est l'état qui coche. */
const friseForfait = (contrat, devis) => {
  const statut = contrat.statut || 'demande';
  const apres = (cles) => cles.includes(statut);
  const faits = {
    demande: true,
    proposition: apres(['proposition', 'actif', 'suspendu', 'termine']),
    accord: (devis && devis.statut === 'accepte') || apres(['actif', 'suspendu', 'termine']),
    actif: apres(['actif', 'termine']),
  };
  const n = Object.values(faits).filter(Boolean).length;
  const pct = Math.round((n / ETAPES_FORFAIT.length) * 100);
  return `<div class="frise" id="pas-forfait">
    <div class="frise-tete">
      <div>
        <p class="frise-titre">Où en est le forfait</p>
        <p class="frise-sous"><b>${n} / ${ETAPES_FORFAIT.length}</b> ${n > 1 ? 'pas faits' : 'pas fait'}</p>
      </div>
      <span class="frise-pct">${pct} %</span>
    </div>
    <div class="frise-jauge" role="img" aria-label="${pct} % des pas faits"><i style="width:${pct}%"></i></div>
    <ol class="frise-etapes">${ETAPES_FORFAIT.map((e, i) => {
      const fait = faits[e.cle];
      const enCours = !fait && ETAPES_FORFAIT.slice(0, i).every((x) => faits[x.cle]);
      return `<li class="frise-etape${fait ? ' est-faite' : ''}${enCours ? ' est-en-cours' : ''}" data-pas="${echapper(e.cle)}">
        <span class="frise-coche" aria-hidden="true">${fait ? icone('check') : ''}</span>
        <span class="frise-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="frise-corps"><span class="frise-libelle">${echapper(e.libelle)}</span><span class="frise-detail">${echapper(e.detail)}</span></span>
        <span class="frise-fin">${fait ? '<span class="puce puce--vert"><i></i>Fait</span>' : enCours ? '<span class="puce puce--bleu"><i></i>Maintenant</span>' : ''}</span>
      </li>`;
    }).join('')}</ol>
  </div>`;
};

/* La carte du forfait : ce qu'il est, en quatre chiffres. */
const carteForfait = (contrat, { equipe, pid, sequences, journees, evolutions }) => {
  const periode = periodeDe(contrat);
  const enCours = sequences.find((x) => x.statut === 'en-cours');
  const faits = enCours ? joursFaits(journees, enCours) : joursFaits(journees);
  const prevus = enCours ? (Number(enCours.jours) || Number(contrat.jours) || 0) : (Number(contrat.jours) || 0);
  const livrees = evolutions.filter((e) => e.statut === 'livree').length;
  return `<div class="forfait" id="forfait">
    <div class="forfait-tete">
      <div>
        <h3 class="forfait-titre">${echapper(contrat.formule || 'Forfait de maintenance')}</h3>
        <p class="forfait-sous">${[
          contrat.debut ? `depuis le <b>${echapper(dateCourte(contrat.debut))}</b>` : '',
          contrat.fin ? `${contrat.statut === 'termine' ? 'jusqu\'au' : 'prochaine échéance le'} <b>${echapper(dateCourte(contrat.fin))}</b>` : '',
          contrat.reconduction ? `reconduit ${echapper((RECONDUCTIONS_MAINTENANCE[contrat.reconduction] || {}).libelle || '').toLowerCase()}` : '',
        ].filter(Boolean).join(' · ') || 'Les dates seront précisées avec la proposition.'}</p>
      </div>
      <div class="forfait-actions">
        ${equipe
          ? `<button class="frise-statut" type="button" data-statut-forfait="${echapper(pid)}" aria-label="Changer le statut" data-astuce="Changer le statut">${pastille(STATUTS_MAINTENANCE, contrat.statut || 'demande')}${icone('chevron')}</button>
             <button class="btn-icone" type="button" data-configurer-forfait="${echapper(pid)}" aria-label="Configurer le forfait" data-astuce="Configurer">${icone('edit')}</button>`
          : pastille(STATUTS_MAINTENANCE, contrat.statut || 'demande')}
      </div>
    </div>
    <div class="forfait-chiffres">
      <div class="forfait-chiffre"><b>${Number(contrat.montant) ? echapper(montant(Number(contrat.montant))) : '…'}</b><span>HT par ${echapper(periode)}</span></div>
      <div class="forfait-chiffre"><b>${Number(contrat.jours) ? enClair(contrat.jours) : '…'}</b><span>${Number(contrat.jours) > 1 ? 'jours de travail' : 'jour de travail'} par ${echapper(periode)}</span></div>
      <div class="forfait-chiffre"><b>${enClair(faits)}${prevus ? ` / ${enClair(prevus)}` : ''}</b><span>${enCours ? `${faits > 1 ? 'jours travaillés' : 'jour travaillé'} dans « ${echapper(enCours.titre || 'la séquence en cours')} »` : `${faits > 1 ? 'jours travaillés' : 'jour travaillé'} en tout`}</span></div>
      <div class="forfait-chiffre"><b>${livrees}</b><span>${livrees > 1 ? 'évolutions livrées' : 'évolution livrée'} sur ${evolutions.length}</span></div>
    </div>
  </div>`;
};

/* La demande du client, telle qu'il l'a écrite. */
const demandeHtml = (contrat, { equipe, pid }) => {
  const dm = contrat.demande || {};
  if (!dm.le && !dm.message) return '';
  const attend = contrat.statut === 'demande';
  return `<div class="carte carte--creuse" id="demande" style="margin-top:20px">
    <span class="etiquette-champ">${attend ? 'La demande, en attente d\'une proposition' : 'La demande d\'origine'}</span>
    <blockquote class="citation" style="margin-top:8px">${echapper(dm.message || 'Sans message.')}<cite>${echapper((dm.par || {}).nom || 'Le client')}${dm.le ? `, le ${echapper(dateHeure(dm.le))}` : ''}${dm.rythme ? ` · rythme souhaité : ${echapper(dm.rythme)}` : ''}</cite></blockquote>
    ${attend ? (equipe
      ? `<div class="rang" style="margin-top:14px;gap:10px;flex-wrap:wrap"><button class="btn btn-principal btn-petit" type="button" data-configurer-forfait="${echapper(pid)}">${icone('edit')} Répondre par une proposition</button><span class="aide">Les modalités, le prix, les jours : dès que c'est enregistré en « proposition envoyée », le client le lit.</span></div>`
      : `<p class="aide" style="margin-top:12px">Nous préparons une proposition : les modalités, le prix, les jours. Vous la lirez ici, et le devis vous attendra dans « Devis et factures ».</p>`) : ''}
  </div>`;
};

/* Les modalités, mot pour mot. */
const modalitesHtml = (contrat, { equipe, pid, devis, jalons }) => {
  const faits = [
    fait('Jours et heures', contrat.horaires ? echapper(contrat.horaires) : ''),
    fait('Délai de réponse', contrat.delaiReponse ? echapper(contrat.delaiReponse) : ''),
    fait('Correction d\'un défaut bloquant', contrat.delaiCorrection ? echapper(contrat.delaiCorrection) : ''),
    fait('Reconduction', contrat.reconduction ? echapper((RECONDUCTIONS_MAINTENANCE[contrat.reconduction] || {}).libelle || '') : ''),
    fait('Le devis', devis ? `<a href="#/finances/${echapper(devis.id)}">${echapper(devis.numero || 'Devis')}${devis.libelle ? ` · ${echapper(devis.libelle)}` : ''}</a> <span class="t-3">${echapper(devis.statut === 'accepte' ? 'accepté' : devis.statut === 'refuse' ? 'refusé' : 'à accepter')}</span>` : ''),
  ].join('');
  const rien = !faits && !(contrat.inclus || []).length && !(contrat.exclus || []).length && !contrat.modalites;
  const frise = devis ? friseDevis(devis, jalons, { equipe, pid }) : '';
  return `<section class="section" id="modalites">
    <div class="section-tete"><div><h2>Les modalités ${infoBouton('modalites')}</h2><p class="chapo">Ce qui est écrit, et ce qui s'applique.</p></div></div>
    ${rien ? `<p class="aide">${equipe ? 'Rien n\'est encore écrit. Le crayon du forfait ouvre les modalités.' : 'Les modalités seront précisées avec la proposition.'}</p>` : `
    ${faits ? `<dl class="faits" style="margin-bottom:20px">${faits}</dl>` : ''}
    ${(contrat.inclus || []).length || (contrat.exclus || []).length ? `<div class="deux-colonnes" style="margin-bottom:20px">
      ${(contrat.inclus || []).length ? `<div><span class="etiquette-champ">Compris dans le forfait</span><ul class="liste-points" style="margin-top:8px">${contrat.inclus.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul></div>` : ''}
      ${(contrat.exclus || []).length ? `<div><span class="etiquette-champ">Sur devis à part</span><ul class="liste-points" style="margin-top:8px">${contrat.exclus.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul></div>` : ''}
    </div>` : ''}
    ${contrat.modalites ? `<div><span class="etiquette-champ">Comment ça se passe</span><div class="prose" style="margin-top:8px"><p>${echapper(contrat.modalites).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p></div></div>` : ''}`}
    ${frise ? `<div style="margin-top:24px">${frise}</div>` : ''}
  </section>`;
};

/* Une séquence : sa jauge de jours, et ses journées. */
const sequenceHtml = (sq, { equipe, pid, contrat, journees }) => {
  const siennes = journees.filter((j) => j.sequence === sq.id);
  const faits = joursFaits(siennes);
  const prevus = Number(sq.jours) || Number((contrat || {}).jours) || 0;
  const pct = prevus ? Math.min(100, Math.round((faits / prevus) * 100)) : 0;
  return `<div class="frise" data-sequence="${echapper(sq.id)}">
    <div class="frise-tete">
      <div>
        <p class="frise-titre">${echapper(sq.titre || 'Séquence')}</p>
        <p class="frise-sous">${[sq.debut ? `du ${echapper(dateCourte(sq.debut))}` : '', sq.fin ? `au ${echapper(dateCourte(sq.fin))}` : ''].filter(Boolean).join(' ')}${sq.debut || sq.fin ? ' · ' : ''}<b>${enClair(faits)}</b> ${faits > 1 ? 'jours travaillés' : 'jour travaillé'}${prevus ? ` sur <b>${enClair(prevus)}</b> ${prevus > 1 ? 'prévus' : 'prévu'}` : ''}${sq.note ? ` · ${echapper(sq.note)}` : ''}</p>
      </div>
      <span class="frise-fin">${equipe
        ? `<button class="frise-statut" type="button" data-statut-sequence="${echapper(sq.id)}" aria-label="Changer le statut" data-astuce="Changer le statut">${pastille(STATUTS_SEQUENCE, sq.statut || 'a-venir')}${icone('chevron')}</button><button class="btn-icone" type="button" data-editer-sequence="${echapper(sq.id)}" aria-label="Modifier la séquence" data-astuce="Modifier">${icone('edit')}</button>`
        : pastille(STATUTS_SEQUENCE, sq.statut || 'a-venir')}</span>
    </div>
    <div class="frise-jauge" role="img" aria-label="${pct} % des jours travaillés"><i style="width:${pct}%"></i></div>
    <div class="sequence-journees">
      ${siennes.length ? `<div class="liste liste--serree">${siennes.map((j) => journeeLigne(j, { equipe, avecSequence: false })).join('')}</div>` : `<p class="aide">Aucune journée ${sq.statut === 'close' ? 'consignée' : 'pour l\'instant'}.</p>`}
      ${equipe ? `<button class="btn btn-doux btn-petit" type="button" data-nouvelle-journee="${echapper(sq.id)}" data-projet="${echapper(pid)}" style="margin-top:10px">${icone('plus')} Ajouter une journée</button>` : ''}
    </div>
  </div>`;
};

const journeeLigne = (j, { equipe, avecSequence, sequences = [] }) => {
  const sq = avecSequence ? sequences.find((x) => x.id === j.sequence) : null;
  return ligne({
    icone: j.statut === 'faite' ? 'check' : 'calendrier', ton: j.statut === 'faite' ? 'vert' : '',
    titre: `${echapper(j.date ? dateCourte(j.date) : 'Sans date')} · ${echapper(joursEnClair(j.duree))}`,
    sous: `${echapper(j.objet || 'Sans précision')}${sq ? ` · <span class="t-3">${echapper(sq.titre || '')}</span>` : ''}`,
    fin: `${pastille(STATUTS_JOURNEE, j.statut || 'prevue')}${equipe ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-journee="${echapper(j.id)}" aria-label="Modifier la journée" data-astuce="Modifier">${icone('edit')}</button></span>` : ''}`,
  });
};

const evolutionLigne = (e, { equipe, sequences }) => {
  const sq = sequences.find((x) => x.id === e.sequence);
  const s = STATUTS_EVOLUTION[e.statut] || STATUTS_EVOLUTION.proposee;
  return ligne({
    icone: e.statut === 'livree' ? 'check' : e.statut === 'refusee' ? 'moins' : 'ampoule',
    ton: s.voile === 'vert' ? 'vert' : s.voile === 'bleu' ? 'bleu' : s.voile === 'ambre' ? 'ambre' : '',
    titre: `${echapper(e.titre || 'Évolution')}${e.origine === 'client' ? ` <span class="etiquette">${equipe ? 'Proposée par le client' : 'Proposée par vous'}</span>` : ''}`,
    sous: [
      e.estimation ? `${echapper(joursEnClair(e.estimation))} ${Number(e.estimation) > 1 ? 'estimés' : 'estimée'}` : '',
      sq ? `séquence « ${echapper(sq.titre || '')} »` : '',
      e.version ? `version ${echapper(e.version)}` : '',
      e.description ? echapper(String(e.description).slice(0, 90)) : '',
    ].filter(Boolean).join(' · '),
    fin: `${equipe
      ? `<button class="frise-statut" type="button" data-statut-evolution="${echapper(e.id)}" aria-label="Changer le statut" data-astuce="Changer le statut">${pastille(STATUTS_EVOLUTION, e.statut || 'proposee')}${icone('chevron')}</button><span class="rang boutons-edition"><button class="btn-icone" type="button" data-editer-evolution="${echapper(e.id)}" aria-label="Modifier l'évolution" data-astuce="Modifier">${icone('edit')}</button></span>`
      : pastille(STATUTS_EVOLUTION, e.statut || 'proposee')}`,
    action: 'ouvrir-evolution', attrs: `data-id="${echapper(e.id)}"`,
  });
};

/* --------------------------------------------------------------------------
   Un projet
   -------------------------------------------------------------------------- */

const sansForfait = ({ equipe, pid }) => `<section class="section" id="forfait" style="margin-top:0">
  <div class="section-tete"><div><h2>Pas encore de forfait ${infoBouton('forfait')}</h2><p class="chapo">${equipe ? 'Le client peut le demander depuis son espace, ou vous le configurez directement.' : 'Votre application peut être suivie chaque mois, sans que vous ayez à y penser.'}</p></div></div>
  <div class="prose">
    ${equipe ? `
    <p>Un forfait de maintenance, c'est un nombre de jours par période réservés à ce projet, avec des modalités écrites. Une fois configuré, le client lit tout ici : les modalités, chaque séquence, chaque jour travaillé, et le sort de ses évolutions.</p>
    <p>Quand le client le demande lui-même, sa demande apparaît ici et vous recevez un e-mail.</p>`
    : `
    <p>Une application livrée n'est pas finie. Les téléphones changent de système chaque année, les boutiques d'applications changent leurs règles, des défauts se découvrent à l'usage, et vous avez des idées en la voyant vivre.</p>
    <p>Le forfait de maintenance continue, c'est <b>un nombre de jours de travail par mois</b>, réservés à votre application, à un prix fixe. Ces jours servent aux corrections, aux mises à jour, à la surveillance, et à vos petites évolutions. Tout ce qui est fait apparaît ici, jour par jour.</p>
    <p>Demandez-le en deux phrases : nous vous répondons par une proposition, avec les modalités et un devis. Rien ne s'engage avant que vous ayez accepté ce devis.</p>`}
  </div>
  <div class="rang" style="margin-top:20px;gap:10px;flex-wrap:wrap">
    ${equipe
      ? `<button class="btn btn-principal" type="button" data-configurer-forfait="${echapper(pid)}">${icone('plus')} Configurer un forfait</button>`
      : `<button class="btn btn-principal" type="button" data-demander-forfait="${echapper(pid)}">${icone('envoyer')} Demander un forfait de maintenance</button>`}
  </div>
</section>`;

const unProjet = (d, { pid, equipe }) => {
  const projet = d.projets.find((p) => p.id === pid);
  if (!projet) return vide({ icone: 'sante', titre: 'Projet introuvable', texte: 'Il a peut-être été archivé.' });
  const { contrat, sequences, journees, evolutions, devis, jalons } = dossier(d, pid);

  if (!contrat) return `<div class="tests-corps"><div>${sansForfait({ equipe, pid })}</div></div>`;

  const statut = STATUTS_MAINTENANCE[contrat.statut] || STATUTS_MAINTENANCE.demande;
  const periode = periodeDe(contrat);
  const enCours = sequences.filter((x) => x.statut === 'en-cours').length;
  const totalFaits = joursFaits(journees);
  const livrees = evolutions.filter((e) => e.statut === 'livree').length;
  const aTrancher = evolutions.filter((e) => e.statut === 'proposee').length;

  const resumeForfait = `<b>${echapper(contrat.formule || 'Forfait de maintenance')}</b>, ${echapper(statut.libelle.toLowerCase())}${Number(contrat.jours) ? ` : <b>${enClair(contrat.jours)}</b> ${Number(contrat.jours) > 1 ? 'jours' : 'jour'} par ${echapper(periode)}` : ''}${Number(contrat.montant) ? ` pour <b>${echapper(montant(Number(contrat.montant)))}</b> HT` : ''}.`;
  const resumeSequences = sequences.length
    ? `<b>${sequences.length}</b> ${sequences.length > 1 ? 'séquences' : 'séquence'}${enCours ? `, <b>${enCours}</b> en cours` : ''}, <b>${enClair(totalFaits)}</b> ${totalFaits > 1 ? 'jours travaillés' : 'jour travaillé'} en tout.`
    : `Aucune séquence pour l'instant. ${equipe ? 'Ouvrez la première : une période, un nombre de jours.' : 'Elles arriveront avec le forfait.'}`;
  const resumeJournal = journees.length
    ? `<b>${journees.filter((j) => j.statut === 'faite').length}</b> ${journees.filter((j) => j.statut === 'faite').length > 1 ? 'journées faites' : 'journée faite'}${journees.some((j) => j.statut === 'prevue') ? `, <b>${journees.filter((j) => j.statut === 'prevue').length}</b> ${journees.filter((j) => j.statut === 'prevue').length > 1 ? 'prévues' : 'prévue'}` : ''}.`
    : 'Aucun jour consigné pour l\'instant.';
  const resumeEvolutions = evolutions.length
    ? `<b>${evolutions.length}</b> ${evolutions.length > 1 ? 'évolutions' : 'évolution'}, <b>${livrees}</b> ${livrees > 1 ? 'livrées' : 'livrée'}${aTrancher ? `, <b>${aTrancher}</b> ${aTrancher > 1 ? 'à trancher' : 'à trancher'}` : ''}.`
    : `Aucune évolution pour l'instant. ${equipe ? '' : 'Proposez la première : une idée en deux phrases suffit.'}`;

  const index = [
    ['forfait', 'Le forfait', ''],
    ['modalites', 'Modalités', ''],
    ['sequences', 'Séquences', sequences.length],
    ['journal', 'Jours', journees.length],
    ['evolutions', 'Évolutions', evolutions.length],
  ];

  return `
  <div class="tests-corps tests-corps--index">
    <div>
      ${etage('etage-forfait', 'Le forfait', resumeForfait, `
        <div style="margin-top:20px">${carteForfait(contrat, { equipe, pid, sequences, journees, evolutions })}</div>
        ${demandeHtml(contrat, { equipe, pid })}
        <div style="margin-top:20px">${friseForfait(contrat, devis)}</div>
        ${modalitesHtml(contrat, { equipe, pid, devis, jalons })}`)}

      ${etage('etage-sequences', 'Les séquences', resumeSequences, `
        <section class="section" id="sequences">
          <div class="section-tete">
            <div><h2>Séquences ${infoBouton('sequences')}</h2><p class="chapo">Une période, ses jours prévus, ses jours faits.</p></div>
            ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-sequence="${echapper(pid)}">${icone('plus')} Nouvelle séquence</button>` : ''}
          </div>
          ${sequences.length ? sequences.map((sq) => sequenceHtml(sq, { equipe, pid, contrat, journees })).join('')
            : vide({ icone: 'calendrier', titre: 'Aucune séquence', texte: equipe ? 'Une séquence est une période du forfait, avec son nombre de jours.' : 'La première séquence apparaîtra ici dès que le forfait démarre.', compact: true })}
        </section>`)}

      ${etage('etage-journal', 'Les jours de travail', resumeJournal, `
        <section class="section" id="journal">
          <div class="section-tete">
            <div><h2>Jour par jour ${infoBouton('journal')}</h2><p class="chapo">Du plus récent au plus ancien, avec ce qui a été fait.</p></div>
            ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-journee="" data-projet="${echapper(pid)}">${icone('plus')} Nouvelle journée</button>` : ''}
          </div>
          ${journees.length ? `<div class="liste">${journees.map((j) => journeeLigne(j, { equipe, avecSequence: true, sequences })).join('')}</div>`
            : vide({ icone: 'horloge', titre: 'Aucun jour consigné', texte: 'Chaque jour travaillé apparaîtra ici, avec sa durée et ce qui a été fait.', compact: true })}
        </section>`)}

      ${etage('etage-evolutions', 'Les évolutions', resumeEvolutions, `
        <section class="section" id="evolutions">
          <div class="section-tete">
            <div><h2>Évolutions ${infoBouton('evolutions')}</h2><p class="chapo">Ce qu'on ajoute à l'application au fil du forfait, et où en est chaque idée.</p></div>
            ${equipe
              ? `<button class="btn btn-principal btn-petit" type="button" data-nouvelle-evolution="${echapper(pid)}">${icone('plus')} Nouvelle évolution</button>`
              : `<button class="btn btn-principal btn-petit" type="button" data-proposer-evolution="${echapper(pid)}">${icone('ampoule')} Proposer une évolution</button>`}
          </div>
          ${evolutions.length ? `<div class="liste">${evolutions.map((e) => evolutionLigne(e, { equipe, sequences })).join('')}</div>`
            : vide({ icone: 'ampoule', titre: 'Aucune évolution', texte: equipe ? 'Le client peut en proposer ; vous pouvez en poser une ici.' : 'Une idée pour l\'application ? Proposez-la : elle sera lue, puis acceptée ou écartée avec une raison.', compact: true })}
        </section>`)}
    </div>
    <aside class="index-page" aria-label="Sur cette page">
      <span class="etage-sur">Sur cette page</span>
      ${index.map(([id, nom, n]) => `<button type="button" data-aller="${id}">${echapper(nom)}<b>${n === '' ? '' : n}</b></button>`).join('')}
    </aside>
  </div>`;
};

/* Tous les projets d'un coup, pour le cockpit : qui a un forfait, qui en
   demande un, qui n'en a pas. */
const tousLesProjets = (d, { equipe }) => {
  const lignes = d.projets.map((p) => ({ p, ...dossier(d, p.id) }));
  const avec = lignes.filter((x) => x.contrat);
  const demandes = avec.filter((x) => x.contrat.statut === 'demande');
  return `
    ${demandes.length ? `<section class="section section--alerte" style="margin-top:0">
      <div class="section-tete"><div><h2>Demandes à traiter</h2><p class="chapo">${pluriel(demandes.length, 'client attend une proposition', 'clients attendent une proposition')}.</p></div></div>
      <div class="liste">${demandes.map(({ p, contrat }) => ligne({ href: `#/maintenance?projet=${encodeURIComponent(p.id)}`, icone: 'sante', ton: 'ambre', titre: echapper(p.nom), sous: `${echapper(((contrat.demande || {}).par || {}).nom || '')}${(contrat.demande || {}).le ? ` · ${echapper(dateCourte(contrat.demande.le))}` : ''}${(contrat.demande || {}).message ? ` · ${echapper(String(contrat.demande.message).slice(0, 80))}` : ''}`, fin: pastille(STATUTS_MAINTENANCE, 'demande') })).join('')}</div>
    </section>` : ''}
    <section class="section" ${demandes.length ? '' : 'style="margin-top:0"'}>
      <div class="section-tete"><div><h2>Les forfaits ${infoBouton('forfait')}</h2><p class="chapo">${avec.length ? `${pluriel(avec.length, 'projet a un forfait', 'projets ont un forfait')}, sur ${d.projets.length}.` : 'Aucun projet n\'a de forfait pour l\'instant.'}</p></div></div>
      ${lignes.length ? `<div class="liste">${lignes.map(({ p, contrat, sequences, journees, evolutions }) => ligne({
        href: `#/maintenance?projet=${encodeURIComponent(p.id)}`, icone: 'sante', ton: contrat ? (contrat.statut === 'actif' ? 'vert' : contrat.statut === 'demande' ? 'ambre' : 'bleu') : '',
        titre: echapper(p.nom),
        sous: contrat
          ? `${echapper(contrat.formule || 'Forfait')}${Number(contrat.jours) ? ` · ${enClair(contrat.jours)} j par ${echapper(periodeDe(contrat))}` : ''} · ${pluriel(sequences.length, 'séquence', 'séquences')} · ${enClair(joursFaits(journees))} j travaillés · ${pluriel(evolutions.length, 'évolution', 'évolutions')}`
          : 'Pas de forfait',
        fin: contrat ? pastille(STATUTS_MAINTENANCE, contrat.statut || 'demande') : '<span class="puce puce--vide">aucun</span>',
      })).join('')}</div>` : vide({ icone: 'sante', titre: 'Aucun projet', compact: true })}
    </section>`;
};

/* --------------------------------------------------------------------------
   Les gestes du client
   -------------------------------------------------------------------------- */

const RYTHMES = ['Chaque mois', 'Chaque trimestre', 'Je ne sais pas encore'];

const demanderForfait = (env, pid, contrat) => {
  const dm = (contrat || {}).demande || {};
  const m = modale({
    titre: 'Demander un forfait de maintenance',
    sousTitre: 'Deux phrases suffisent. Nous répondons par une proposition, avec les modalités et un devis.',
    feuille: true,
    corps: `
      <div class="groupe"><label class="etiquette-champ" for="mf-message">Ce dont vous avez besoin</label>
        <textarea class="zone" id="mf-message" rows="5" maxlength="4000" placeholder="Par exemple : que l'application reste à jour sur iPhone et Android, que les défauts soient corrigés vite, et pouvoir ajouter une petite fonction de temps en temps.">${echapper(dm.message || '')}</textarea>
        <p class="aide">Ce que vous attendez, ce qui vous inquiète, ce que vous voudriez ajouter. Rien n'engage : c'est le devis qui engage, et il viendra après.</p></div>
      <div class="groupe"><label class="etiquette-champ" for="mf-rythme">À quel rythme</label>
        <select class="select" id="mf-rythme">${RYTHMES.map((r) => `<option value="${echapper(r)}"${dm.rythme === r ? ' selected' : ''}>${echapper(r)}</option>`).join('')}</select></div>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><span class="pousse"></span><button class="btn btn-principal" type="button" data-envoyer>${icone('envoyer')} Envoyer ma demande</button>`,
  });
  const b = m.el.querySelector('[data-envoyer]');
  b.addEventListener('click', () => agir(b, async () => {
    const message = (m.el.querySelector('#mf-message').value || '').trim();
    if (!message) { toast('Dites-nous en deux mots ce dont vous avez besoin.', 'erreur'); return; }
    await ecrire.demanderMaintenance(env.session, pid, { message, rythme: m.el.querySelector('#mf-rythme').value });
    toast('Demande envoyée. Nous revenons vers vous avec une proposition.');
    m.fermer(true);
  }));
  return m.fin;
};

const proposerEvolution = (env, pid) => {
  const m = modale({
    titre: 'Proposer une évolution',
    sousTitre: 'Une idée pour l\'application. Elle sera lue, puis acceptée ou écartée avec une raison.',
    feuille: true,
    corps: `
      <div class="groupe"><label class="etiquette-champ" for="ev-titre">En une ligne</label>
        <input class="champ" id="ev-titre" maxlength="160" placeholder="Exporter mes tâches en tableur"></div>
      <div class="groupe"><label class="etiquette-champ" for="ev-description">Pourquoi, et pour qui <span class="facultatif">(facultatif)</span></label>
        <textarea class="zone" id="ev-description" rows="5" maxlength="4000" placeholder="À quel moment ça vous manque, et ce que ça changerait."></textarea></div>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><span class="pousse"></span><button class="btn btn-principal" type="button" data-envoyer>${icone('ampoule')} Proposer</button>`,
  });
  const b = m.el.querySelector('[data-envoyer]');
  b.addEventListener('click', () => agir(b, async () => {
    const titre = (m.el.querySelector('#ev-titre').value || '').trim();
    if (!titre) { toast('Donnez-lui une ligne.', 'erreur'); return; }
    await ecrire.proposerEvolution(env.session, pid, { titre, description: (m.el.querySelector('#ev-description').value || '').trim() });
    toast('Évolution proposée. Vous saurez ici ce qu\'elle devient.');
    m.fermer(true);
  }));
  return m.fin;
};

/* La fiche d'une évolution : tout ce qu'on en sait. */
const ouvrirEvolution = (e, { equipe, sequences }) => {
  const sq = sequences.find((x) => x.id === e.sequence);
  const s = STATUTS_EVOLUTION[e.statut] || STATUTS_EVOLUTION.proposee;
  return modale({
    titre: e.titre || 'Évolution', sousTitre: e.origine === 'client' ? `Proposée par ${(e.par || {}).nom || 'le client'}` : 'Posée par l\'équipe', feuille: true,
    corps: `
      <div class="rang" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">${pastille(STATUTS_EVOLUTION, e.statut || 'proposee')}</div>
      <p class="aide" style="margin-bottom:16px">${echapper(s.aide || '')}</p>
      ${e.description ? `<div class="groupe"><span class="etiquette-champ">L'idée</span><div class="prose"><p>${echapper(e.description).replace(/\n/g, '<br>')}</p></div></div>` : ''}
      <dl class="faits" style="margin-top:16px">
        ${fait('Estimation', e.estimation ? echapper(joursEnClair(e.estimation)) : '')}
        ${fait('Séquence', sq ? echapper(sq.titre || '') : '')}
        ${fait('Version', e.version ? echapper(e.version) : '')}
        ${fait('Proposée le', e.cree ? echapper(dateCourte(e.cree)) : '')}
        ${fait('Dernier changement', e.maj ? echapper(dateHeure(e.maj)) : '')}
      </dl>
      ${e.reponse ? `<div class="groupe" style="margin-top:16px"><span class="etiquette-champ">Ce qu'on en a dit</span><blockquote class="citation" style="margin-top:6px">${echapper(e.reponse)}</blockquote></div>` : ''}`,
    pied: `${equipe ? `<button class="btn btn-secondaire" type="button" data-modifier>${icone('edit')} Modifier</button>` : ''}<span class="pousse"></span><button class="btn btn-principal" type="button" data-fermer>Fermer</button>`,
  });
};

/* Les menus de statut de l'équipe : un clic sur la pastille, le choix,
   et c'est écrit. La fiche complète reste derrière le crayon. */
const menuStatut = (el, carte, actuel, ecrireStatut, libelleObjet) => {
  menu(el, [
    { titre: 'Statut' },
    ...Object.entries(carte).map(([cle, f]) => ({
      cle, libelle: `${f.libelle}${cle === actuel ? '  ·  actuel' : ''}`,
      action: async () => {
        if (cle === actuel) return;
        try { await ecrireStatut(cle); toast(`${libelleObjet} : ${f.libelle.toLowerCase()}.`); } catch (err) { toast("Le statut n'a pas pu être enregistré.", 'erreur'); }
      },
    })),
  ]);
};

/* --------------------------------------------------------------------------
   La vue
   -------------------------------------------------------------------------- */

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  const equipe = env.role === 'equipe';
  titrePage('Maintenance');
  filAriane([{ libelle: 'Maintenance' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;

  const etat = { projet: lire(ctx, 'projet', '') };
  let empreinte = '';

  const clesSuivies = () => (equipe
    ? [K.projets, K.maintenanceToute, K.documentsTous, K.jalonsTous]
    : [K.projets, ...(magasin.lire(K.projets) || (env.session || {}).projets || []).flatMap((p) => [K.maintenance(p.id), K.documents(p.id), K.jalons(p.id)])]);

  const projetCourant = () => {
    if (etat.projet) return etat.projet;
    const p = magasin.lire(K.projets) || [];
    return !equipe && p.length === 1 ? p[0].id : '';
  };

  const rendre = (force = false) => {
    const sceau = magasin.empreinte(clesSuivies()) + '|' + etat.projet;
    if (!force && sceau === empreinte) return;
    empreinte = sceau;

    const d = lireTout(env);
    const nomProjet = (pid) => ((d.projets.find((p) => p.id === pid) || {}).nom || '');
    const seul = !equipe && d.projets.length === 1 ? d.projets[0].id : '';
    const pid = projetCourant();

    sortie.innerHTML = `<div class="page">
      <header class="page-tete">
        <div>
          <h1>Maintenance</h1>
          <p class="chapo">${pid ? echapper(nomProjet(pid)) : `${pluriel(d.projets.length, 'projet', 'projets')}, ${pluriel(d.maintenance.filter((x) => x.id === 'contrat' && x.statut === 'actif').length, 'forfait en cours', 'forfaits en cours')}`}</p>
        </div>
      </header>
      ${!seul ? `<div class="rang barre-tests"><select class="select" id="f-projet" style="width:auto">
        <option value="">Tous les projets</option>
        ${d.projets.map((p) => `<option value="${echapper(p.id)}"${pid === p.id ? ' selected' : ''}>${echapper(p.nom)}</option>`).join('')}
      </select></div>` : ''}
      ${pid ? unProjet(d, { pid, equipe }) : tousLesProjets(d, { equipe })}
    </div>`;

    const sel = sortie.querySelector('#f-projet');
    if (sel) sel.addEventListener('change', (e) => { etat.projet = e.target.value; poser({ projet: etat.projet }); rendre(true); });
  };

  brancherFrise(sortie, env);
  const gestes = sur(sortie, 'click', '[data-info], [data-aller], [data-demander-forfait], [data-configurer-forfait], [data-statut-forfait], [data-nouvelle-sequence], [data-editer-sequence], [data-statut-sequence], [data-nouvelle-journee], [data-editer-journee], [data-nouvelle-evolution], [data-proposer-evolution], [data-editer-evolution], [data-statut-evolution], [data-action="ouvrir-evolution"]', async (el) => {
    const pid = projetCourant() || el.dataset.projet || '';
    const d = lireTout(env);
    const dos = pid ? dossier(d, pid) : null;

    if (el.dataset.info) {
      const x = EXPLICATIONS[el.dataset.info];
      if (x) modale({ titre: x.titre, corps: `<div class="prose">${x.corps}</div>` });
      return;
    }
    if (el.dataset.aller) {
      const cible = sortie.querySelector(`#${el.dataset.aller}`);
      if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (el.dataset.demanderForfait !== undefined) { await demanderForfait(env, el.dataset.demanderForfait, dos && dos.contrat); return; }
    if (el.dataset.proposerEvolution !== undefined) { await proposerEvolution(env, el.dataset.proposerEvolution); return; }
    if (el.dataset.configurerForfait !== undefined) { await editer('maintenance', env, { pid: el.dataset.configurerForfait, fiche: dos && dos.contrat }); return; }
    if (el.dataset.statutForfait !== undefined && dos && dos.contrat) {
      menuStatut(el, STATUTS_MAINTENANCE, dos.contrat.statut || 'demande', (cle) => ecrire.majElementMaintenance(pid, 'contrat', { statut: cle }), 'Forfait');
      return;
    }
    if (el.dataset.nouvelleSequence !== undefined) { await editer('sequence', env, { pid: el.dataset.nouvelleSequence, defaut: { jours: dos && dos.contrat ? dos.contrat.jours : '' } }); return; }
    if (el.dataset.editerSequence) {
      const x = dos && dos.sequences.find((y) => y.id === el.dataset.editerSequence);
      if (x) await editer('sequence', env, { pid, fiche: x });
      return;
    }
    if (el.dataset.statutSequence) {
      const x = dos && dos.sequences.find((y) => y.id === el.dataset.statutSequence);
      if (x) menuStatut(el, STATUTS_SEQUENCE, x.statut || 'a-venir', (cle) => ecrire.majElementMaintenance(pid, x.id, { statut: cle }), 'Séquence');
      return;
    }
    if (el.dataset.nouvelleJournee !== undefined) {
      const enCours = dos && dos.sequences.find((y) => y.statut === 'en-cours');
      await editer('journee', env, { pid, defaut: { sequence: el.dataset.nouvelleJournee || (enCours ? enCours.id : '') } });
      return;
    }
    if (el.dataset.editerJournee) {
      const x = dos && dos.journees.find((y) => y.id === el.dataset.editerJournee);
      if (x) await editer('journee', env, { pid, fiche: x });
      return;
    }
    if (el.dataset.nouvelleEvolution !== undefined) { await editer('evolution', env, { pid: el.dataset.nouvelleEvolution }); return; }
    if (el.dataset.editerEvolution) {
      const x = dos && dos.evolutions.find((y) => y.id === el.dataset.editerEvolution);
      if (x) await editer('evolution', env, { pid, fiche: x });
      return;
    }
    if (el.dataset.statutEvolution) {
      const x = dos && dos.evolutions.find((y) => y.id === el.dataset.statutEvolution);
      if (x) menuStatut(el, STATUTS_EVOLUTION, x.statut || 'proposee', (cle) => ecrire.majElementMaintenance(pid, x.id, { statut: cle }), 'Évolution');
      return;
    }
    if (el.dataset.action === 'ouvrir-evolution') {
      const x = dos && dos.evolutions.find((y) => y.id === el.dataset.id);
      if (!x) return;
      const m = ouvrirEvolution(x, { equipe, sequences: dos.sequences });
      sur(m.el, 'click', '[data-modifier]', async () => { m.fermer(); await editer('evolution', env, { pid, fiche: x }); });
    }
  });

  const suivies = new Set();
  const suivre = () => {
    clesSuivies().forEach((c) => {
      if (suivies.has(c)) return;
      suivies.add(c);
      lot.sur(c, () => { suivre(); rendre(); });
    });
  };
  suivre();
  rendre(true);

  return () => { gestes(); lot.fin(); };
};

void joursAvant;
