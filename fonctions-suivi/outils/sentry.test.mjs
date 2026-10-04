/* ==========================================================================
   CAPMEDIA CLIENT HUB · Sentry, les décisions pures (sans émulateur)

     node fonctions-suivi/outils/sentry.test.mjs

   Ce que prouve cette épreuve, sur les réponses enregistrées du faux
   serveur (outils/sentry-faux) :
   - « epurer » retire adresses, adresses IP, numéros, jetons et paramètres
     d'URL, et garde une date ;
   - la signature d'un envoi de Sentry : la bonne passe, une fausse, une
     vide, une autre longueur ou le corps d'un autre envoi échouent ;
   - un envoi devient la bonne alerte (nouvelle, revenue, rouverte, pic,
     calme), et rien de l'utilisateur de l'événement n'y passe ;
   - la stabilité : le taux pondéré par les sessions, la tendance, et pas
     de tendance sous vingt sessions ;
   - les erreurs du jour par application, une erreur vue deux fois ne
     comptant qu'une fois parmi les distinctes ;
   - une version et sa santé, la vue du client sans rien de technique ;
   - un lien ne mène qu'à Sentry.
   ========================================================================== */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
delete process.env.FUNCTIONS_EMULATOR;
const s = require('../sentry.js');
const faux = (nom) => JSON.parse(readFileSync(new URL(`./sentry-faux/${nom}.json`, import.meta.url), 'utf8'));

let ok = 0; const ecarts = [];
const verifier = (c, m, detail = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };

console.log('\n== epurer : rien de personnel ne sort de Sentry');
const sale = 'Error: Échec pour jean.dupont@exemple.fr depuis 192.168.1.20, compte 12345678, jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc, uuid 3f2b8c1e-9a7d-4c3b-8e21-0a1b2c3d4e5f, tel +33 6 12 34 56 78, https://x.exemple/a?email=a@b.fr, le 2026-10-04';
const propre = s._epurer(sale, 400);
verifier(!/@/.test(propre), 'aucune adresse e-mail', propre);
verifier(!/192\.168/.test(propre), 'aucune adresse IP');
verifier(!/12345678/.test(propre), 'aucun long numéro');
verifier(!/eyJ/.test(propre), 'aucun jeton');
verifier(!/3f2b8c1e/.test(propre), 'aucun identifiant unique');
verifier(!/612345678|6 12 34/.test(propre), 'aucun numéro de téléphone');
verifier(!/\?email/.test(propre) && /https:\/\/x\.exemple\/a/.test(propre), 'les paramètres d URL partent, le chemin reste');
verifier(/2026-10-04/.test(propre), 'une date reste lisible');
verifier(s._epurer('x'.repeat(300), 120).length === 120, 'la longueur est bornée');
verifier(s._epurer('Ligne un\n\nLigne deux', 200, { lignes: true }) === 'Ligne un\n\nLigne deux', 'les paragraphes du texte pour le client sont gardés');

console.log('\n== La signature d un envoi');
const secret = 'secret-essai';
const corps = Buffer.from(JSON.stringify({ action: 'created', data: { issue: { id: '1' } } }));
const sig = crypto.createHmac('sha256', secret).update(corps).digest('hex');
verifier(s._signatureValide(corps, sig, secret) === true, 'la bonne signature passe');
verifier(s._signatureValide(corps, sig.toUpperCase(), secret) === true, 'en majuscules aussi');
verifier(s._signatureValide(corps, sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')), secret) === false, 'une signature fausse est refusée');
verifier(s._signatureValide(corps, '', secret) === false, 'une signature absente est refusée');
verifier(s._signatureValide(corps, sig.slice(0, 40), secret) === false, 'une signature tronquée est refusée');
verifier(s._signatureValide(Buffer.from('{"action":"resolved"}'), sig, secret) === false, 'la signature d un autre corps est refusée');
verifier(s._signatureValide(corps, sig, '') === false, 'sans secret, rien ne passe');

console.log('\n== Un envoi devient une alerte');
const issue = { id: '6002', shortId: 'FORGEME-WEB-3', title: 'Error: échec pour jean@exemple.fr', project: { id: '4512197441683536', slug: 'forgeme-web' }, web_url: 'https://forgeme.sentry.io/issues/6002/' };
const a1 = s._alerteDe('issue', { action: 'created', data: { issue } });
verifier(a1 && a1.type === 'nouvelle' && a1.issue === '6002' && !/@/.test(a1.texte), 'issue.created : nouvelle erreur, titre épuré', JSON.stringify(a1));
verifier((s._alerteDe('issue', { action: 'unresolved', data: { issue }, actor: { type: 'application' } }) || {}).type === 'regression', 'issue.unresolved par Sentry : erreur revenue');
verifier((s._alerteDe('issue', { action: 'unresolved', data: { issue }, actor: { type: 'user' } }) || {}).type === 'rouverte', 'issue.unresolved par un humain : rouverte, sans cloche');
verifier(s._alerteDe('issue', { action: 'assigned', data: { issue } }) === null, 'issue.assigned : rien');
verifier(s._alerteDe('installation', { action: 'created', data: {} }) === null, 'installation : rien');
const evenement = { issue_id: '6001', title: 'TypeError: x', project: 4512197449351248, web_url: 'https://forgeme.sentry.io/issues/6001/events/abc/', user: { email: 'secret@exemple.fr', ip_address: '10.0.0.1' }, contexts: { os: { name: 'iOS' } } };
const a2 = s._alerteDe('event_alert', { action: 'triggered', data: { event: evenement, triggered_rule: "Pic d'erreurs mobile" } });
verifier(a2 && a2.type === 'pic' && a2.plateforme === 'ios', 'event_alert d une règle « Pic » : pic, sur iPhone');
verifier(!/secret@|10\.0\.0\.1/.test(JSON.stringify(a2)), 'rien de l utilisateur de l événement n est gardé');
verifier((s._alerteDe('event_alert', { action: 'triggered', data: { event: evenement, triggered_rule: 'Erreur fatale' } }) || {}).type === 'alerte', 'une autre règle : alerte');
verifier((s._alerteDe('metric_alert', { action: 'critical', data: { metric_alert: { alert_rule: { name: 'Taux', projects: ['forgeme-web'] } }, description_title: 'Trop d erreurs' } }) || {}).type === 'pic', 'metric_alert critique : pic');
verifier((s._alerteDe('metric_alert', { action: 'resolved', data: { metric_alert: { alert_rule: { name: 'Taux', projects: ['forgeme-web'] } } } }) || {}).type === 'calme', 'metric_alert résolue : retour au calme');

console.log('\n== La stabilité, la tendance');
const sessions = faux('sessions');
const web = s._stabiliteDe(sessions.groups[0].series['crash_free_rate(session)'], sessions.groups[0].series['sum(session)']);
const mobile = s._stabiliteDe(sessions.groups[1].series['crash_free_rate(session)'], sessions.groups[1].series['sum(session)']);
verifier(web.taux === 99.7 && web.tauxAvant === 99.5 && web.tendance === 'mieux' && web.sessions === 1540, 'web : 99,7 % sur 1 540 sessions, en progrès', JSON.stringify({ t: web.taux, a: web.tauxAvant, d: web.tendance, n: web.sessions }));
verifier(mobile.taux === 98.4 && mobile.tendance === 'moins', 'mobile : 98,4 %, en recul', JSON.stringify({ t: mobile.taux, d: mobile.tendance }));
const peu = s._stabiliteDe([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
verifier(peu.mesurable === false && peu.tendance === null, 'sous vingt sessions : ni taux affirmé, ni tendance');
const pondere = s._stabiliteDe([null, null, null, null, null, null, null, 1, 1, 1, 1, 1, 1, 0.5], [0, 0, 0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10, 40]);
verifier(pondere.taux === 80, 'le taux est pondéré par les sessions : 80 %, pas la moyenne des jours (92,9 %)', String(pondere.taux));
verifier(s._stabiliteDe([0.99, 0.99], [100, 100]).tendance === null, 'sans semaine d avant : pas de tendance');

console.log('\n== Les erreurs du jour, les erreurs ouvertes, les versions');
const liaison = { org: 'forgeme', web: 'forgeme-web', mobile: 'forgeme-mobile', ids: { web: '4512197441683536', mobile: '4512197449351248' } };
const jour = s._erreursDuJour(faux('jour').data, liaison);
verifier(jour.web.erreurs === 31 && jour.web.problemes === 2, 'web : 31 erreurs, 2 distinctes (la même sur deux navigateurs compte une fois)', JSON.stringify(jour.web));
verifier(jour.ios.erreurs === 44 && jour.ios.problemes === 2, 'iPhone : 44 erreurs, 2 distinctes', JSON.stringify(jour.ios));
verifier(jour.android.erreurs === 23 && jour.android.problemes === 1, 'Android : 23 erreurs, 1 distincte', JSON.stringify(jour.android));
const ailleurs = s._erreursDuJour([{ project: 'autre-projet', 'os.name': 'iOS', issue: 'X-1', 'count()': 9 }], liaison);
verifier(ailleurs.ios.erreurs === 0, 'un projet Sentry non relié ne compte pas');
const p = s._problemeDe({ ...faux('erreurs')[1], firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), stats: { '24h': [] } }, liaison, new Date());
verifier(p.app === 'web' && !/@|192\.168/.test(p.titre) && p.lien === 'https://forgeme.sentry.io/issues/6002/', 'une erreur ouverte : application, titre épuré, lien sans la recherche (qui portait une adresse)', `${p.titre} ${p.lien}`);
const parProblemes = s._erreursDuJourParProblemes([{ app: 'web', jour: 3 }, { app: 'mobile', jour: 5 }, { app: 'mobile', jour: 0 }]);
verifier(parProblemes.web.erreurs === 3 && parProblemes.mobile.erreurs === 5 && parProblemes.mobile.problemes === 1, 'à défaut de Discover : compté sur les erreurs ouvertes');
const v = s._versionDe(faux('versions-mobile')[0], 'mobile');
verifier(v.libelle === '1.1.3 (24)' && v.sansPlantage === 98.4 && v.sessions === 812 && v.nouvelles === 2, 'une version mobile : 1.1.3 (24), 98,4 %, 812 sessions, 2 nouvelles erreurs', JSON.stringify(v));
const sansSante = s._versionDe(faux('versions-web')[1], 'web');
verifier(sansSante.sansPlantage === null && sansSante.sessions === 0, 'une version sans santé : ni taux ni sessions');

console.log('\n== La vue du client');
const resume = s._resumeClient({ stabilite: { web, mobile } }, [{ ticket: 't1', plateforme: 'ios', premiere: null }, { ticket: 't2', ferme: true }]);
const texte = JSON.stringify(resume);
verifier(resume.apps.length === 2 && resume.apps[0].taux === 99.7 && resume.apps[1].tendance === 'moins', 'deux plateformes, leur taux et leur tendance');
verifier(resume.corrections.length === 1 && resume.corrections[0].ticket === 't1', 'les corrections : les tickets ouverts seulement');
verifier(!/serie|sessions|version|FORGEME|sentry|http|@/i.test(texte), 'rien de technique : ni série, ni sessions, ni version, ni lien', texte.slice(0, 200));
const peuResume = s._resumeClient({ stabilite: { web: peu } }, []);
verifier(peuResume.apps[0].taux === null, 'sous vingt sessions, le client ne lit pas de taux');

console.log('\n== Les liens');
verifier(s._lienSentry('https://forgeme.sentry.io/issues/1/') === 'https://forgeme.sentry.io/issues/1/', 'un lien Sentry passe');
verifier(s._lienSentry('https://piege.exemple/sentry.io/') === '', 'un lien ailleurs est refusé');
verifier(s._lienSentry('javascript:alert(1)', { org: 'forgeme', id: '7' }) === 'https://forgeme.sentry.io/issues/7/', 'à défaut, le lien est reconstruit');
verifier(s._lienSentry('http://127.0.0.1:9877/x') === '', 'hors émulateur, un hôte local est refusé');
verifier(s._appDe(liaison, { id: '4512197449351248' }) === 'mobile' && s._appDe(liaison, 'forgeme-web') === 'web' && s._appDe(liaison, 'x') === '', 'le projet Sentry donne l application');
verifier(s._minuitParis(new Date('2026-10-04T12:00:00Z')).toISOString() === '2026-10-03T22:00:00.000Z' && s._minuitParis(new Date('2026-01-15T23:30:00Z')).toISOString() === '2026-01-15T23:00:00.000Z', 'minuit à Paris, heure d été et d hiver');

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
