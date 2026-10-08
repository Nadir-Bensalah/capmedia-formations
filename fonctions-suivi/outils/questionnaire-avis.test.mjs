/* ==========================================================================
   CAPMEDIA TEST · le questionnaire d'appréciation, source unique

   Ce qu'on demande au testeur et ce que le Cockpit et le Hub restituent
   viennent d'un seul fichier, questionnaire-avis.js. L'épreuve charge CE
   fichier (il n'importe rien), jamais une copie, et vérifie :
     - que les réponses déjà enregistrées restent lisibles (aucune clé
       renommée) ;
     - que « a répondu » se mesure pareil partout, et ne compte ni des
       premiers pas seuls ni un champ vide ;
     - que les trois écrans lisent bien la source, et n'ont plus de liste
       ou de chiffre écrits à la main ;
     - que les remarques libres partent bornées.

     node fonctions-suivi/outils/questionnaire-avis.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import {
  FAMILLES_AVIS, MOMENTS_AVIS, questionsAvis, famillesDu, lireReponse, aRepondu, avisRepondus,
  resumeQuestionnaire, REMARQUE_MAX, remarqueAEnvoyer,
  SEUIL_AVIS, MOMENTS_ENVOYES, questionsRequises, validerAvis, avisRendu,
} from '../../agence/suivi/assets/js/questionnaire-avis.js';

let ok = 0; const ecarts = [];
const verifier = (c, libelle, detail = '') => {
  if (c) { ok += 1; console.log('  ok     ' + libelle); }
  else { ecarts.push(libelle); console.log('  ÉCART  ' + libelle + (detail ? ` · ${detail}` : '')); }
};
const egal = (a, b, libelle) => verifier(JSON.stringify(a) === JSON.stringify(b), libelle, `${JSON.stringify(a)} au lieu de ${JSON.stringify(b)}`);

console.log('\n== Les réponses déjà enregistrées restent lisibles');
/* Les 35 clés écrites depuis le 22/09/2026 (commit 7b61bfd) et les deux de
   la note du test. Une clé qui disparaît ici, c'est une réponse de testeur
   que plus aucun écran ne montre. */
const HISTORIQUES = [
  'impression.sert-a-quoi', 'impression.compris', 'impression.oeil',
  'esthetique.belle', 'esthetique.moderne', 'esthetique.couleurs', 'esthetique.lisible', 'esthetique.aere', 'esthetique.coherent', 'esthetique.reussi',
  'facilite.trouve', 'facilite.vocabulaire', 'facilite.bloque', 'facilite.erreurs', 'facilite.recommande',
  'utilite.probleme', 'utilite.vraie-vie', 'utilite.plus-utile', 'utilite.inutile', 'utilite.manque',
  'argent.paierait', 'argent.spontane', 'argent.trop-cher', 'argent.cher', 'argent.bonne-affaire', 'argent.suspect', 'argent.gratuit',
  'performance.rapide', 'performance.attentes', 'performance.plantages', 'performance.comparee',
  'libre.garder', 'libre.changer', 'libre.une-phrase', 'libre.agace',
  'test.note', 'test.commentaire',
];
const ids = questionsAvis().map((x) => x.id);
egal(ids, HISTORIQUES, 'chaque clé enregistrée a toujours sa question, dans le même ordre');
verifier(new Set(ids).size === ids.length, 'aucune question en double');
verifier(questionsAvis().every(({ f }) => MOMENTS_AVIS[f.quand]), 'chaque famille a un moment connu');
verifier(questionsAvis().every(({ q }) => ['texte', 'echelle', 'note10', 'choix', 'euros'].includes(q.type)), 'chaque question a une forme que les deux écrans savent dessiner');
verifier(questionsAvis().filter(({ q }) => q.type === 'choix').every(({ q }) => Array.isArray(q.options) && q.options.length > 1), 'chaque question à choix a ses options');

const ancienne = { 'esthetique.belle': '4', 'facilite.recommande': '8', noteTest: { note: 3, commentaire: 'Le lien TestFlight manquait.', le: new Date() }, remarques: [{ texte: 'après coup' }] };
egal(lireReponse(ancienne, 'esthetique.belle'), '4', 'une réponse à plat se relit telle quelle');
egal(lireReponse(ancienne, 'test.note'), 3, 'la note du test se relit dans « noteTest »');
egal(lireReponse(ancienne, 'test.commentaire'), 'Le lien TestFlight manquait.', 'et son commentaire');
egal(lireReponse({ 'esthetique.belle': '' }, 'esthetique.belle'), undefined, 'un champ vide n\'est pas une réponse');
egal(lireReponse({ 'esthetique.belle': null }, 'esthetique.belle'), undefined, 'un champ nul non plus');
egal(lireReponse({ 'esthetique.belle': 0 }, 'esthetique.belle'), 0, 'mais un zéro en est une');
egal(lireReponse({ noteTest: 'x' }, 'test.note'), undefined, 'une note du test mal formée ne fait pas planter');
egal(lireReponse(null, 'esthetique.belle'), undefined, 'ni une appréciation absente');

console.log('\n== « A répondu » : la même mesure pour les trois écrans');
verifier(!aRepondu({ accueil: new Date(), testeur: 'x' }), 'des premiers pas seuls ne sont pas un avis');
verifier(!aRepondu({ termine: new Date(), remarques: [{ texte: 'x' }] }), 'une fin de test et des remarques non plus');
verifier(aRepondu({ 'impression.compris': 4 }, 'avant'), 'la première impression compte pour « avant »');
verifier(!aRepondu({ 'impression.compris': 4 }, 'apres'), 'mais pas pour « après »');
/* Le défaut d'avant : « après » ne se voyait qu'à une clé « esthetique. ».
   Un testeur qui avait répondu à la facilité et à l'argent seulement était
   relancé comme s'il n'avait rien dit. */
verifier(aRepondu({ 'facilite.recommande': '8' }, 'apres'), '« après » se voit à n\'importe quelle famille de la fin, pas à la seule esthétique');
verifier(aRepondu({ noteTest: { note: 4 } }, 'fin'), 'la note du test compte pour « en terminant »');
verifier(!aRepondu({ noteTest: { note: 4 } }, 'apres'), 'et pas pour « après »');
verifier(!aRepondu({ 'esthetique.belle': '  ' }, 'apres'), 'des espaces ne sont pas une réponse');
egal(avisRepondus([{ id: 'a', accueil: 1 }, { id: 'b', 'libre.garder': 'tout' }, null, { id: 'c', noteTest: { note: 2 } }]).map((a) => a.id), ['b', 'c'], 'ne restent que les appréciations qui portent une réponse');

console.log('\n== Les chiffres écrits aux testeurs et au client sont comptés dans la source');
const r = resumeQuestionnaire();
egal([r.avant, r.fin, r.apres, r.total, r.familles], [3, 2, 32, 37, 8], 'trois avant, deux en terminant, trente-deux après, huit familles');
verifier(r.total === r.avant + r.fin + r.apres, 'le total est la somme des trois moments');
verifier(famillesDu('apres').every(([, f]) => r.sujetsApres.includes(f.sujet || f.libelle.charAt(0).toLowerCase() + f.libelle.slice(1))), 'la phrase « ce qu\'on vous demandera » nomme chaque famille de la fin', r.sujetsApres);
verifier(FAMILLES_AVIS.test.equipe === true && FAMILLES_AVIS.test.questions.every((q) => q.equipe === true), 'la note du test est réservée à l\'équipe (M2), question par question');
verifier(Object.entries(FAMILLES_AVIS).filter(([, f]) => f.equipe).every(([cle]) => cle === 'test'), 'et elle seule');
const rc = resumeQuestionnaire({ pourClient: true });
egal([rc.total, rc.familles], [35, 7], 'le client compte 35 questions en 7 familles, sans la note du test');

console.log('\n== Les trois écrans lisent la source, pas une copie');
const lireJs = (f) => readFileSync(new URL(`../../agence/suivi/assets/js/${f}`, import.meta.url), 'utf8');
const testeur = lireJs('testeur.js'); const tests = lireJs('vues/tests.js'); const noyau = lireJs('noyau.js');
verifier(/from '\.\/questionnaire-avis\.js'/.test(noyau) && !/export const FAMILLES_AVIS/.test(noyau), 'le noyau ne garde plus sa propre liste, il réexporte la source');
verifier(!/startsWith\('(impression|esthetique)\.'\)/.test(testeur), 'l\'espace testeur ne devine plus « a répondu » à un préfixe');
verifier(!/Confus, pénible|Limpide, agréable|clair et faisable/.test(testeur), 'la note du test vient de la source, pas d\'un texte recopié');
verifier(!/L'esthétique, la facilité, l'utilité/.test(testeur), 'la page « Mon avis » ne résume plus le questionnaire à la main');
verifier(!/sept familles|Trois avant de commencer|Trois questions <b>avant/.test(tests), 'le Cockpit et le Hub ne comptent plus les questions à la main');
verifier(/lireReponse\(/.test(tests) && !/a\[cle\]|a\[id\]/.test(tests), 'la restitution lit chaque réponse par lireReponse, pas par une clé à plat');
verifier(/avisDe\(/.test(tests) && /avisAnonymes/.test(tests), 'et lit les réponses anonymes, pas les appréciations');

console.log('\n== Les remarques libres partent bornées');
egal(remarqueAEnvoyer({ texte: '   ' }).erreur ? 'refus' : 'parti', 'refus', 'une remarque vide ne part pas');
egal(remarqueAEnvoyer({ texte: 'x'.repeat(REMARQUE_MAX + 1) }).erreur ? 'refus' : 'parti', 'refus', `au-delà de ${REMARQUE_MAX} caractères non plus`);
egal(remarqueAEnvoyer({ texte: 'x'.repeat(REMARQUE_MAX) }).remarque.texte.length, REMARQUE_MAX, 'à la limite, elle part');
egal(remarqueAEnvoyer({ texte: '  Le bouton Retour est petit.  ', scenario: 'DI-01', plateforme: 'ios' }).remarque, { texte: 'Le bouton Retour est petit.', scenario: 'DI-01', plateforme: 'ios' }, 'sur un scénario : texte nettoyé, scénario et plateforme');
egal(remarqueAEnvoyer({ texte: 'En général', scenario: '', plateforme: 'mac' }).remarque, { texte: 'En général' }, 'en général : ni scénario ni plateforme inventée');
egal(REMARQUE_MAX, 2000, 'la borne est celle du modèle et des règles (2 000)');

console.log('\n== L avis anonyme : ce qui part, et ce qui est refusé');
egal(SEUIL_AVIS, 3, 'rien ne se montre sous trois réponses');
egal(MOMENTS_ENVOYES, ['avant', 'apres'], 'le testeur envoie deux moments ; la note du test reste à part');
egal(questionsRequises('avant').map((x) => x.id), ['impression.compris'], 'avant : la seule question fermée est requise');
verifier(questionsRequises('apres').every(({ q }) => ['echelle', 'note10', 'choix'].includes(q.type)), 'après : les notes et les choix sont requis, jamais un texte ni un montant');
const complet = (quand) => Object.fromEntries(questionsRequises(quand).map(({ id, q }) => [id, q.type === 'choix' ? q.options[0] : (q.type === 'note10' ? 8 : 4)]));
egal(Object.keys(validerAvis('apres', complet('apres')).reponses || {}).length, questionsRequises('apres').length, 'un avis de fin complet part');
verifier(Boolean(validerAvis('apres', {}).manquantes), 'un avis vide est refusé, avec la liste de ce qui manque');
verifier(/Question inconnue/.test(validerAvis('apres', { ...complet('apres'), testeur: 'uid-karim' }).erreur || ''), 'un champ « testeur » glissé dans les réponses est refusé');
verifier(/Question inconnue/.test(validerAvis('apres', { ...complet('apres'), 'test.note': 5 }).erreur || ''), 'la note du test ne passe pas par l avis anonyme');
verifier(/Question inconnue/.test(validerAvis('avant', { ...complet('avant'), 'esthetique.belle': 4 }).erreur || ''), 'une question d un autre moment est refusée');
verifier(/hors bornes/.test(validerAvis('apres', { ...complet('apres'), 'esthetique.belle': 9 }).erreur || ''), 'une note hors de 1 à 5 est refusée');
verifier(/hors bornes/.test(validerAvis('apres', { ...complet('apres'), 'facilite.recommande': 11 }).erreur || ''), 'une recommandation hors de 0 à 10 est refusée');
verifier(/hors bornes/.test(validerAvis('apres', { ...complet('apres'), 'esthetique.couleurs': 'Superbes' }).erreur || ''), 'une option inventée est refusée');
egal(validerAvis('apres', { ...complet('apres'), 'argent.spontane': '4,5' }).reponses['argent.spontane'], 4.5, 'un montant à virgule devient un nombre');
egal(validerAvis('apres', { ...complet('apres'), 'libre.agace': 'x'.repeat(3000) }).reponses['libre.agace'].length, 2000, 'un texte est borné à 2 000 caractères');
verifier(validerAvis('apres', { ...complet('apres'), 'libre.agace': '   ' }).reponses['libre.agace'] === undefined, 'un texte vide n est pas une réponse');
verifier(Boolean(validerAvis('fin', {}).erreur), 'le moment « fin » ne s envoie pas ici');
verifier(avisRendu({ avisRendus: { apres: true } }, 'apres') && !avisRendu({ 'esthetique.belle': 4 }, 'apres'), 'seul « avisRendus », posé par le serveur, dit qu un avis est rendu');

console.log('\n== Le serveur valide avec la même liste, copie conforme');
const source = readFileSync(new URL('../../agence/suivi/assets/js/questionnaire-avis.js', import.meta.url), 'utf8');
const copie = readFileSync(new URL('../questionnaire-avis.mjs', import.meta.url), 'utf8');
verifier(source === copie, 'fonctions-suivi/questionnaire-avis.mjs est identique, octet pour octet', 'recopiez agence/suivi/assets/js/questionnaire-avis.js');
const serveur = readFileSync(new URL('../avis.js', import.meta.url), 'utf8');
verifier(/validerAvis\(/.test(serveur) && /import\('\.\/questionnaire-avis\.mjs'\)/.test(serveur), 'hubAvisTesteur valide avec cette copie');
const ecrit = (serveur.match(/t\.set\(refReponse, ([^;]+);/) || [])[1] || '';
verifier(ecrit === "{ moment, reponses: v.reponses })", 'la réponse anonyme ne porte que le moment et les réponses', ecrit);

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
