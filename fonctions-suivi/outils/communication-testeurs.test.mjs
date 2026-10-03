/* ==========================================================================
   CAPMEDIA TEST · ce que le serveur dit aux testeurs, à l'épreuve

   Sans émulateur : les lettres (marque Capmedia Test, « Votre campagne
   commence »), qui est prévenu quand une campagne s'ouvre, ce que porte un
   push de la conversation d'un testeur, et l'icône que le service des
   notifications choisit selon l'espace.

     node fonctions-suivi/outils/communication-testeurs.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const courriels = require('../courriels.js');
const lettres = require('../testeurs-lettres.js');
const push = require('../push.js');

let ok = 0; const ecarts = [];
const verifier = (condition, quoi, detail = '') => {
  if (condition) { ok += 1; console.log(`  ok     ${quoi}`); }
  else { ecarts.push(`${quoi}${detail ? ` (${detail})` : ''}`); console.log(`  ÉCART  ${quoi}${detail ? ` · ${detail}` : ''}`); }
};
const brut = /undefined|null|NaN|\[object/;

console.log('\n== Les lettres aux testeurs portent la marque Capmedia Test');
const variables = { prenom: 'Karim', email: 'karim@x.test', projetNom: 'Atelier', plateformes: ['ios'], lien: 'https://capmedia.app/suivi/testeur', auteur: 'Alex', texte: 'On regarde.', titre: 'Octobre', application: 'Atelier', scenarios: 43, fin: '13 octobre 2026' };
for (const modele of ['invitation-testeur', 'message-testeur-reponse', 'campagne-testeur']) {
  const r = courriels.rendre(modele, variables);
  verifier(r.texte.startsWith('CAPMEDIA TEST') && /Capmedia Test · https:\/\/capmedia\.app$/.test(r.texte), `${modele} : en-tête et signature « Capmedia Test » (texte)`);
  verifier(/>Capmedia Test<\/p>/.test(r.html) && /Capmedia Test · <a/.test(r.html) && !/Capmedia Digital/.test(r.html), `${modele} : en-tête et pied « Capmedia Test » (HTML), jamais Capmedia Digital`);
  verifier(/au titre de votre mission de test/.test(r.html) && !/suivi de votre projet/.test(r.html), `${modele} : le pied parle de sa mission de test, pas d un projet`);
  verifier(!/—/.test(`${r.objet}${r.texte}${r.html}`), `${modele} : aucun tiret cadratin`);
  verifier(!brut.test(`${r.objet}\n${r.texte}`), `${modele} : aucune valeur brute`);
}
const projet = courriels.rendre('message-projet', { projetNom: 'Atelier', auteur: 'Alex', texte: 'Bonjour', lien: 'x' });
verifier(/Capmedia Digital/.test(projet.html) && /suivi de votre projet/.test(projet.html) && !/Capmedia Test/.test(projet.html), 'une lettre au client garde Capmedia Digital et le suivi du projet');

console.log('\n== « Votre campagne commence »');
const c = courriels.rendre('campagne-testeur', variables);
verifier(/Atelier/.test(c.objet) && /commence/.test(c.objet), 'l objet nomme l application', c.objet);
verifier(/43 scénarios vous attendent/.test(c.texte) && /Vos scénarios : 43/.test(c.texte), 'le nombre de SES scénarios', c.texte);
verifier(/Fin prévue : 13 octobre 2026/.test(c.texte), 'la fin prévue');
verifier(/Commencer mes tests : https:\/\/capmedia\.app\/suivi\/testeur/.test(c.texte), 'le bouton mène à son espace');
verifier(/Réussi, Échec ou Sans objet/.test(c.texte), 'les verdicts nommés comme partout');
const un = courriels.rendre('campagne-testeur', { ...variables, scenarios: 1 });
verifier(/Un scénario vous attend/.test(un.texte), 'au singulier pour un seul scénario');
const zero = courriels.rendre('campagne-testeur', { prenom: 'Karim', titre: 'Octobre' });
verifier(/Vos scénarios arrivent/.test(zero.texte) && !/Vos scénarios :/.test(zero.texte) && !/Fin prévue/.test(zero.texte) && !brut.test(zero.texte), 'sans affectation ni date : « vos scénarios arrivent », aucune case vide', zero.texte);

console.log('\n== Qui est prévenu quand une campagne s ouvre');
const A = (avant, apres) => lettres._aPrevenir(avant, apres).sort().join(',');
verifier(A({ statut: 'preparation', testeurs: ['a', 'b'] }, { statut: 'en-cours', testeurs: ['a', 'b'] }) === 'a,b', 'à l ouverture : tous ses testeurs');
verifier(A(null, { statut: 'en-cours', testeurs: ['a'] }) === 'a', 'créée déjà en cours : ses testeurs');
verifier(A({ statut: 'en-cours', testeurs: ['a'] }, { statut: 'en-cours', testeurs: ['a', 'c'] }) === 'c', 'un testeur ajouté en cours : lui seul');
verifier(A({ statut: 'en-cours', testeurs: ['a'] }, { statut: 'en-cours', testeurs: ['a'], titre: 'autre' }) === '', 'une campagne en cours qu on retouche : personne');
verifier(A({ statut: 'preparation', testeurs: [] }, { statut: 'preparation', testeurs: ['a'] }) === '', 'en préparation : personne');
verifier(A({ statut: 'en-cours', testeurs: ['a'] }, { statut: 'close', testeurs: ['a'] }) === '', 'à la clôture : personne');
verifier(A({ statut: 'close', testeurs: ['a'] }, { statut: 'en-cours', testeurs: ['a', 'a', '', null] }) === 'a', 'rouverte : sans doublon ni valeur vide (la marque par testeur évite la seconde lettre)');
verifier(lettres._nombreDeScenarios({ a: ['s1', 's2'] }, 'a') === 2, 'ses scénarios, affectation en liste');
verifier(lettres._nombreDeScenarios({ a: { telephone: 'ios', web: true, cles: ['s1__ios', 's1__web', 's2__ios'], vague: 1 } }, 'a') === 3, 'ses scénarios, affectation par plateforme (modèle commun)');
verifier(lettres._nombreDeScenarios({}, 'a') === 0 && lettres._nombreDeScenarios(undefined, 'a') === 0, 'sans affectation : zéro');

console.log('\n== Le push de la conversation d un testeur');
const versEquipe = push.chargeTesteur({ m: { de: { uid: 'k', nom: 'Karim', cote: 'testeur' }, texte: 'Le lien TestFlight ne marche pas.' }, testeurId: 'k', prenom: 'Karim', versEquipe: true });
verifier(versEquipe.titre === 'Karim (testeur)', 'vers l équipe : « Karim (testeur) »', versEquipe.titre);
verifier(versEquipe.lien === 'cockpit#/testeurs-messages/k', 'le lien ouvre sa conversation dans le Cockpit', versEquipe.lien);
verifier(versEquipe.tag === 'testeur-k', 'une notification par testeur (tag)');
const versTesteur = push.chargeTesteur({ m: { de: { uid: 'a', nom: 'Alex Durand', cote: 'equipe' }, texte: '', pieces: [{ nom: 'secret.pdf', chemin: 'conversationsTesteurs/k/secret.pdf' }] }, testeurId: 'k', versEquipe: false });
verifier(versTesteur.titre === 'Alex Durand' && versTesteur.lien === 'testeur#/messages', 'vers le testeur : le nom de l auteur, le lien de sa bulle', JSON.stringify(versTesteur));
verifier(versTesteur.corps === 'Pièce jointe' && !/secret|conversationsTesteurs/.test(JSON.stringify(versTesteur)), 'une pièce seule : « Pièce jointe », jamais son nom ni son chemin', versTesteur.corps);

console.log('\n== L icône d une notification suit l espace');
const sw = readFileSync(new URL('../../agence/suivi/sw.js', import.meta.url), 'utf8');
const source = (sw.match(/const iconeDe = [\s\S]*?\n};/) || [''])[0];
const iconeDe = source ? vm.runInNewContext(`(${source.replace(/^const iconeDe = /, '').replace(/;$/, '')})`) : null;
verifier(Boolean(iconeDe), 'le service a une aide iconeDe');
if (iconeDe) {
  verifier(iconeDe('testeur#/messages') === 'assets/img/app-test.png', 'testeur : l icône de Capmedia Test');
  verifier(iconeDe('cockpit#/testeurs-messages/k') === 'assets/img/app-cockpit.png', 'cockpit : celle du Cockpit');
  verifier(iconeDe('hub#/messages/atelier') === 'assets/img/app-hub.png' && iconeDe('') === 'assets/img/app-hub.png', 'hub, ou rien : celle du Hub');
}
verifier(/icon: new URL\(iconeDe\(d\.lien\)/.test(sw), 'et c est elle que la notification affiche');

console.log('\n== Le manifeste de l espace Test');
const manifeste = JSON.parse(readFileSync(new URL('../../agence/suivi/testeur.webmanifest', import.meta.url), 'utf8'));
verifier(manifeste.name === 'Capmedia Test' && manifeste.start_url === './testeur' && manifeste.display === 'standalone', 'Capmedia Test, installable, ouvre l espace Test');
const html = readFileSync(new URL('../../agence/suivi/testeur.html', import.meta.url), 'utf8');
verifier(/<link rel="manifest" href="\.\/testeur\.webmanifest">/.test(html), 'testeur.html le déclare');

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
