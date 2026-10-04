/* ==========================================================================
   CAPMEDIA CLIENT HUB · la salle de contrôle, les décisions pures (sans émulateur)

     node fonctions-suivi/outils/controle.test.mjs

   Ce que prouve cette épreuve :
   - une adresse à sonder : https, nom de domaine public, sans identifiants ;
     ni http, ni adresse IP, ni nom local, ni port exotique ; l'hôte local
     du banc seulement sur l'émulateur ; une adresse IP privée est reconnue ;
   - l'historique d'une sonde : 288 cases de cinq minutes, les vieilles
     tombent, la disponibilité se compte sur les mesures ;
   - la vie d'une sonde : un échec n'est pas une panne, deux le sont (un
     incident, daté du premier échec), le premier succès la ferme ; deux
     réponses lentes de suite font « lente » ;
   - les erreurs par tranche (réponses enregistrées d'events-stats) : l'heure
     écoulée, les 24 h, le pic ; une plateforme sans réponse garde sa valeur ;
     une série ancienne se recale sur l'instant ;
   - les sessions des 24 h ; les voyants (le pire l'emporte), l'état global ;
   - la vue du client : des phrases, aucune adresse, aucun code, aucun temps.
   ========================================================================== */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
delete process.env.FUNCTIONS_EMULATOR;
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const c = require('../controle.js');
const { vivifier } = require('./lib/faux-sentry.cjs');
const faux = (nom, maintenant) => vivifier(JSON.parse(readFileSync(new URL(`./sentry-faux/${nom}.json`, import.meta.url), 'utf8')), maintenant);

let ok = 0; const ecarts = [];
const verifier = (v, m, detail = '') => { if (v) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${String(detail).slice(0, 300)}` : ''}`); } };

console.log('\n== Une adresse à sonder');
verifier(c._adresseSondable('https://app.forgeme.net/') === 'https://app.forgeme.net/', 'https et un nom de domaine : accepté');
verifier(c._adresseSondable('https://us-central1-forgeme-project.cloudfunctions.net/getLegalTextPublic?type=legal-mentions&locale=fr') === 'https://us-central1-forgeme-project.cloudfunctions.net/getLegalTextPublic?type=legal-mentions&locale=fr', 'une fonction publique avec ses paramètres : acceptée');
verifier(c._adresseSondable('') === '' && c._adresseSondable(null) === '', 'rien : rien à sonder (pas une erreur)');
verifier(c._adresseSondable('http://app.forgeme.net/') === null, 'http : refusé');
verifier(c._adresseSondable('https://10.0.0.1/') === null, 'une adresse IP : refusée');
verifier(c._adresseSondable('https://169.254.169.254/computeMetadata/v1/') === null, 'le serveur de métadonnées : refusé');
verifier(c._adresseSondable('https://[::1]/') === null, 'une adresse IPv6 : refusée');
verifier(c._adresseSondable('https://localhost/') === null && c._adresseSondable('https://metadata.google.internal/') === null, 'un nom local ou interne : refusé');
verifier(c._adresseSondable('https://admin:motdepasse@app.forgeme.net/') === null, 'des identifiants dans l adresse : refusés');
verifier(c._adresseSondable('https://app.forgeme.net:8443/') === null, 'un port autre que 443 : refusé');
verifier(c._adresseSondable('javascript:alert(1)') === null && c._adresseSondable('pas une adresse') === null, 'n importe quoi : refusé');
verifier(c._adresseSondable(`https://app.forgeme.net/${'a'.repeat(300)}`) === null, 'trop long : refusé');
verifier(c._adresseSondable('http://127.0.0.1:9878/web') === null, 'hors émulateur, l hôte local du banc est refusé');
verifier(c._adresseSondable('http://127.0.0.1:9878/web', { emulateur: true }) === 'http://127.0.0.1:9878/web', 'sur l émulateur, il est accepté');
verifier(c._adresseSondable('http://10.0.0.1:9878/web', { emulateur: true }) === null, 'même sur l émulateur, pas une autre adresse');
verifier(['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'].every(c._ipPrivee), 'les adresses privées, locales et réservées sont reconnues');
verifier(!['8.8.8.8', '172.32.0.1', '2606:4700::1111'].some(c._ipPrivee), 'les adresses publiques passent');

const refusee = await c._sonder('https://localhost/');
verifier(refusee.ok === false && refusee.raison === 'adresse refusée', 'hors émulateur, un hôte qui répond depuis une adresse privée n est pas appelé', JSON.stringify(refusee));

console.log('\n== L historique d une sonde');
const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
let serie = c._ajouterAuSeau(null, { t: T0, ok: true, ms: 200 });
verifier(serie.n.length === 288 && serie.n[287] === 1 && serie.somme[287] === 200 && serie.ko[287] === 0, 'la première mesure tombe dans la dernière case');
serie = c._ajouterAuSeau(serie, { t: T0 + 60e3, ok: true, ms: 400 });
serie = c._ajouterAuSeau(serie, { t: T0 + 120e3, ok: false, ms: 10000 });
serie = c._ajouterAuSeau(serie, { t: T0 + 180e3, ok: true, ms: 300 });
verifier(serie.n[287] === 4 && serie.ko[287] === 1 && serie.somme[287] === 900, 'quatre mesures dans la même case, un échec, le temps des seules réussites');
verifier(c._dispoDe(serie) === 75, 'disponibilité : 3 sur 4, 75 %', c._dispoDe(serie));
const plusTard = c._ajouterAuSeau(serie, { t: T0 + 10 * 60e3, ok: true, ms: 100 });
verifier(plusTard.n[285] === 4 && plusTard.n[287] === 1 && plusTard.t0 === serie.t0 + 2 * 300e3, 'dix minutes plus tard, l historique glisse de deux cases');
const lendemain = c._ajouterAuSeau(serie, { t: T0 + 25 * 3600e3, ok: true, ms: 100 });
verifier(lendemain.n.reduce((a, b) => a + b, 0) === 1, 'plus de 24 h après, les vieilles mesures sont tombées');
verifier(c._dispoDe({ n: [], ko: [] }) === null, 'sans mesure, pas de disponibilité affirmée');

console.log('\n== La vie d une sonde : échec, panne, retour');
const OK = { ok: true, code: 200, ms: 180 };
const KO = { ok: false, code: 503, ms: 90, raison: 'HTTP 503' };
let s1 = c._suivreSonde(null, OK, { le: new Date(T0) });
verifier(s1.sonde.etat === 'ok' && !s1.evenement && s1.sonde.dispo === 100, 'une réponse : ok, aucun événement');
const s2 = c._suivreSonde(s1.sonde, KO, { le: new Date(T0 + 60e3) });
verifier(s2.sonde.etat === 'echec' && !s2.evenement && !s2.sonde.panne, 'un échec : « echec », pas encore de panne (on revérifie)');
const s3 = c._suivreSonde(s2.sonde, KO, { le: new Date(T0 + 120e3) });
verifier(s3.sonde.etat === 'panne' && s3.evenement === 'panne' && s3.sonde.panne.code === 503 && new Date(s3.sonde.panne.debut).getTime() === T0 + 60e3, 'deux échecs de suite : panne, datée du premier échec', JSON.stringify(s3.sonde.panne));
const s4 = c._suivreSonde({ ...s3.sonde, incident: 'inc0000000001' }, { ok: false, code: 0, ms: 10000, raison: 'délai dépassé' }, { le: new Date(T0 + 180e3) });
verifier(s4.sonde.etat === 'panne' && !s4.evenement && s4.sonde.incident === 'inc0000000001', 'un troisième échec : toujours la même panne, pas de nouvelle alerte');
const s5 = c._suivreSonde(s4.sonde, OK, { le: new Date(T0 + 240e3) });
verifier(s5.sonde.etat === 'ok' && s5.evenement === 'retabli' && s5.incidentFini === 'inc0000000001' && !s5.sonde.panne && !s5.sonde.incident, 'le premier succès ferme la panne et nomme l incident à clore');
const lent = { ok: true, code: 200, ms: 4200 };
const l1 = c._suivreSonde(s5.sonde, lent, { le: new Date(T0 + 300e3), seuilLent: 3000 });
const l2 = c._suivreSonde(l1.sonde, lent, { le: new Date(T0 + 360e3), seuilLent: 3000 });
verifier(l1.sonde.etat === 'ok' && l2.sonde.etat === 'lent', 'une réponse lente ne suffit pas, deux de suite font « lente »');
verifier(c._suivreSonde(l2.sonde, OK, { le: new Date(T0 + 420e3), seuilLent: 3000 }).sonde.etat === 'ok', 'une réponse rapide la rend normale');
verifier(c._suivreSonde(null, lent, { le: new Date(T0), seuilLent: 6000 }).sonde.lents === 0, 'sous le seuil de la fonction (6 s), pas lente');

console.log('\n== Les erreurs par tranche de dix minutes');
const maintenant = Date.now();
const erreurs = c._erreursDe({ web: faux('heures-web', maintenant), mobile: faux('heures-mobile', maintenant) }, maintenant, {});
const cw = c._chiffresErreurs(erreurs.web, maintenant);
const ci = c._chiffresErreurs(erreurs.ios, maintenant);
const ca = c._chiffresErreurs(erreurs.android, maintenant);
verifier(erreurs.web.valeurs.length === 144 && cw.heure === 3 && cw.jour === 39 && !cw.pic, 'web : 3 dans l heure, 39 sur 24 h, pas de pic', JSON.stringify({ h: cw.heure, j: cw.jour }));
verifier(ci.heure === 14 && ci.jour === 47 && ci.pic, 'iPhone : 14 dans l heure pour 1,4 en moyenne : un pic', JSON.stringify({ h: ci.heure, m: ci.moyenne }));
verifier(ca.heure === 1 && ca.jour === 21 && !ca.pic, 'Android : 1 dans l heure, 21 sur 24 h');
verifier(c._chiffresErreurs({ fin: maintenant + 1, valeurs: [...Array(138).fill(0), 2, 2, 2, 2, 1, 1] }, maintenant).pic === true, 'dix erreurs dans l heure sur un fond nul : un pic');
verifier(c._chiffresErreurs({ fin: maintenant + 1, valeurs: [...Array(138).fill(0), 2, 2, 2, 2, 1, 0] }, maintenant).pic === false, 'neuf erreurs dans l heure : sous le seuil de dix, pas de pic');
const sansWeb = c._erreursDe({ mobile: faux('heures-mobile', maintenant) }, maintenant, { web: { fin: 1, valeurs: [7] } });
verifier(sansWeb.web.valeurs[0] === 7 && sansWeb.ios.valeurs.length === 144, 'le web sans réponse garde sa valeur d avant');
const ancienne = { fin: erreurs.web.fin - 30 * 60e3, valeurs: erreurs.web.valeurs };
verifier(c._chiffresErreurs(ancienne, maintenant).heure === erreurs.web.valeurs.slice(-3).reduce((a, b) => a + b, 0) && c._chiffresErreurs(ancienne, maintenant).jour === erreurs.web.valeurs.slice(3).reduce((a, b) => a + b, 0), 'une série relevée il y a trente minutes se recale de trois tranches (ses trois plus vieilles tombent)');
const unSeul = c._erreursDe({ mobile: { data: [[Math.floor(maintenant / 1000) - 60, [{ count: 4 }]]] } }, maintenant, {});
verifier(c._chiffresErreurs(unSeul.autre, maintenant).heure === 4 && c._chiffresErreurs(unSeul.ios, maintenant).jour === 0, 'une réponse mobile sans groupe compte dans « autre », sans inventer d iPhone');

console.log('\n== Les sessions des 24 h');
const liaison = { org: 'forgeme', web: 'forgeme-web', mobile: 'forgeme-mobile', ids: { web: '4512197441683536', mobile: '4512197449351248' } };
const s24 = c._sessions24De(faux('sessions-24h', maintenant), liaison);
verifier(s24.web.sessions === 230 && s24.web.utilisateurs === 184 && s24.web.taux === 99.65 && s24.web.serie.length === 24, 'web : 230 sessions, 184 utilisateurs, 99,65 % sans plantage', JSON.stringify(s24.web));
verifier(s24.mobile.sessions === 412 && s24.mobile.taux === 99.32, 'mobile : 412 sessions, 99,32 %');

console.log('\n== Les voyants, l état global');
const sondeOk = { ...c._suivreSonde(null, OK, { le: new Date(maintenant - 20e3) }).sonde };
const base = { liaison, sondes: { web: sondeOk, landing: sondeOk, hub: sondeOk }, erreurs, sessions24: s24, alertes: [], maintenant };
const v = c._voyantsDe(base);
verifier(Object.keys(v).join(',') === 'web,landing,ios,android,hub', 'les services : ceux qu on sonde et ceux que Sentry suit, dans l ordre', Object.keys(v).join(','));
verifier(v.web.etat === 'vert' && /Répond en 180\sms/.test(v.web.raison) && /3 erreurs dans l'heure/.test(v.web.raison) && /99,6\s% sans plantage/.test(v.web.raison), 'web vert : temps de réponse, erreurs de l heure, sans plantage (jamais arrondi vers le haut)', v.web.raison);
verifier(v.ios.etat === 'orange' && v.ios.genre === 'erreurs' && /Pic : 14 erreurs dans l'heure/.test(v.ios.raison), 'iPhone orange : le pic', v.ios.raison);
verifier(v.android.etat === 'vert', 'Android vert');
const g = c._globalDe(v);
verifier(g.etat === 'orange' && g.phrase === '1 point à surveiller', 'état global : « 1 point à surveiller »', g.phrase);
const panne = c._suivreSonde(c._suivreSonde(sondeOk, KO, { le: new Date(maintenant - 70e3) }).sonde, KO, { le: new Date(maintenant - 10e3) }).sonde;
const v2 = c._voyantsDe({ ...base, sondes: { ...base.sondes, landing: panne } });
verifier(v2.landing.etat === 'rouge' && v2.landing.genre === 'panne' && v2.landing.raison === 'HTTP 503' && v2.landing.depuis, 'la landing en panne : rouge, HTTP 503, avec son début', JSON.stringify(v2.landing));
const g2 = c._globalDe(v2);
verifier(g2.etat === 'rouge' && g2.phrase === '1 incident · 1 à surveiller', 'état global : « 1 incident · 1 à surveiller »', g2.phrase);
const v3 = c._voyantsDe({ ...base, alertes: [{ type: 'nouvelle', titre: 'Nouvelle erreur', app: 'web', le: new Date(maintenant - 5 * 60e3) }, { type: 'regression', titre: 'Erreur revenue', app: 'web', le: new Date(maintenant - 2 * 3600e3) }] });
verifier(v3.web.etat === 'orange' && /^Nouvelle erreur à/.test(v3.web.raison), 'une nouvelle erreur dans l heure : orange ; celle d il y a deux heures ne compte plus', v3.web.raison);
const vieille = c._voyantsDe({ ...base, alertes: [{ type: 'regression', titre: 'Erreur revenue', app: 'web', le: new Date(maintenant - 61 * 60e3) }] });
verifier(vieille.web.etat === 'vert', 'une alerte d il y a une heure et une minute ne touche plus le voyant', vieille.web.raison);
const v4 = c._voyantsDe({ ...base, alertes: [{ type: 'pic', titre: "Pic d'erreurs", app: 'mobile', le: new Date(maintenant - 60e3) }] });
verifier(v4.android.etat === 'orange', 'une alerte du projet mobile touche iPhone et Android');
const v5 = c._voyantsDe({ ...base, sessions24: { ...s24, mobile: { ...s24.mobile, taux: 96.5 } } });
verifier(v5.android.etat === 'rouge' && v5.android.genre === 'plantages', 'sous 97 % sans plantage : rouge');
const v6 = c._voyantsDe({ ...base, sessions24: { ...s24, mobile: { sessions: 12, taux: 50 } } });
verifier(v6.android.etat === 'vert', 'sous vingt sessions, aucun taux n est affirmé');
const lente = { ...sondeOk, etat: 'lent', ms: 4200 };
verifier(c._voyantsDe({ ...base, sondes: { ...base.sondes, landing: lente } }).landing.etat === 'orange', 'une landing lente : orange');
verifier(c._voyantsDe({ ...base, sondes: { ...base.sondes, hub: { ...sondeOk, le: new Date(maintenant - 10 * 60e3) } } }).hub.etat === 'gris', 'une sonde muette depuis dix minutes : gris, pas vert');
verifier(c._globalDe({ a: { etat: 'vert' } }).phrase === 'Tout fonctionne' && c._globalDe({}).phrase === 'Pas encore de mesure', '« Tout fonctionne », et rien d affirmé sans mesure');
verifier(c._voyantsDe({ liaison: { web: '', mobile: '' }, sondes: { fonctions: sondeOk } }).fonctions.etat === 'vert', 'la fonction sondée a son voyant');
verifier(!('fonctions' in v), 'sans adresse de fonction, pas de voyant (rien d inventé)');

console.log('\n== La vue du client');
const vue = c._salleClient({ voyants: v2, sondes: { web: sondeOk, landing: panne, hub: sondeOk } });
const brut = JSON.stringify(vue);
verifier(vue.global.etat === 'rouge' && vue.global.phrase === 'Un service perturbé, nous sommes dessus', 'la phrase globale du client', vue.global.phrase);
verifier(vue.services.find((x) => x.cle === 'landing').phrase.startsWith('Inaccessible depuis ') && /\d{2} h \d{2}/.test(vue.services.find((x) => x.cle === 'landing').phrase), 'la landing : « Inaccessible depuis 14 h 02. Nous sommes dessus. »');
verifier(vue.services.find((x) => x.cle === 'ios').phrase === 'Quelques erreurs repérées, nous les suivons', 'iPhone : en mots simples');
verifier(vue.services.every((x) => ['Application web', 'Site vitrine', 'Application iPhone', 'Application Android', 'Votre espace Capmedia', "Serveur de l'application"].includes(x.nom)), 'les noms du client');
verifier(!/http|HTTP|forgeme\.net|capmedia\.app|\bms\b|503|Sentry|erreurs dans l'heure|Répond/.test(brut), 'aucune adresse, aucun code, aucun temps de réponse, aucun mot technique', brut.slice(0, 300));
verifier(vue.dispo.length === 2 && vue.dispo.every((d) => d.bande.length === 48) && vue.dispo[0].pct === 100, 'la disponibilité : le web et la landing, 48 demi-heures chacune (pas le Hub)', JSON.stringify(vue.dispo.map((d) => d.cle)));
verifier(c._bandeDe({ n: [...Array(282).fill(0), 1, 1, 1, 1, 1, 1], ko: [...Array(282).fill(0), 1, 1, 1, 0, 0, 0] }).slice(-1) === 'r' && c._bandeDe({ n: [...Array(282).fill(0), 1, 1, 1, 1, 1, 1], ko: [...Array(282).fill(0), 1, 0, 0, 0, 0, 0] }).slice(-1) === 'o', 'une demi-heure à moitié en échec : rouge ; un échec : orange');
verifier(c._phraseClient({ etat: 'orange', genre: 'lent' }) === "Plus lent que d'habitude" && c._phraseClient({ etat: 'vert' }) === 'Fonctionne normalement' && c._phraseClient(null) === 'Pas encore mesuré', 'les phrases');
verifier(!/\u2014/.test(brut + JSON.stringify(v2)), 'aucun tiret cadratin');

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
