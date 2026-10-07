/* ==========================================================================
   CAPMEDIA CLIENT HUB · le regroupement des lettres, sans base

   La fenêtre (dix minutes de calme, une heure au plus), la fusion d'une
   demande qui a connu plusieurs événements, et le texte du récapitulatif :
   objet, accords, vouvoiement, ni tiret cadratin ni « null ».

     node fonctions-suivi/outils/regroupement.test.mjs
   ========================================================================== */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Timestamp } = require('firebase-admin/firestore');
const r = require('../regroupement.js');
const courriels = require('../courriels.js');
const communication = require('../communication.js');

let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${String(d).slice(0, 400)}` : ''}`); } };

const MIN = 60 * 1000;
const T0 = Date.parse('2026-10-06T09:00:00Z');
const a = (min) => T0 + min * MIN;
const ts = (min) => Timestamp.fromMillis(a(min));

console.log('\n== La fenêtre');
verifier(r.CALME_MS === 10 * MIN && r.PLAFOND_MS === 60 * MIN, 'dix minutes de calme, une heure au plus (constantes nommées)');
verifier(!r.estMur([], a(100)), 'une file vide n est jamais mûre');
verifier(!r.estMur([a(0)], a(9)), 'un événement il y a 9 minutes : on attend');
verifier(r.estMur([a(0)], a(10)), 'dix minutes de calme : la file part');
verifier(!r.estMur([a(0), a(5)], a(12)), 'un nouvel événement relance la fenêtre (glissante)');
verifier(r.estMur([a(0), a(5)], a(15)), 'dix minutes après le dernier : elle part');
const continu = Array.from({ length: 13 }, (_, i) => a(i * 5));
verifier(!r.estMur(continu.slice(0, 12), a(58)), 'un client très actif : on attend encore avant le plafond');
verifier(r.estMur(continu, a(60)), 'mais une heure après le premier événement, la file part quand même (plafond)');

console.log('\n== La fusion d une demande');
const ev = (id, modele, min, variables, objet = 't1') => ({ id, modele, evenement: modele, objet, depose: ts(min), variables });
const base = { numero: 'FM-012', titre: 'Le bouton Valider', lien: 'https://capmedia.app/suivi/ticket?t=t1', projetNom: 'ForgeMe' };
const fusion = r.fusionner([
  ev('b', 'statut', 2, { ...base, statutAvant: 'nouveau', statutApres: 'en-cours' }),
  ev('a', 'ticket-cree', 1, { ...base, parLEquipe: false }),
]);
verifier(fusion.length === 1 && fusion[0].cree === true && fusion[0].statut === 'en-cours', 'créée puis passée en cours : une seule ligne, état final', JSON.stringify(fusion));
verifier(courriels.quoiDeLaLigne(fusion[0]) === 'Nouvelle demande, en cours', '« Nouvelle demande, en cours »', courriels.quoiDeLaLigne(fusion[0]));
const deux = r.fusionner([
  ev('a', 'statut', 1, { ...base, statutApres: 'en-cours' }),
  ev('b', 'statut', 2, { ...base, statutApres: 'a-valider' }),
  ev('c', 'message', 3, { ...base, texte: 'Livré.' }),
  ev('d', 'message', 4, { ...base, texte: 'Encore.' }),
]);
verifier(courriels.quoiDeLaLigne(deux[0]) === 'Attend votre validation, 2 nouveaux messages', 'deux statuts puis deux messages : le dernier statut, les messages comptés', courriels.quoiDeLaLigne(deux[0]));
verifier(courriels.quoiDeLaLigne(r.fusionner([ev('a', 'resolu', 1, base)])[0]) === 'Désormais terminée', 'terminée : « Désormais terminée »');
verifier(courriels.quoiDeLaLigne(r.fusionner([ev('a', 'message', 1, base)])[0]) === 'Un nouveau message', 'un message : « Un nouveau message » (singulier)');
verifier(courriels.quoiDeLaLigne(r.fusionner([ev('a', 'qualification', 1, { ...base, qualification: 'a-chiffrer', lien: 'https://capmedia.app/suivi/hub#/projets/p/demandes/t1' })])[0]) === 'Un devis va vous être proposé', 'à chiffrer : « Un devis va vous être proposé »');
verifier(courriels.quoiDeLaLigne(r.fusionner([ev('a', 'ticket-cree', 1, { ...base, parLEquipe: true })])[0]) === 'Nouvelle demande ouverte pour vous', 'ouverte par l équipe : « Nouvelle demande ouverte pour vous »');
const creeReçue = r.fusionner([ev('a', 'ticket-cree', 1, base), ev('b', 'statut', 2, { ...base, statutApres: 'nouveau' })]);
verifier(courriels.quoiDeLaLigne(creeReçue[0]) === 'Nouvelle demande', 'créée puis revenue « reçue » : rien de plus que « Nouvelle demande »');
const liens = r.fusionner([ev('a', 'qualification', 1, { ...base, qualification: 'a-chiffrer', lien: 'https://capmedia.app/suivi/hub#/x' }), ev('b', 'message', 2, base)]);
verifier(liens[0].lien === base.lien, 'le lien direct de la demande l emporte sur celui du Hub');

console.log('\n== Un seul événement : la lettre d aujourd hui');
const seul = ev('a', 'ticket-cree', 1, { ...base, cote: 'client', parLEquipe: true, par: 'Camille Martin', description: 'x' });
const l1 = r.composer([seul], { projetId: 'p', projetNom: 'ForgeMe', nom: 'Camille Martin' });
verifier(l1.modele === 'ticket-cree' && l1.variables === seul.variables && l1.evenement === 'ticket-cree', 'même modèle, mêmes variables, même événement');
const avant = courriels.rendre('ticket-cree', seul.variables);
const apres = courriels.rendre(l1.modele, l1.variables);
verifier(avant.objet === apres.objet && avant.texte === apres.texte && avant.html === apres.html, 'donc le même texte, au caractère près');

console.log('\n== Sept demandes en rafale');
const sept = Array.from({ length: 7 }, (_, i) => ev(`e${i}`, 'ticket-cree', i, { numero: `FM-0${10 + i}`, titre: `Demande ${i + 1}`, lien: `https://capmedia.app/suivi/ticket?t=t${i}`, parLEquipe: true, projetNom: 'ForgeMe', cote: 'client' }, `t${i}`));
const recap = r.composer(sept, { projetId: 'pFM', projetNom: 'ForgeMe', nom: 'Sébastien Durand' });
verifier(recap.modele === 'recapitulatif' && recap.variables.lignes.length === 7 && recap.variables.total === 7 && recap.variables.nouvelles === 7, 'un récapitulatif, sept lignes', JSON.stringify(recap.variables).slice(0, 200));
const rendu = courriels.rendre(recap.modele, recap.variables);
verifier(rendu.objet === 'ForgeMe · 7 nouvelles demandes', 'objet : « ForgeMe · 7 nouvelles demandes »', rendu.objet);
verifier(/^Bonjour Sébastien,$/m.test(rendu.texte), 'il salue le destinataire par son prénom');
verifier((rendu.texte.match(/^Voir la demande : https:\/\/capmedia\.app\/suivi\/ticket\?t=t\d$/gm) || []).length === 7, 'sept liens, un par demande');
verifier(/FM-010 · Demande 1\nNouvelle demande ouverte pour vous/.test(rendu.texte), 'une ligne : numéro, titre, ce qui s est passé');
verifier(rendu.texte.includes('Ouvrir mes demandes : https://capmedia.app/suivi/hub#/projets/pFM/demandes'), 'le bouton mène aux demandes du projet');
verifier((rendu.html.match(/Voir la demande<\/a>/g) || []).length === 7 && rendu.html.includes('Ouvrir mes demandes'), 'le HTML porte les sept liens et le bouton');

console.log('\n== Les accords, le ton, la propreté');
const melange = [...sept.slice(0, 2), ev('m1', 'statut', 8, { numero: 'FM-001', titre: 'Ancienne', lien: 'https://capmedia.app/suivi/ticket?t=v1', statutApres: 'en-cours' }, 'v1'), ev('m2', 'message', 9, { numero: 'FM-002', titre: 'Autre', lien: 'https://capmedia.app/suivi/ticket?t=v2' }, 'v2')];
const r2 = courriels.rendre('recapitulatif', r.composer(melange, { projetId: 'pFM', projetNom: 'ForgeMe', nom: 'Camille' }).variables);
verifier(r2.objet === 'ForgeMe · 2 nouvelles demandes et 2 mises à jour', 'pluriels : « 2 nouvelles demandes et 2 mises à jour »', r2.objet);
const r3 = courriels.rendre('recapitulatif', r.composer([sept[0], melange[2]], { projetNom: 'ForgeMe' }).variables);
verifier(r3.objet === 'ForgeMe · 1 nouvelle demande et 1 mise à jour', 'singuliers : « 1 nouvelle demande et 1 mise à jour »', r3.objet);
verifier(/^Bonjour,$/m.test(r3.texte), 'sans nom : « Bonjour, »');
const r4 = courriels.rendre('recapitulatif', r.composer([melange[2], melange[3]], { projetNom: 'ForgeMe' }).variables);
verifier(r4.objet === 'ForgeMe · 2 mises à jour de vos demandes', 'mises à jour seules : « 2 mises à jour de vos demandes »', r4.objet);
const r5 = courriels.rendre('recapitulatif', r.composer([ev('a', 'ticket-cree', 1, base), ev('b', 'statut', 2, { ...base, statutApres: 'en-cours' })], { projetNom: 'ForgeMe' }).variables);
verifier(r5.objet === 'ForgeMe · 1 nouvelle demande' && /Nouvelle demande, en cours/.test(r5.texte), 'deux événements, une demande : une ligne', r5.objet);
const tous = [rendu, r2, r3, r4, r5];
const sale = tous.filter((x) => /[—–]|null|undefined|NaN|\[object/.test(`${x.objet}\n${x.texte}\n${x.html}`));
verifier(sale.length === 0, 'ni tiret cadratin ni demi-cadratin, ni null, undefined, NaN', sale.map((x) => x.objet).join(' | '));
verifier(tous.every((x) => !/\btu\b|\bton\b|\bta\b|\btes\b/i.test(x.texte)), 'vouvoiement partout');
const vide = courriels.rendre('recapitulatif', { lignes: [{ numero: null, titre: undefined, lien: 'javascript:alert(1)', statut: 'inconnu' }, {}] });
verifier(!/null|undefined|javascript:/.test(`${vide.objet}${vide.texte}${vide.html}`) && /Demande sans titre/.test(vide.texte), 'des variables trouées ou piégées : rien de cassé, aucun lien douteux', vide.texte);
const injecte = courriels.rendre('recapitulatif', { projetNom: 'X', lignes: [{ titre: '<img src=x onerror=alert(1)>', cree: true }, { titre: 'b', cree: true }] });
verifier(!injecte.html.includes('<img src=x') && injecte.html.includes('&lt;img'), 'un titre saisi par le client est échappé');

console.log('\n== Les très longues rafales');
const quarante = Array.from({ length: 40 }, (_, i) => ev(`x${i}`, 'ticket-cree', i, { numero: `FM-${100 + i}`, titre: `T${i}`, lien: `https://capmedia.app/suivi/ticket?t=x${i}` }, `x${i}`));
const c40 = r.composer(quarante, { projetNom: 'ForgeMe' });
const r40 = courriels.rendre('recapitulatif', c40.variables);
verifier(c40.variables.lignes.length === r.LIGNES_MAX && r40.objet === 'ForgeMe · 40 nouvelles demandes', `les ${r.LIGNES_MAX} premières lignes, le décompte complet`, r40.objet);
verifier(/10 autres demandes ont également été mises à jour : vous les retrouverez dans votre espace\./.test(r40.texte), 'et la note renvoie à l espace pour les dix autres');

console.log('\n== Ce qui est regroupé, ce qui ne l est pas');
const REG = [...communication.REGROUPES].sort().join(',');
verifier(REG === ['ferme', 'message', 'qualification', 'resolu', 'statut', 'ticket-cree'].sort().join(','), 'regroupés : la vie des demandes seulement', REG);
const jamais = ['code', 'connexion-equipe', 'invitation', 'invitation-testeur', 'invitation-equipe', 'ouverture', 'devis', 'facture', 'facture-echeance', 'facture-retard', 'reglement-declare', 'devis-reponse', 'assignation', 'relance'];
verifier(jamais.every((m) => !communication.REGROUPES.has(m)), 'jamais : connexion, invitations, ouverture, finance, équipe');
verifier(communication.cleAttente('A@B.fr', 'Pr1') === communication.cleAttente(' a@b.fr ', 'Pr1') && communication.cleAttente('a@b.fr', 'Pr1') !== communication.cleAttente('a@b.fr', 'pr1'), 'une file par adresse (casse ignorée) et par projet (casse gardée)');

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
process.exit(ecarts.length ? 1 : 0);
