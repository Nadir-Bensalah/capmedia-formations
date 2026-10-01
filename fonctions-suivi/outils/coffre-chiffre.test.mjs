/* ==========================================================================
   CAPMEDIA CLIENT HUB · le chiffrement du coffre-fort, sans navigateur

   Le module du navigateur (coffre-chiffre.js) tourne tel quel sous Node :
   WebCrypto y est le même. On prouve ici ce qui ne dépend ni de la base
   ni de l'écran : la liste de mots, le tirage, l'aller-retour, le refus
   d'une mauvaise phrase, le lien de chaque chiffré à sa place, et le
   changement de phrase qui ne touche pas aux entrées.

     node fonctions-suivi/outils/coffre-chiffre.test.mjs
   ========================================================================== */

import {
  genererPhrase, normaliserPhrase, entropiePhrase, creerCoffre, ouvrirAvecPhrase, envelopperPourPhrase,
  chiffrerEntree, dechiffrerEntree, envelopperPourAppareil, ouvrirAvecAppareil, aleatoire, versB64, deB64,
  PhraseRefusee, ITERATIONS, ITERATIONS_MAX, MOTS_PAR_PHRASE, nouvelleCle,
} from '../../agence/suivi/assets/js/coffre-chiffre.js';
import { MOTS_COFFRE } from '../../agence/suivi/assets/js/mots-coffre.js';

let ok = 0; const ecarts = [];
const verifier = (c, m, detail) => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${detail ? ` · ${detail}` : ''}`); } };
const leve = async (p) => { try { await p; return null; } catch (e) { return e; } };

console.log('\n== La liste de mots');
verifier(MOTS_COFFRE.length >= 2048, `au moins 2 048 mots (${MOTS_COFFRE.length})`);
verifier(new Set(MOTS_COFFRE).size === MOTS_COFFRE.length, 'aucun doublon');
verifier(MOTS_COFFRE.every((m) => /^[a-z]{3,12}$/.test(m)), 'que des minuscules sans accent ni trait d union');

console.log('\n== La phrase');
const p1 = genererPhrase();
const mots = p1.split(' ');
verifier(mots.length === MOTS_PAR_PHRASE && MOTS_PAR_PHRASE >= 6 && MOTS_PAR_PHRASE <= 8, `${MOTS_PAR_PHRASE} mots`, p1);
verifier(mots.every((m) => MOTS_COFFRE.includes(m)) && new Set(mots).size === mots.length, 'des mots de la liste, distincts');
verifier(entropiePhrase() > 75, `plus de 75 bits de hasard (${entropiePhrase().toFixed(1)})`);
const tirages = new Set(Array.from({ length: 200 }, () => genererPhrase()));
verifier(tirages.size === 200, 'deux cents tirages, deux cents phrases différentes');
verifier(normaliserPhrase('  Étoile-Lapin   CAFÉ ') === 'etoile lapin cafe', 'majuscules, accents et tirets sont pardonnés');

console.log('\n== Créer, ouvrir, refuser');
const t0 = Date.now();
const { enveloppe, cleCoffre } = await creerCoffre('atelier', p1);
const duree = Date.now() - t0;
verifier(enveloppe.iterations === ITERATIONS && ITERATIONS >= 600000, `PBKDF2 à ${ITERATIONS} tours (${duree} ms)`);
verifier(deB64(enveloppe.sel).length === 16 && deB64(enveloppe.iv).length === 12 && deB64(enveloppe.cle).length === 48, 'sel de 16 octets, IV de 12, clé enveloppée de 32 + 16');
verifier(!JSON.stringify(enveloppe).includes(mots[0]), 'l enveloppe ne contient pas la phrase');
const ouverte = await ouvrirAvecPhrase('atelier', enveloppe, p1);
verifier(Boolean(ouverte), 'la bonne phrase ouvre');
const ouverte2 = await ouvrirAvecPhrase('atelier', enveloppe, p1.toUpperCase().replace(/ /g, '-'));
verifier(Boolean(ouverte2), 'la même phrase tapée en majuscules avec des tirets ouvre aussi');
const mauvaise = await leve(ouvrirAvecPhrase('atelier', enveloppe, genererPhrase()));
verifier(mauvaise instanceof PhraseRefusee, 'une autre phrase est refusée');
const unMot = await leve(ouvrirAvecPhrase('atelier', enveloppe, mots.slice(0, -1).concat(mots[0] === 'lapin' ? 'chat' : 'lapin').join(' ')));
verifier(unMot instanceof PhraseRefusee, 'un seul mot faux suffit à refuser');
const autreProjet = await leve(ouvrirAvecPhrase('boutique', enveloppe, p1));
verifier(autreProjet instanceof PhraseRefusee, 'l enveloppe recopiée sous un autre projet ne s ouvre pas');
const faible = await leve(ouvrirAvecPhrase('atelier', { ...enveloppe, iterations: 1000 }, p1));
verifier(faible && /trop faible/.test(faible.message), 'un coffre qui annonce 1 000 tours est refusé d office');
const enorme = await leve(ouvrirAvecPhrase('atelier', { ...enveloppe, iterations: ITERATIONS_MAX + 1 }, p1));
verifier(enorme && /hors bornes/.test(enorme.message), `un coffre qui annonce plus de ${ITERATIONS_MAX} tours est refusé (pas de page bloquée)`);

console.log('\n== Les entrées');
const secret = 'Mdp-Tr3s-Secret!';
const V1 = { g: 1, n: 1 };
const e1 = await chiffrerEntree('atelier', 'e1', cleCoffre, { service: 'Stripe', lien: 'https://dashboard.stripe.com', identifiant: 'compta@atelier.test', motDePasse: secret, note: 'compte principal' }, V1);
const brut = JSON.stringify(e1);
verifier(!/Stripe|compta@|Secret|principal/.test(brut), 'le chiffré ne laisse rien lire', brut.slice(0, 80));
verifier(deB64(e1.iv).length === 12, 'IV de 12 octets');
const e1bis = await chiffrerEntree('atelier', 'e1', cleCoffre, { service: 'Stripe', motDePasse: secret }, V1);
verifier(e1bis.iv !== e1.iv, 'chaque chiffrement tire un IV neuf');
const court = await chiffrerEntree('atelier', 'e2', cleCoffre, { service: 'A', motDePasse: 'x' }, V1);
const long = await chiffrerEntree('atelier', 'e3', cleCoffre, { service: 'A', motDePasse: 'x'.repeat(60) }, V1);
verifier(court.donnees.length === long.donnees.length, 'la longueur du chiffré ne trahit pas celle du mot de passe');
const lu = await dechiffrerEntree('atelier', 'e1', ouverte, e1);
verifier(lu.motDePasse === secret && lu.service === 'Stripe' && lu.note === 'compte principal', 'la clé rouverte relit l entrée');
verifier(await leve(dechiffrerEntree('atelier', 'autre-id', ouverte, e1)), 'une entrée recopiée sous un autre identifiant ne se lit plus');
verifier(await leve(dechiffrerEntree('boutique', 'e1', ouverte, e1)), 'ni sous un autre projet');
const abime = { ...e1, donnees: versB64(deB64(e1.donnees).map((o, i) => (i === 5 ? o ^ 1 : o))) };
verifier(await leve(dechiffrerEntree('atelier', 'e1', ouverte, abime)), 'un seul bit changé est détecté');

console.log('\n== Pas de retour à une version antérieure');
const e1v2 = await chiffrerEntree('atelier', 'e1', cleCoffre, { service: 'Stripe', motDePasse: 'nouveau-mdp' }, { g: 1, n: 2 });
verifier((await dechiffrerEntree('atelier', 'e1', ouverte, e1v2)).motDePasse === 'nouveau-mdp', 'la version 2 se lit');
verifier(await leve(dechiffrerEntree('atelier', 'e1', ouverte, { ...e1, n: 3 })), 'l ancien chiffré remis en base sous n = 3 est refusé');
verifier(await leve(dechiffrerEntree('atelier', 'e1', ouverte, { ...e1v2, n: 1 })), 'un n qui ne correspond pas au chiffré est refusé');
verifier(await leve(dechiffrerEntree('atelier', 'e1', ouverte, { ...e1, g: 2 })), 'une génération de clé qui ne correspond pas est refusée');
verifier(await leve(chiffrerEntree('atelier', 'e1', cleCoffre, { service: 'x' }, { g: 1, n: 0 })), 'n vaut 1 au moins');
verifier(await leve(dechiffrerEntree('atelier', 'e1', ouverte, { iv: e1.iv, donnees: e1.donnees })), 'une entrée sans g ni n est refusée');

console.log('\n== Changer la phrase renouvelle la clé');
const p2 = genererPhrase();
const cle2 = await nouvelleCle();
const env2 = await envelopperPourPhrase('atelier', cle2, p2);
verifier(env2.sel !== enveloppe.sel && env2.cle !== enveloppe.cle, 'sel et enveloppe neufs');
const e1g2 = await chiffrerEntree('atelier', 'e1', cle2, await dechiffrerEntree('atelier', 'e1', ouverte, e1v2), { g: 2, n: 3 });
verifier(e1g2.donnees !== e1v2.donnees, 'l entrée est rechiffrée');
verifier(await leve(ouvrirAvecPhrase('atelier', env2, p1)) instanceof PhraseRefusee, 'l ancienne phrase n ouvre plus la nouvelle enveloppe');
const ouverte3 = await ouvrirAvecPhrase('atelier', env2, p2);
verifier((await dechiffrerEntree('atelier', 'e1', ouverte3, e1g2)).motDePasse === 'nouveau-mdp', 'la nouvelle phrase relit l entrée rechiffrée');
verifier(await leve(dechiffrerEntree('atelier', 'e1', ouverte, e1g2)), 'l ancienne clé, même gardée en mémoire, ne lit plus l entrée rechiffrée');
verifier(await leve(envelopperPourPhrase('atelier', ouverte, 'trois mots seulement')), 'une phrase de moins de six mots est refusée');

console.log('\n== Un appareil (sortie PRF simulée)');
const sortie = aleatoire(32); const selPrf = aleatoire(32);
const app = await envelopperPourAppareil('atelier', 'a1', ouverte, sortie, selPrf);
const fiche = { ...app, selPrf: versB64(selPrf) };
const parAppareil = await ouvrirAvecAppareil('atelier', 'a1', fiche, sortie);
verifier((await dechiffrerEntree('atelier', 'e1', parAppareil, e1)).motDePasse === secret, 'la sortie PRF rouvre le coffre');
verifier(await leve(ouvrirAvecAppareil('atelier', 'a1', fiche, aleatoire(32))), 'une autre sortie PRF est refusée');
verifier(await leve(ouvrirAvecAppareil('atelier', 'a2', fiche, sortie)), 'la copie d un appareil ne vaut pas pour un autre');

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
process.exit(ecarts.length ? 1 : 0);
