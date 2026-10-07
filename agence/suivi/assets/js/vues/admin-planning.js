/* ==========================================================================
   Le calendrier de l'équipe (#/calendrier, ancienne adresse #/planning) :
   tous les projets, ou un seul (#/calendrier?projet=<p>, l'entrée
   Calendrier d'un projet), et la liste de ce qui vient. On programme une
   réunion depuis ici, et on y voit les rendez-vous que les clients
   demandent. La grille, la fenêtre d'un jour et le détail d'un élément sont
   ceux du calendrier du Hub.

   Filtré sur un projet, la page reprend aussi ce que montrait l'onglet
   Réunions du projet : ses réunions à venir et passées, chacune vers sa
   fiche (ordre du jour, compte rendu, actions, Modifier, Supprimer). La
   fiche d'une réunion s'ouvre par l'adresse (?reunion=<id>) : c'est là que
   mènent les lettres, la cloche et les anciennes adresses
   #/projets/<p>/reunions/<id>.
   ========================================================================== */

import { echapper, joursAvant, dateHeure, lienReunion, parDateAsc, parDateDesc } from '../noyau.js';
import { icone, vide, squelette, titrePage, sur, modale, toast, ligne, fermerFlottants } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, reunionAVenir } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer, adresseAvec } from '../routeur.js';
import { evenementsDe, grilleMois, legende, ligneEvenement, brancherCalendrier } from './calendrier.js';
import { editer } from './editeurs.js';
import { ouvrirFicheReunion } from './projet.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* Les réunions d'un projet, comme dans l'ancien onglet : la ligne ouvre la
   fiche, « Rejoindre » ouvre la visio sans ouvrir la fiche. */
const ligneReunion = (r) => ligne({
  icone: 'reunions', ton: reunionAVenir(r) ? 'bleu' : '',
  titre: echapper(r.titre), sous: `${echapper(dateHeure(r.date))}${r.duree ? ` · ${r.duree} min` : ''}${(r.participants || []).length ? ` · ${echapper(r.participants.map((p) => p.nom || p.email).join(', '))}` : ''}${r.visibilite === 'interne' ? ' · Interne' : ''}`,
  fin: `${lienReunion(r) && reunionAVenir(r) ? `<a class="btn btn-secondaire btn-petit" href="${echapper(lienReunion(r))}" target="_blank" rel="noopener" data-sans-propagation>${icone('video')} Rejoindre</a>` : ''}${r.compteRendu ? '<span class="etiquette">Compte rendu</span>' : ''}`,
  action: 'ouvrir-reunion', attrs: `data-id="${echapper(r.id)}"`,
});

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Calendrier');
  filAriane([{ libelle: 'Calendrier' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const maintenant = new Date();
  let annee = maintenant.getFullYear();
  let mois = maintenant.getMonth();
  /* Le projet vit dans l'adresse : changer de projet change l'adresse, le
     routeur rend la main par « maj », qui redessine une fois, en place. */
  const etat = { projet: String((ctx.requete || {}).projet || ''), evenements: [], projets: [], nomProjet: () => '' };
  const adresse = (changes = {}) => adresseAvec('/calendrier', { projet: etat.projet, ...changes });
  /* La fiche d'une réunion demandée par l'adresse : ouverte une fois, dès
     que les réunions sont là. */
  let reunionAOuvrir = String((ctx.requete || {}).reunion || '');

  const ouvrirReunion = (r) => {
    const projet = (magasin.lire(K.projets) || []).find((p) => p.id === r.projet) || null;
    return ouvrirFicheReunion(r, { pid: r.projet, env, projet });
  };
  const ouvrirDepuisAdresse = () => {
    if (!reunionAOuvrir) return;
    if (magasin.lire(K.reunionsToutes) === undefined && !magasin.erreur(K.reunionsToutes)) return;
    const id = reunionAOuvrir;
    reunionAOuvrir = '';
    const r = (magasin.lire(K.reunionsToutes) || []).find((x) => x.id === id);
    if (!r) { toast('Cette réunion n\'existe plus.', 'erreur'); naviguer(adresse(), { remplacer: true }); return; }
    const m = ouvrirReunion(r);
    /* Refermée, l'adresse redevient celle du calendrier : le Retour ne la
       rouvre pas. */
    if (m && m.fin) m.fin.then(() => { if (/^#\/calendrier\?(.*&)?reunion=/.test(location.hash)) naviguer(adresse(), { remplacer: true }); });
  };

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const filtre = (x) => !etat.projet || x.projet === etat.projet;
    etat.projets = etat.projet ? projets.filter((p) => p.id === etat.projet) : projets;
    etat.nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');
    const reunions = (magasin.lire(K.reunionsToutes) || []).filter(filtre);
    /* « Ouvrir la fiche » d'une réunion reste dans le Calendrier : sa fiche
       s'ouvre ici, par l'adresse, sans quitter la page. */
    etat.evenements = evenementsDe(env.session, {
      projets, reunions, jalons: (magasin.lire(K.jalonsTous) || []).filter(filtre),
      taches: (magasin.lire(K.tachesToutes) || []).filter(filtre), documents: (magasin.lire(K.documentsTous) || []).filter(filtre),
      releases: (magasin.lire(K.releasesToutes) || []).filter(filtre), validations: (magasin.lire(K.validationsToutes) || []).filter(filtre),
      tickets: (magasin.lire(K.ticketsTous) || []).filter(filtre),
    }).map((e) => (e.nature === 'reunion' ? { ...e, chemin: adresse({ reunion: e.id }) } : e));
    const evenements = etat.evenements;
    const aVenir = evenements.filter((e) => joursAvant(e.date) >= 0 && e.nature !== 'rdv').slice(0, 15);
    const enRetard = evenements.filter((e) => joursAvant(e.date) < 0 && ['tache', 'etape', 'facture'].includes(e.nature)).slice(-8).reverse();
    const demandes = evenements.filter((e) => e.nature === 'rdv');
    const nom = etat.projet ? etat.nomProjet(etat.projet) : '';
    /* Un projet choisi : ses réunions, à venir puis passées. */
    const prochaines = reunions.filter(reunionAVenir).sort(parDateAsc('date'));
    const passees = reunions.filter((r) => !reunionAVenir(r)).sort(parDateDesc('date'));
    const blocReunions = etat.projet ? `<section class="section" id="reunions-projet">
        <div class="section-tete"><h2>Réunions${nom ? ` de ${echapper(nom)}` : ''}</h2></div>
        ${prochaines.length ? `<p class="surtitre" style="margin-bottom:8px">À venir</p><div class="liste" style="margin-bottom:var(--e-6)">${prochaines.map(ligneReunion).join('')}</div>` : ''}
        ${passees.length ? `<p class="surtitre" style="margin-bottom:8px">Passées</p><div class="liste">${passees.map(ligneReunion).join('')}</div>` : ''}
        ${!reunions.length ? vide({ icone: 'reunions', titre: 'Aucune réunion', texte: 'Les rendez-vous, leur ordre du jour et leur compte rendu seront ici.', compact: true }) : ''}
      </section>` : '';
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Calendrier</h1><p class="chapo">${nom ? `Réunions, rendez-vous demandés, étapes, échéances et versions de ${echapper(nom)}.` : 'Réunions, rendez-vous demandés, étapes, échéances et versions de tous les projets.'}</p></div>
        <div class="actions"><select class="select" id="f-projet" style="width:auto" aria-label="Projet"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}" ${etat.projet === p.id ? 'selected' : ''}>${echapper(p.nom)}</option>`).join('')}</select><div class="segments"><button type="button" data-mois="-1" aria-label="Mois précédent">${icone('chevronGauche')}</button><button type="button" data-mois="0">Aujourd'hui</button><button type="button" data-mois="1" aria-label="Mois suivant">${icone('chevronDroite')}</button></div><button class="btn btn-principal" type="button" data-reunion>${icone('plus')} Réunion</button></div></div>
      <div class="grille grille-tiers">
        <section><p class="t-titre-2" style="margin-bottom:12px;text-transform:capitalize">${MOIS[mois]} ${annee}</p><div class="calendrier">${grilleMois(annee, mois, evenements)}</div>${legende()}</section>
        <aside class="pile" style="gap:var(--e-5)">
          ${demandes.length ? `<div><p class="surtitre" style="margin-bottom:8px">Rendez-vous demandés</p><div class="liste">${demandes.map((e) => ligneEvenement(e)).join('')}</div></div>` : ''}
          ${enRetard.length ? `<div><p class="surtitre" style="margin-bottom:8px;color:var(--alerte)">En retard</p><div class="liste">${enRetard.map((e) => ligneEvenement(e)).join('')}</div></div>` : ''}
          <div><p class="surtitre" style="margin-bottom:8px">À venir</p>${aVenir.length ? `<div class="liste">${aVenir.map((e) => ligneEvenement(e)).join('')}</div>` : vide({ icone: 'calendrier', titre: 'Rien de programmé', compact: true })}</div>
        </aside>
      </div>
      ${blocReunions}</div>`;
    sortie.querySelector('#f-projet').addEventListener('change', (e) => { naviguer(adresseAvec('/calendrier', { projet: e.target.value })); });
    calendrier.rafraichir();
    ouvrirDepuisAdresse();
  };
  const calendrier = brancherCalendrier(sortie, env, () => etat);
  const gestes = sur(sortie, 'click', '[data-mois], [data-reunion], [data-action="ouvrir-reunion"]', async (el, ev) => {
    if (el.dataset.action === 'ouvrir-reunion') {
      /* « Rejoindre », posé dans la ligne, ouvre la visio, pas la fiche. */
      if (ev && ev.target && ev.target.closest && ev.target.closest('[data-sans-propagation]')) return;
      const r = (magasin.lire(K.reunionsToutes) || []).find((x) => x.id === el.dataset.id);
      if (r) ouvrirReunion(r);
      return;
    }
    if (el.dataset.mois !== undefined) { const n = Number(el.dataset.mois); if (n === 0) { annee = maintenant.getFullYear(); mois = maintenant.getMonth(); } else { mois += n; if (mois < 0) { mois = 11; annee -= 1; } if (mois > 11) { mois = 0; annee += 1; } } rendre(); return; }
    const projets = magasin.lire(K.projets) || [];
    let pid = etat.projet;
    if (!pid) {
      if (!projets.length) { toast('Créez d\'abord un projet.', 'erreur'); return; }
      const m = modale({ titre: 'Pour quel projet ?', corps: `<select class="select" id="choix-p">${projets.map((p) => `<option value="${echapper(p.id)}">${echapper(p.nom)}</option>`).join('')}</select>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="button" data-ok>Continuer</button>' });
      m.el.querySelector('[data-ok]').addEventListener('click', () => m.fermer(m.el.querySelector('#choix-p').value));
      pid = await m.fin;
      if (!pid) return;
    }
    editer('reunion', env, { pid });
  });
  /* Un seul dessin par tour, comme le calendrier du Hub. */
  /* Les pièces ne s'attendent que chez qui les lit tout d'un coup : un
     agent sans la finance n'en reçoit jamais. */
  const admin = ((env.session.equipe || {}).role) === 'admin';
  const cles = [K.projets, K.reunionsToutes, K.jalonsTous, K.tachesToutes, ...(admin ? [K.documentsTous] : []), K.releasesToutes, K.validationsToutes, K.ticketsTous];
  const planifier = magasin.dessinateur(rendre, 40, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  if (!admin) lot.sur(K.documentsTous, planifier);
  planifier();
  return {
    fin: () => { planifier.arreter(); gestes(); calendrier.arreter(); lot.fin(); },
    /* Même page : un autre projet (un dessin, en place), ou la fiche d'une
       réunion par son adresse (le détail d'où l'on vient se referme). */
    maj: (suite) => {
      const projet = String((suite.requete || {}).projet || '');
      const reunion = String((suite.requete || {}).reunion || '');
      const change = projet !== etat.projet;
      etat.projet = projet;
      if (reunion) { fermerFlottants(); reunionAOuvrir = reunion; }
      if (change) rendre();
      else if (reunion) ouvrirDepuisAdresse();
    },
  };
};
