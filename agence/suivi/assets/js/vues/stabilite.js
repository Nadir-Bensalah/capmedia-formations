/* ==========================================================================
   CAPMEDIA CLIENT HUB · la stabilité d'une application (#/projets/{p}/stabilite)

   Ce que Sentry voit de l'application, relevé par le serveur (sentry.js) :
   le navigateur ne parle jamais à Sentry et ne détient aucun jeton.

   Cockpit (équipe du projet) : les erreurs du jour par application (Web,
   iPhone, Android), les sessions sans plantage par application et par
   version, les alertes en direct (nouvelle erreur, erreur revenue, pic),
   les erreurs ouvertes, et « Créer un ticket » : l'erreur devient un
   ticket écrit en clair pour le client, le technique part en note interne.

   Hub (client) : un résumé sans détail technique. La part des sessions
   sans plantage par plateforme sur sept jours, la tendance, et les
   erreurs en cours de correction, c'est-à-dire les tickets ouverts nés
   d'une erreur, avec le titre que l'équipe a écrit pour lui.
   ========================================================================== */

import { echapper, depuis, dateCourte, pluriel, estAdmin, peut, STATUTS, OUVERTS, libellePlateforme } from '../noyau.js';
import { vide, squelette, titrePage, toast, sur, agir, pastilleTexte, pastille, metrique, encart, menu, confirmer } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, abonnerProjet, abonnerSentry } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { appelServeur } from '../serveur.js';
import { feuille, champ, zone, choix } from './editeurs.js';

/* --- Les mots --------------------------------------------------------------- */

const ESPACE = ' ';
/* Un taux ne s'arrondit jamais vers le haut : 99,96 % n'est pas 100 %. */
export const pourcent = (t) => {
  if (typeof t !== 'number' || Number.isNaN(t)) return '';
  const bas = Math.floor(t * 10 + 1e-9) / 10;
  return `${bas.toLocaleString('fr-FR', { minimumFractionDigits: bas === 100 ? 0 : 1, maximumFractionDigits: 1 })}${ESPACE}%`;
};
const nombre = (n) => Number(n || 0).toLocaleString('fr-FR');
const LIBELLES_APP = { web: 'Web', mobile: 'Mobile', ios: 'iPhone', android: 'Android', autre: 'Autre système' };
const APPS_CLIENT = { web: 'Site web', mobile: 'Application mobile' };
const TYPES_ALERTE = {
  nouvelle: { libelle: 'Nouvelle', voile: 'rouge' },
  regression: { libelle: 'Revenue', voile: 'rouge' },
  pic: { libelle: 'Pic', voile: 'ambre' },
  alerte: { libelle: 'Règle', voile: 'ambre' },
  rouverte: { libelle: 'Rouverte', voile: 'gris' },
  resolue: { libelle: 'Corrigée', voile: 'vert' },
  calme: { libelle: 'Calme', voile: 'vert' },
};
const ETATS_ERREUR = {
  nouvelle: { libelle: 'Nouvelle', voile: 'rouge' },
  regression: { libelle: 'Revenue', voile: 'rouge' },
  hausse: { libelle: 'En hausse', voile: 'ambre' },
  'en-cours': { libelle: 'Ouverte', voile: 'gris' },
};
const URGENCES_TICKET = { important: 'Importante', critique: 'Critique', bloquant: 'Bloquante', mineur: 'Mineure' };

/** La tendance, dite au client en une phrase. */
export const phraseTendance = (app) => {
  if (!app || typeof app.taux !== 'number') return "Pas encore assez d'utilisations cette semaine pour mesurer.";
  if (app.tendance === 'mieux') return `En progrès par rapport à la semaine précédente (${pourcent(app.tauxAvant)}).`;
  if (app.tendance === 'moins') return `En recul par rapport à la semaine précédente (${pourcent(app.tauxAvant)}).`;
  if (app.tendance === 'stable') return 'Stable par rapport à la semaine précédente.';
  return 'Première semaine mesurée.';
};

/* Le lien vers Sentry : seulement s'il y mène (ou au faux serveur du banc). */
const lienSur = (u) => (/^https:\/\/([a-z0-9-]+\.)*sentry\.io\//i.test(String(u || '')) || /^http:\/\/127\.0\.0\.1:\d+\//.test(String(u || '')) ? String(u) : '');
const lienSentryHtml = (u) => (lienSur(u) ? `<a class="lien stab-sentry" href="${echapper(lienSur(u))}" target="_blank" rel="noopener noreferrer" data-stab-sentry>Sentry</a>` : '');

/* ==========================================================================
   Le Cockpit
   ========================================================================== */

const lireEquipe = (pid) => ({
  projet: magasin.lire(K.projet(pid)),
  liaison: magasin.lire(K.sentryLiaison(pid)),
  s: magasin.lire(K.sentry(pid)),
  alertes: magasin.lire(K.sentryAlertes(pid)) || [],
  liens: magasin.lire(K.sentryTickets(pid)) || [],
  tickets: magasin.lire(K.tickets(pid)) || [],
});

const ticketDuLien = (d, issueId) => {
  const l = d.liens.find((x) => x.id === String(issueId));
  if (!l) return null;
  const t = d.tickets.find((x) => x.id === l.ticket);
  return t ? { ...t, ouvert: OUVERTS.includes(t.statut) && !t.archive } : { id: l.ticket, numero: '', ouvert: true };
};

const jourHtml = (s) => {
  const j = s.jour;
  if (!j) return '<p class="t-petit t-3">Pas encore relevé.</p>';
  const cases = j.source === 'problemes' ? [['web', 'Web'], ['mobile', 'Mobile']] : [['web', 'Web'], ['ios', 'iPhone'], ['android', 'Android']];
  const autre = j.autre && j.autre.erreurs ? `<p class="t-petit t-3 stab-note">Et ${pluriel(j.autre.erreurs, 'erreur')} sur un autre système mobile.</p>` : '';
  return `<div class="metriques stab-jour" data-stab-jour>${cases.map(([cle, libelle]) => {
    const c = j[cle] || { erreurs: 0, problemes: 0 };
    return metrique(nombre(c.erreurs), libelle, { ton: c.erreurs ? 'ambre' : '', nuance: c.erreurs ? pluriel(c.problemes, 'erreur distincte', 'erreurs distinctes') : 'aucune erreur' });
  }).join('')}</div>${j.source === 'problemes' ? '<p class="t-petit t-3 stab-note">Compté sur les erreurs ouvertes : la recherche par système n\'a pas répondu.</p>' : ''}${autre}`;
};

const stabiliteHtml = (s) => {
  const st = s.stabilite || {};
  const apps = ['web', 'mobile'].filter((a) => st[a]);
  if (!apps.length) return '<p class="t-petit t-3">Aucune session relevée pour le moment.</p>';
  return `<div class="metriques stab-sessions" data-stab-sessions>${apps.map((a) => {
    const x = st[a];
    const ecart = typeof x.taux === 'number' && typeof x.tauxAvant === 'number' ? Math.round((x.taux - x.tauxAvant) * 10) / 10 : null;
    const nuance = [
      `${nombre(x.sessions)} session${x.sessions > 1 ? 's' : ''} sur 7 jours`,
      ecart !== null && x.sessionsAvant ? `${ecart > 0 ? '+' : ''}${ecart.toLocaleString('fr-FR')} pt sur la semaine d'avant` : '',
    ].filter(Boolean).join(' · ');
    const ton = typeof x.taux !== 'number' ? '' : x.taux >= 99.5 ? 'vert' : x.taux >= 98 ? 'ambre' : 'rouge';
    return metrique(typeof x.taux === 'number' ? pourcent(x.taux) : 'Pas de session', `${a === 'web' ? 'Web' : 'Mobile (iPhone et Android)'}, sans plantage`, { ton, nuance });
  }).join('')}</div>`;
};

const versionsHtml = (s) => {
  const v = (s.versions || []).slice().sort((a, b) => (b.creee && b.creee.toMillis ? b.creee.toMillis() : 0) - (a.creee && a.creee.toMillis ? a.creee.toMillis() : 0));
  if (!v.length) return '<p class="t-petit t-3">Aucune version relevée.</p>';
  return `<div class="cadre-defile"><table class="tableau stab-versions" data-stab-versions>
    <thead><tr><th scope="col">Version</th><th scope="col">Application</th><th scope="col" class="nb">Sessions, 14 j</th><th scope="col" class="nb">Sans plantage</th><th scope="col" class="nb">Plantages</th><th scope="col" class="nb">Nouvelles erreurs</th><th scope="col">Publiée</th></tr></thead>
    <tbody>${v.map((x) => `<tr data-version="${echapper(x.version)}">
      <td class="stab-mono">${echapper(x.libelle || x.version)}</td>
      <td>${echapper(LIBELLES_APP[x.app] || '')}</td>
      <td class="nb">${x.sessions ? nombre(x.sessions) : '-'}</td>
      <td class="nb">${typeof x.sansPlantage === 'number' && x.sessions ? pourcent(x.sansPlantage) : '-'}</td>
      <td class="nb">${x.sessions ? nombre(x.plantages) : '-'}</td>
      <td class="nb">${nombre(x.nouvelles)}</td>
      <td>${x.creee ? echapper(dateCourte(x.creee)) : '-'}</td>
    </tr>`).join('')}</tbody></table></div>`;
};

const alertesHtml = (d) => {
  if (!d.alertes.length) return '<p class="t-petit t-3" data-stab-alertes-vide>Aucune alerte reçue. Elles arrivent ici en direct.</p>';
  return `<ul class="stab-alertes" data-stab-alertes>${d.alertes.slice(0, 12).map((a) => {
    const t = TYPES_ALERTE[a.type] || TYPES_ALERTE.alerte;
    return `<li class="stab-alerte" data-alerte="${echapper(a.id)}" data-type="${echapper(a.type || '')}">
      <span class="stab-alerte-type">${pastilleTexte(t.libelle, t.voile)}</span>
      <span class="stab-alerte-corps"><span class="stab-alerte-titre">${echapper(a.titre || '')}</span><span class="stab-alerte-texte">${echapper([a.texte, LIBELLES_APP[a.app] || ''].filter(Boolean).join(' · '))}</span></span>
      <span class="stab-alerte-fin"><span class="t-3">${echapper(depuis(a.le))}</span>${lienSentryHtml(a.lien)}</span>
    </li>`;
  }).join('')}</ul>`;
};

const erreursHtml = (d, env) => {
  const liste = (d.s.problemes || []);
  if (!liste.length) return '<p class="t-petit t-3" data-stab-erreurs-vide>Aucune erreur ouverte.</p>';
  const peutTicket = peut(env.session, 'demandes.gerer', d.projet && d.projet.id);
  return `<ul class="stab-erreurs" data-stab-erreurs>${liste.map((p) => {
    const e = ETATS_ERREUR[p.etat] || ETATS_ERREUR['en-cours'];
    const t = ticketDuLien(d, p.id);
    const fin = t && t.ouvert
      ? `<a class="lien" href="#/projets/${echapper(d.projet.id)}/demandes/${echapper(t.id)}" data-stab-ticket="${echapper(t.id)}">${echapper(t.numero || 'Le ticket')}</a>`
      : (peutTicket ? `<button class="btn btn-secondaire btn-petit" type="button" data-stab-action="ticket" data-id="${echapper(p.id)}">Créer un ticket</button>` : '');
    const faits = [
      pluriel(p.occurrences, 'fois', 'fois'),
      p.personnes ? pluriel(p.personnes, 'personne touchée', 'personnes touchées') : '',
      p.jour ? `${nombre(p.jour)} aujourd'hui` : '',
      p.derniere ? `vue ${depuis(p.derniere)}` : '',
    ].filter(Boolean).join(' · ');
    return `<li class="stab-erreur" data-erreur="${echapper(p.id)}">
      <div class="stab-erreur-corps">
        <p class="stab-erreur-titre">${echapper(p.titre)}</p>
        ${p.lieu ? `<p class="stab-erreur-lieu stab-mono">${echapper(p.lieu)}</p>` : ''}
        <p class="stab-erreur-faits">${echapper(LIBELLES_APP[p.app] || '')} · ${echapper(faits)}</p>
      </div>
      <div class="stab-erreur-fin">${pastilleTexte(e.libelle, e.voile)}${fin}${lienSentryHtml(p.lien)}</div>
    </li>`;
  }).join('')}</ul>`;
};

const pageEquipe = (d, env) => {
  const admin = estAdmin(env.session);
  const s = d.s || {};
  const r = s.releve || {};
  const lie = d.liaison && d.liaison.actif !== false;
  const tete = `<header class="page-tete">
    <div>
      <p class="surtitre">${echapper(d.projet.nom || '')}</p>
      <h1 style="margin-top:2px">Stabilité</h1>
      <p class="chapo">${lie ? `Ce que Sentry voit de l'application, relevé toutes les quinze minutes${r.le ? ` · dernier relevé <span data-stab-releve>${echapper(depuis(r.le))}</span>` : ''}.` : 'Ce projet n\'est pas encore relié à Sentry.'}</p>
    </div>
    <div class="actions">
      ${lie ? '<button class="btn btn-secondaire" type="button" data-stab-action="actualiser">Actualiser</button>' : ''}
      ${admin ? `<button class="btn ${lie ? 'btn-fantome' : 'btn-principal'}" type="button" data-stab-action="lier">${lie ? 'Liaison Sentry' : 'Relier à Sentry'}</button>` : ''}
    </div>
  </header>`;
  if (!lie) {
    return `<div class="page page-stabilite">${tete}${vide({ icone: 'activite', titre: 'Pas encore de relevé', texte: admin ? 'Reliez le projet à son organisation Sentry : les erreurs, les versions et les sessions arriveront ici.' : 'Un administrateur peut relier ce projet à Sentry.' })}</div>`;
  }
  const soucis = (r.erreurs || []).filter((e) => e && e.etape);
  const avertissement = r.le && soucis.length
    ? encart(`Le dernier relevé n'a pas tout lu : ${echapper(soucis.map((e) => `${e.etape}${e.code ? ` (${e.code})` : ''}`).join(', '))}. Le reste garde la valeur d'avant.`, 'attention', 'alerte')
    : '';
  if (!r.le) return `<div class="page page-stabilite">${tete}${squelette('lignes', 3)}</div>`;
  return `<div class="page page-stabilite">${tete}${avertissement}
    <section class="section" data-stab-section="jour">
      <div class="section-tete"><h2>Erreurs du jour</h2><span class="t-petit t-3">depuis minuit</span></div>
      ${jourHtml(s)}
    </section>
    <section class="section" data-stab-section="alertes">
      <div class="section-tete"><h2>Alertes en direct</h2><span class="t-petit t-3">nouvelle erreur, erreur revenue, pic</span></div>
      ${alertesHtml(d)}
    </section>
    <section class="section" data-stab-section="sessions">
      <div class="section-tete"><h2>Sessions sans plantage</h2><span class="t-petit t-3">7 derniers jours</span></div>
      ${stabiliteHtml(s)}
      <h3 class="stab-sous-titre">Par version</h3>
      ${versionsHtml(s)}
    </section>
    <section class="section" data-stab-section="erreurs">
      <div class="section-tete"><h2>Erreurs ouvertes</h2><span class="t-petit t-3">${echapper(pluriel((s.problemes || []).length, 'erreur'))}, les plus fréquentes d'abord</span></div>
      ${erreursHtml(d, env)}
    </section>
  </div>`;
};

/* Relier le projet : l'organisation et ses deux projets Sentry. */
const editerLiaison = (pid, liaison) => feuille({
  titre: 'Liaison Sentry',
  sousTitre: 'Le jeton reste côté serveur (secret SENTRY_JETON) : ici, seulement les noms.',
  corps: `
    ${champ('org', 'Organisation', (liaison && liaison.org) || 'forgeme', { placeholder: 'forgeme' })}
    <div class="forme-rang">
      ${champ('web', 'Projet web', (liaison && liaison.web) || '', { placeholder: 'forgeme-web', facultatif: true })}
      ${champ('mobile', 'Projet mobile', (liaison && liaison.mobile) || '', { placeholder: 'forgeme-mobile', facultatif: true })}
    </div>`,
  libelle: 'Relier et relever',
  regles: {
    org: (v) => (!/^[a-z0-9][a-z0-9_-]{0,49}$/.test(v || '') ? 'Lettres minuscules, chiffres et tirets.' : ''),
    web: (v) => (v && !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(v) ? 'Lettres minuscules, chiffres et tirets.' : ''),
    mobile: (v) => (v && !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(v) ? 'Lettres minuscules, chiffres et tirets.' : ''),
  },
  enregistrer: async (v) => {
    if (!v.web && !v.mobile) { toast('Nommez au moins un projet Sentry.', 'erreur'); return false; }
    const r = await appelServeur('sentryLier', { projet: pid, org: v.org, web: v.web || '', mobile: v.mobile || '' });
    toast(r.releve && r.releve.ok ? 'Projet relié : premier relevé fait.' : 'Projet relié. Le premier relevé n\'a pas tout lu : voyez l\'encart.');
    return true;
  },
});

/* Une erreur devient un ticket : le client lira ce titre et ce texte. */
const creerTicket = (pid, p) => feuille({
  titre: 'Créer un ticket',
  sousTitre: 'Le client lit le titre et le texte tels quels : écrivez-les pour lui, sans jargon.',
  corps: `
    <div class="stab-reference"><p class="etiquette-champ">L'erreur dans Sentry</p><p class="stab-mono">${echapper(p.court ? `${p.court} · ` : '')}${echapper(p.titre)}</p></div>
    ${champ('titre', 'Titre, pour le client', '', { placeholder: 'Ex. : L\'écran Tâches se ferme parfois à l\'ouverture' })}
    ${zone('description', 'Ce que le client lira', `Nous avons repéré une erreur sur ${p.app === 'mobile' ? "l'application mobile" : 'le site web'} et nous la corrigeons. Rien à faire de votre côté.`, { lignes: 3 })}
    ${choix('urgence', 'Urgence', URGENCES_TICKET, p.etat === 'nouvelle' || p.etat === 'regression' ? 'critique' : 'important')}
    <p class="aide">Le lien Sentry, le nombre d'occurrences, les versions et les plateformes partent dans une note interne du ticket, invisible au client.</p>`,
  libelle: 'Créer le ticket',
  regles: {
    titre: (v) => (!v ? 'Un titre en clair, s\'il vous plaît.' : (v.length > 120 ? '120 caractères au plus.' : '')),
    description: (v) => (!v ? 'Une phrase pour le client.' : ''),
  },
  enregistrer: async (v) => {
    const r = await appelServeur('sentryVersTicket', { projet: pid, issue: p.id, titre: v.titre, description: v.description, urgence: v.urgence });
    toast('Ticket créé : le client le suit.');
    if (r && r.id) naviguer(`/projets/${pid}/demandes/${r.id}`);
    return true;
  },
});

const vueEquipe = (ctx, env) => {
  const pid = ctx.params.id;
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;
  abonnerProjet(lot, pid, 'equipe');
  abonnerSentry(lot, pid);
  const cles = [K.projet(pid), K.sentryLiaison(pid), K.sentry(pid), K.sentryAlertes(pid), K.sentryTickets(pid), K.tickets(pid)];
  let derniere = '';
  const rendre = () => {
    const d = lireEquipe(pid);
    if (d.projet === undefined && !magasin.erreur(K.projet(pid))) return;
    const emp = magasin.empreinte(cles);
    if (emp === derniere) return;
    derniere = emp;
    if (!d.projet) { sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: 'Il a peut-être été archivé, ou vous n\'y avez plus accès.' })}</div>`; return; }
    titrePage(`Stabilité · ${d.projet.nom}`);
    filAriane([{ libelle: 'Projets', chemin: '/projets' }, { libelle: d.projet.nom, chemin: `/projets/${pid}` }, { libelle: 'Stabilité' }]);
    sortie.innerHTML = pageEquipe(d, env);
  };
  const planifier = magasin.dessinateur(rendre, 60, cles);
  cles.forEach((k) => lot.sur(k, planifier));
  planifier();
  /* « il y a 3 min » vieillit sans que rien ne change en base. */
  const horloge = setInterval(() => { derniere = ''; planifier(); }, 60000);

  const gestes = sur(sortie, 'click', '[data-stab-action]', async (el) => {
    const d = lireEquipe(pid);
    const action = el.dataset.stabAction;
    if (action === 'actualiser') {
      let r = null;
      const fait = await agir(el, async () => { r = await appelServeur('sentryActualiser', { projet: pid }); });
      if (fait && r) toast(r.deja ? `Relevé à l'instant : réessayez dans ${r.attendre} s.` : (r.ok ? 'Relevé à jour.' : 'Relevé fait, avec des manques : voyez l\'encart.'), r.ok || r.deja ? 'ok' : 'erreur');
      return;
    }
    if (action === 'lier') {
      if (!d.liaison || d.liaison.actif === false) { editerLiaison(pid, d.liaison); return; }
      menu(el, [
        { libelle: 'Modifier la liaison', icone: 'edit', action: () => editerLiaison(pid, d.liaison) },
        { libelle: 'Délier de Sentry', icone: 'corbeille', danger: true, action: async () => {
          if (await confirmer({ titre: 'Délier ce projet de Sentry ?', texte: 'Le relevé s\'arrête. Ce qui a été relevé reste lisible.', ok: 'Délier', danger: true })) {
            agir(null, () => appelServeur('sentryLier', { projet: pid, actif: false }), 'Projet délié de Sentry.');
          }
        } },
      ]);
      return;
    }
    if (action === 'ticket') {
      const p = ((d.s || {}).problemes || []).find((x) => x.id === el.dataset.id);
      if (p) creerTicket(pid, p);
    }
  });

  return { fin: () => { clearInterval(horloge); planifier.arreter(); gestes(); lot.fin(); } };
};

/* ==========================================================================
   Le Hub
   ========================================================================== */

/** Vrai quand le client a quelque chose à lire sur la page (le rail s'en sert). */
export const aDuContenu = (resume) => Boolean(resume) && ((resume.apps || []).length > 0 || (resume.corrections || []).length > 0);

/* Les erreurs en cours de correction : les tickets ouverts, relus en direct. */
const correctionsDe = (resume, tickets) => (resume.corrections || [])
  .map((c) => ({ ...c, t: tickets.find((x) => x.id === c.ticket) }))
  .filter((c) => c.t && !c.t.archive && OUVERTS.includes(c.t.statut));

const pageClient = (projet, resume, tickets) => {
  const tete = `<header class="page-tete">
    <div>
      <p class="surtitre">${echapper(projet.nom || '')}</p>
      <h1 style="margin-top:2px">Stabilité</h1>
      <p class="chapo">La part des utilisations de votre application qui se passent sans plantage, sur les sept derniers jours.</p>
    </div>
  </header>`;
  if (!aDuContenu(resume)) {
    return `<div class="page page-stabilite">${tete}${vide({ icone: 'activite', titre: 'Bientôt ici', texte: 'La stabilité de votre application apparaîtra ici dès les premières mesures.' })}</div>`;
  }
  const corrections = correctionsDe(resume, tickets);
  const apps = (resume.apps || []).map((a) => `<div class="carte stab-app" data-stab-app="${echapper(a.cle)}">
      <p class="stab-app-nom">${echapper(APPS_CLIENT[a.cle] || a.libelle || '')}</p>
      ${typeof a.taux === 'number'
    ? `<p class="stab-app-taux">${echapper(pourcent(a.taux))}</p><p class="stab-app-legende">des sessions sans plantage</p>`
    : '<p class="stab-app-taux stab-app-taux--vide">Pas encore mesuré</p>'}
      <p class="stab-app-tendance" data-tendance="${echapper(a.tendance || '')}">${echapper(phraseTendance(a))}</p>
    </div>`).join('');
  return `<div class="page page-stabilite">${tete}
    ${apps ? `<div class="stab-apps">${apps}</div>` : ''}
    <section class="section" data-stab-section="corrections">
      <div class="section-tete"><h2>En cours de correction</h2></div>
      ${corrections.length ? `<ul class="stab-corrections" data-stab-corrections>${corrections.map((c) => `<li><a class="stab-correction" href="#/projets/${echapper(projet.id)}/demandes/${echapper(c.t.id)}" data-stab-correction="${echapper(c.t.id)}">
          <span class="stab-correction-corps"><span class="stab-correction-titre">${echapper(c.t.titre || '')}</span>
          <span class="stab-correction-sous">${echapper([c.t.numero || '', c.plateforme ? libellePlateforme(c.plateforme) : '', c.reperee ? `repérée le ${dateCourte(c.reperee)}` : ''].filter(Boolean).join(' · '))}</span></span>
          ${pastille(STATUTS, c.t.statut, { client: true })}
        </a></li>`).join('')}</ul>`
    : '<p class="t-petit t-3" data-stab-corrections-vide>Aucune correction en cours en ce moment.</p>'}
    </section>
    ${resume.maj ? `<p class="t-petit t-3 stab-pied">Mis à jour ${echapper(depuis(resume.maj))}.</p>` : ''}
  </div>`;
};

const vueClient = (ctx, env) => {
  const pid = ctx.params.id;
  const sortie = ctx.sortie;
  const lot = magasin.lot();
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;
  abonnerProjet(lot, pid, env.role);
  const cles = [K.projet(pid), K.stabilite(pid), K.tickets(pid)];
  let derniere = '';
  const rendre = () => {
    const projet = magasin.lire(K.projet(pid));
    if (projet === undefined && !magasin.erreur(K.projet(pid))) return;
    const emp = magasin.empreinte(cles);
    if (emp === derniere) return;
    derniere = emp;
    if (!projet) { sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Ce projet est introuvable', texte: 'Il a peut-être été archivé, ou vous n\'y avez plus accès.' })}</div>`; return; }
    titrePage(`Stabilité · ${projet.nom}`);
    filAriane([{ libelle: 'Stabilité' }]);
    sortie.innerHTML = pageClient(projet, magasin.lire(K.stabilite(pid)) || null, magasin.lire(K.tickets(pid)) || []);
  };
  const planifier = magasin.dessinateur(rendre, 60, cles);
  cles.forEach((k) => lot.sur(k, planifier));
  planifier();
  return { fin: () => { planifier.arreter(); lot.fin(); } };
};

export const vue = async (ctx, env) => (env.role === 'equipe' ? vueEquipe(ctx, env) : vueClient(ctx, env));
