/* ==========================================================================
   CAPMEDIA CLIENT HUB · des e-mails professionnels et cohérents (07/10/2026)

   Sans émulateur :
   1. la salutation : une seule fonction, « Bonjour Prénom, » (casse
      corrigée, prénoms composés, civilités, particules), « Bonjour, » sans
      prénom sûr ; le destinataire de l'envoi l'emporte sur les variables ;
   2. les montants : « 1 234,56 € HT » / « € TTC », jamais « EUR » ; la
      mention de franchise quand elle s'applique ;
   3. chaque modèle, chaque variante, rendu avec des variables pleines puis
      vides : aucun « Bonjour , », aucune valeur brute, aucun tiret
      cadratin, aucun « EUR », jamais d'objet qui finit par « : » ; chaque
      lettre au client salue ; aucune adresse nue dans une phrase du HTML ;
   4. le rendu gardé par le facteur : borné, sans code ni jeton ; le
      journal le montre tel quel, sinon reconstitue, et le dit ;
   5. le facteur l'écrit (lecture du source) et les clients reçoivent une
      lettre chacun.

     node fonctions-suivi/outils/emails-pro.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const c = require('../courriels.js');

let ok = 0; const ecarts = [];
const verifier = (condition, quoi, detail = '') => {
  if (condition) { ok += 1; console.log(`  ok     ${quoi}`); }
  else { ecarts.push(quoi); console.log(`  ÉCART  ${quoi}${detail ? ` · ${String(detail).slice(0, 240)}` : ''}`); }
};

console.log('\n== 1 · La salutation');
const cas = [
  ['SÉBASTIEN HOREMANS', 'Bonjour Sébastien,'],
  ['Sébastien Horemans', 'Bonjour Sébastien,'],
  ['sébastien horemans', 'Bonjour Sébastien,'],
  ['JEAN-PIERRE DUPONT', 'Bonjour Jean-Pierre,'],
  ['marie-élise de la tour', 'Bonjour Marie-Élise,'],
  ['Mme Claire Martin', 'Bonjour Claire,'],
  ['M. Paul Durand', 'Bonjour Paul,'],
  ['HOREMANS, Sébastien', 'Bonjour Sébastien,'],
  ["N'GOLO KANTÉ", "Bonjour N'Golo,"],
  ['DeAndre Smith', 'Bonjour DeAndre,'],
  ['de La Fontaine', 'Bonjour,'],
  ["d'Artagnan", 'Bonjour,'],
  ['J. Dupont', 'Bonjour,'],
  ['sebastien@exemple.test', 'Bonjour,'],
  ['Équipe Capmedia', 'Bonjour,'],
  ['', 'Bonjour,'],
  [null, 'Bonjour,'],
  [undefined, 'Bonjour,'],
  [{ nom: 'x' }, 'Bonjour,'],
];
const ratees = cas.filter(([n, attendu]) => c.salutation(n) !== attendu).map(([n, a]) => `${JSON.stringify(n)} → ${c.salutation(n)} (attendu ${a})`);
verifier(ratees.length === 0, `${cas.length} noms : casse, composés, civilités, particules, adresses`, ratees.join(' | '));

const sansCtx = c.rendre('devis', { numero: 'D-1', clientNom: 'SÉBASTIEN HOREMANS', montant: 100 });
verifier(/^Bonjour Sébastien,$/m.test(sansCtx.texte), 'sans contexte : le nom figé, en prénom', sansCtx.texte.split('\n')[4]);
const unSeul = c.rendre('devis', { numero: 'D-1', clientNom: 'Société Bleue SAS', montant: 100 }, { a: [{ email: 'l@x.test', nom: 'LÉA BERNARD' }] });
verifier(/^Bonjour Léa,$/m.test(unSeul.texte), 'un destinataire : son prénom, pas le nom du client du projet', unSeul.texte.split('\n')[4]);
const sansNom = c.rendre('devis', { numero: 'D-1', clientNom: 'Société Bleue SAS', montant: 100 }, { a: [{ email: 'l@x.test', nom: '' }] });
verifier(/^Bonjour,$/m.test(sansNom.texte), 'un destinataire sans nom : « Bonjour, », jamais le nom d une société', sansNom.texte.split('\n')[4]);
const deux = c.rendre('release', { projetNom: 'ForgeMe', version: '1.2' }, { a: [{ email: 'a@x.test', nom: 'Anne' }, { email: 'b@x.test', nom: 'Bruno' }] });
verifier(/^Bonjour,$/m.test(deux.texte), 'deux destinataires : personne en particulier', deux.texte.split('\n')[4]);
const equipe = c.rendre('ticket-cree', { cote: 'equipe', numero: 'A-1', titre: 'x', auteurNom: 'Camille' }, { a: [{ email: 'contact@capmedia.app', nom: 'Équipe Capmedia' }] });
verifier(/^Bonjour,$/m.test(equipe.texte) && /réservé à l(&#39;|')équipe Capmedia/.test(equipe.html) && !/votre projet/.test(equipe.html), 'à l équipe : « Bonjour, », et un pied qui ne dit pas « votre projet »');

console.log('\n== 2 · Les montants');
verifier(c.montantHT(1234.56) === '1 234,56 € HT', '« 1 234,56 € HT »', c.montantHT(1234.56));
verifier(c.montantTTC(1481.47, 1234.56) === '1 481,47 € TTC (1 234,56 € HT)', '« 1 481,47 € TTC (1 234,56 € HT) »', c.montantTTC(1481.47, 1234.56));
verifier(c.montantHT('') === '' && c.montantHT(undefined) === '' && c.euros('abc') === '', 'un montant absent ne s affiche pas');
const base = { numero: 'F-2026-0031', libelle: 'Refonte', projetNom: 'ForgeMe', montant: 1000, echeance: new Date('2026-11-30'), lien: 'https://capmedia.app/suivi/hub' };
const financier = ['devis', 'facture', 'facture-echeance', 'facture-retard', 'devis-reponse', 'reglement-declare'];
const vingt = financier.map((m) => [m, c.rendre(m, { ...base, tva: 20, ttc: 1200, reste: 1200, reponse: 'accepte' })]);
verifier(vingt.every(([, r]) => !/EUR|hors taxes/.test(`${r.objet}${r.texte}${r.html}`)), 'à TVA 20 : jamais « EUR » ni « hors taxes »', vingt.filter(([, r]) => /EUR|hors taxes/.test(r.texte)).map(([m]) => m).join(','));
verifier(vingt.every(([, r]) => /1 200,00 € TTC/.test(r.texte) && !/TVA non applicable/.test(r.texte)), 'à TVA 20 : « 1 200,00 € TTC », sans la mention', vingt.map(([m, r]) => `${m}: ${(r.texte.match(/[^\n]*TTC[^\n]*/) || [''])[0]}`).join(' | '));
const dv = c.rendre('devis', { ...base, tva: 20, ttc: 1200 }).texte;
verifier(/Montant : 1 200,00 € TTC \(1 000,00 € HT\)/.test(dv), 'le devis : TTC puis HT entre parenthèses', (dv.match(/Montant[^\n]*/) || [''])[0]);
const rep = c.rendre('devis-reponse', { ...base, tva: 20, ttc: 1200, reponse: 'accepte' }).texte;
verifier(/Montant HT : 1 000,00 € HT/.test(rep) && /Montant TTC : 1 200,00 € TTC$/m.test(rep), 'la réponse à un devis : HT et TTC, chacun une fois', rep.split('\n').filter((l) => /Montant/.test(l)).join(' | '));
const zero = financier.map((m) => [m, c.rendre(m, { ...base, tva: 0, ttc: 1000, reste: 1000, reponse: 'accepte' })]);
verifier(zero.every(([, r]) => /1 000,00 €/.test(r.texte) && /TVA non applicable, article 293 B du CGI/.test(r.texte) && !/EUR|TTC|HT\b|hors taxes/.test(r.texte)), 'en franchise : un seul montant en « € » et la mention 293 B, comme le Hub', zero.filter(([, r]) => /EUR|TTC|HT\b/.test(r.texte)).map(([m]) => m).join(','));
const forfait = c.rendre('maintenance', { evenement: 'actif', projet: 'ForgeMe', montant: 450, tva: 20, periode: 'mensuelle' }).texte;
verifier(/Montant : 450,00 € HT par mois/.test(forfait), 'un forfait avec TVA : « 450,00 € HT par mois »', (forfait.match(/Montant[^\n]*/) || [''])[0]);

console.log('\n== 3 · Chaque modèle, chaque variante');
const plein = {
  projetNom: 'ForgeMe', projet: 'ForgeMe', clientNom: 'SÉBASTIEN HOREMANS', prenom: 'yasmine', nom: 'Alex Durand', email: 'sebastien@exemple.test',
  role: 'responsable', lien: 'https://capmedia.app/suivi/hub#/x', numero: 'FORGEME-012', titre: 'Le bouton Payer', description: 'Il ne répond pas.',
  type: 'bug', urgence: 'critique', plateforme: 'ios', version: '1.1.4', auteurNom: 'Alex Durand', auteurEmail: 'alex@capmedia.app',
  statutAvant: 'nouveau', statutApres: 'a-valider', statut: 'en-cours', texte: 'Voici la maquette.', libelle: 'Refonte', montant: 1000, ttc: 1200, tva: 20,
  echeance: new Date('2026-11-30'), date: new Date('2026-10-07'), reste: 1200, moyen: 'Virement', reference: 'VIR-1', qualification: 'a-chiffrer',
  code: '123456', minutes: 10, quand: '7 octobre 2026 à 10:12', ip: '1.2.3.4', campagne: 'Octobre', testeur: 'Karim', ok: 3, ko: 1, na: 0, total: 4,
  points: [{ quoi: 'Devis à décider', detail: 'D-2026-0028' }], notes: [{ type: 'correction', texte: 'Connexion' }], evenement: 'proposition',
  periode: 'mensuelle', formule: 'Essentiel', reponse: 'accepte', commentaire: 'Parfait', scenario: 'Connexion', gravite: 'critique', scenarios: 4,
  testeurs: 2, anomalies: 1, heure: '10:00', duree: 60, lieu: 'Bureaux', lienVisio: 'https://meet.example.com/abc', ordreDuJour: 'Point', remarques: ['Rien'],
  echecs: ['Paiement'], plateformes: ['ios'], pieces: 1, avecPdf: true, lienStore: 'https://apps.apple.com/app/id1', application: 'ForgeMe', fin: '13 octobre 2026',
  attendu: 'Les accès', sequence: 'Octobre', avisDonne: 'oui', noteTest: '4 sur 5', finAcces: '14 octobre', temps: '2 h',
  lignes: [{ numero: 'FORGEME-013', titre: 'Export', cree: true, lien: 'https://capmedia.app/suivi/ticket?t=1' }, { numero: 'FORGEME-014', titre: 'Avatar', statut: 'en-cours', messages: 2 }], total: 2, nouvelles: 1,
};
const variantes = [{}, { cote: 'equipe' }, { cote: 'client' }, { parLEquipe: true }, { statut: 'approuvee' }, { statut: 'modifications' }, { evenement: 'corrigee' },
  { evenement: 'close' }, { evenement: 'evolution', cote: 'equipe' }, { evenement: 'actif' }, { evenement: 'suspendu' }, { evenement: 'termine' }, { evenement: 'en-cours' },
  { deplacee: true }, { qualification: 'hors-perimetre' }, { reponse: 'refuse' }, { statut: 'livree' }, { statut: 'refusee' }, { statut: 'acceptee' }, { role: 'admin' },
  { statutApres: 'nouveau' }, { statutApres: 'en-attente-client' }, { statutApres: 'inconnu-xyz' }, { lienVisio: '' }, { lienStore: '' }, { libre: true }];
/* Les lettres qui vont à l'équipe (adresse commune) ou à un membre. */
const EQUIPE = new Set(['devis-reponse', 'reglement-declare', 'tache-reponse', 'validation-reponse', 'testeur-termine', 'testeur-remarque', 'message-testeur']);
const PERSONNEL = new Set(['assignation', 'invitation-equipe', 'connexion-equipe']);
/* Les modèles qui ont une voix « équipe » (variables.cote === 'equipe'). */
const A_DEUX_VOIX = new Set(['ticket-cree', 'statut', 'message', 'fichier', 'message-projet', 'preprojet', 'maintenance']);
const sale = [];
const sansSalut = [];
const urlNue = [];
let rendus = 0;
const vides = [{}, { projetNom: '', titre: '', numero: '', clientNom: '', par: '', prenom: '', auteur: '', testeur: '', campagne: '', version: '', echeance: null, lignes: [] }];
for (const modele of Object.keys(c.MODELES)) {
  for (const extra of [...variantes, ...vides]) {
    const v = vides.includes(extra) ? extra : { ...plein, ...extra };
    for (const ctx of [null, { a: [{ email: 'sebastien@exemple.test', nom: 'SÉBASTIEN HOREMANS' }] }]) {
      let r;
      try { r = c.rendre(modele, v, ctx); } catch (e) { sale.push(`${modele} : ${e.message}`); continue; }
      rendus += 1;
      const tout = `${r.objet}\n${r.texte}\n${r.html}`;
      const etiquette = `${modele} ${JSON.stringify(extra).slice(0, 40)}${ctx ? ' (ctx)' : ''}`;
      if (/Bonjour ,|Bonjour\s*\n/.test(tout)) sale.push(`${etiquette} : « Bonjour , »`);
      if (/undefined|\bnull\b|\[object|NaN/.test(tout)) sale.push(`${etiquette} : valeur brute`);
      if (/[—–]/.test(tout)) sale.push(`${etiquette} : tiret cadratin`);
      if (/\bEUR\b|hors taxes/.test(tout)) sale.push(`${etiquette} : « EUR »`);
      if (/[:·]\s*$/.test(r.objet) || /^\s*[:·]/.test(r.objet) || /\s{2,}/.test(r.objet)) sale.push(`${etiquette} : objet tronqué « ${r.objet} »`);
      if (/Statut modifié : inconnu|est revenue au statut|c'est demain|on en parle|Nous la ferons|Elle est dans l'application|Résolu le|Fermé le|chez nous/.test(tout)) sale.push(`${etiquette} : ancienne tournure`);
      /* Chaque lettre salue : « Bonjour Prénom, » ou « Bonjour, ». */
      if (!/^Bonjour( [^\n,]+)?,$/m.test(r.texte)) sansSalut.push(etiquette);
      /* À l'équipe (adresse commune) : jamais de prénom. */
      if (EQUIPE.has(modele) && !/^Bonjour,$/m.test(r.texte)) sale.push(`${etiquette} : une lettre à l équipe salue quelqu un`);
      if ((EQUIPE.has(modele) || PERSONNEL.has(modele) || (v.cote === 'equipe' && A_DEUX_VOIX.has(modele))) && /votre projet\./.test(r.html) && /au titre du suivi/.test(r.html)) sale.push(`${etiquette} : pied « votre projet » à l équipe`);
      /* Aucune adresse dans le texte d'un paragraphe du HTML (hors href). */
      const paragraphes = (r.html.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []).map((p) => p.replace(/<a [^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, ''));
      if (paragraphes.some((p) => /https?:\/\//.test(p))) urlNue.push(etiquette);
    }
  }
}
verifier(rendus >= Object.keys(c.MODELES).length * 50, `${Object.keys(c.MODELES).length} modèles, ${rendus} rendus`);
verifier(sale.length === 0, 'aucun « Bonjour , », aucune valeur brute, aucun tiret cadratin, aucun « EUR », aucun objet tronqué, aucune ancienne tournure', [...new Set(sale)].slice(0, 8).join(' | '));
verifier(sansSalut.length === 0, 'chaque lettre, à chacun, commence par « Bonjour Prénom, » ou « Bonjour, »', [...new Set(sansSalut)].slice(0, 8).join(' | '));
verifier(urlNue.length === 0, 'aucune adresse nue dans une phrase du HTML', [...new Set(urlNue)].slice(0, 6).join(' | '));

/* Les lettres au client saluent le destinataire de l'envoi par son prénom. */
const CLIENTS = Object.keys(c.MODELES).filter((m) => !EQUIPE.has(m) && !PERSONNEL.has(m));
const ctxSeb = { a: [{ email: 'sebastien@exemple.test', nom: 'SÉBASTIEN HOREMANS' }] };
const sansPrenom = CLIENTS.filter((m) => !/^Bonjour Sébastien,$/m.test(c.rendre(m, { ...plein, cote: 'client' }, ctxSeb).texte));
verifier(sansPrenom.length === 0, `les ${CLIENTS.length} lettres hors équipe saluent « Bonjour Sébastien, » (casse corrigée, prénom seul)`, sansPrenom.join(', '));

console.log('\n== 3 bis · Les tournures relues');
const t = (m, v = {}) => c.rendre(m, { ...plein, ...v }, ctxSeb);
verifier(t('statut', { statutApres: 'inconnu-xyz', cote: 'equipe' }).objet === 'FORGEME-012 · Statut modifié par le client : inconnu-xyz' && t('statut', { statutApres: '', cote: 'equipe' }).objet === 'FORGEME-012 · Statut modifié par le client', 'équipe : plus de « Statut modifié : inconnu »', t('statut', { statutApres: '', cote: 'equipe' }).objet);
verifier(t('statut', { statutApres: 'nouveau' }).objet === 'FORGEME-012 · Votre demande est de nouveau en attente de traitement', 'objet « reçue » reformulé', t('statut', { statutApres: 'nouveau' }).objet);
verifier(/Terminée le : /.test(t('resolu').texte) && /Fermée le : /.test(t('ferme').texte), '« Terminée le », « Fermée le » (une demande)');
verifier(/Rappel : votre réunion a lieu demain/.test(t('reunion-rappel').texte) && t('reunion-rappel').objet === 'ForgeMe · Rappel : Le bouton Payer, demain à 10:00', 'rappel de réunion reformulé', t('reunion-rappel').objet);
verifier(/Nous avons accepté votre évolution/.test(t('evolution-statut', { statut: 'acceptee' }).texte) && /Votre évolution est livrée\./.test(t('evolution-statut', { statut: 'livree' }).texte), 'évolutions : plus de « Nous la ferons », « Elle est dans l application »');
const retard = t('facture-retard', { tva: 0 }).texte;
verifier(/Sauf erreur de notre part/.test(retard) && /nous restons à votre disposition/.test(retard) && !/on en parle/.test(retard), 'facture en retard : ton sobre');
const susp = t('maintenance', { evenement: 'suspendu' }).texte.split('\n').find((l) => /mis en pause/.test(l)) || '';
verifier(susp && (susp.match(/ : /g) || []).length <= 1, 'maintenance suspendue : plus deux deux-points dans une phrase', susp);
const ouv = c.rendre('ouverture', { projetNom: 'ForgeMe', email: 'a@x.test' }, ctxSeb).texte;
verifier(!/Collaborateur/.test(ouv), 'ouverture : sans rôle, aucune ligne « Collaborateur » par défaut');
const fichierEq = c.rendre('fichier', { cote: 'equipe', nom: 'a.pdf' });
verifier(fichierEq.objet === 'Fichier déposé par le client' && !/^\s*·/.test(fichierEq.objet), 'équipe : un objet de fichier sans projet ni auteur reste propre', fichierEq.objet);
const maintEq = c.rendre('maintenance', { cote: 'equipe', evenement: 'demande' });
verifier(maintEq.objet === 'Forfait de maintenance demandé', 'équipe : un objet de maintenance sans projet reste propre', maintEq.objet);
const reu = t('reunion');
verifier(/Rejoindre la réunion : https:\/\/meet/.test(reu.texte) && /Voir la réunion et ajouter à mon agenda : https:\/\/capmedia/.test(reu.texte) && /Voir la réunion et ajouter à mon agenda<\/a>/.test(reu.html), 'réunion : le fichier d agenda par un lien, l adresse en clair dans le texte seulement');
const rel = t('release');
verifier(/Télécharger la mise à jour/.test(rel.html) && /Voir le détail des changements dans votre espace<\/a>/.test(rel.html) && /Voir le détail des changements dans votre espace : https/.test(rel.texte), 'version : le détail des changements par un lien');
const objets = Object.keys(c.MODELES).map((m) => t(m).objet).filter((o) => /^ForgeMe /.test(o));
verifier(objets.length > 10 && objets.every((o) => /^ForgeMe · /.test(o)), 'les objets du projet : « ForgeMe · … » partout', objets.filter((o) => !/^ForgeMe · /.test(o)).join(' | '));

console.log('\n== 4 · Le rendu gardé par le facteur, le journal');
/* Le journal charge communication (firebase-admin) : une base fictive suffit, rien n'est lu. */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'banc-sans-base';
let journal = null;
try { journal = require('../journal-envois.js'); } catch (e) { console.log(`  (journal non chargé : ${e.message.slice(0, 120)})`); }
if (journal) {
  const envoiCode = { modele: 'code', a: [{ email: 'a@x.test', nom: 'Anne' }], variables: { code: '987654', minutes: 10 } };
  const gCode = journal.renduAGarder(envoiCode, c.rendre('code', envoiCode.variables, { a: envoiCode.a }));
  verifier(!JSON.stringify(gCode).includes('987654') && /•{6} est votre code de connexion/.test(gCode.objet) && gCode.masques.includes('le code de connexion'), 'le code de connexion n est jamais gardé en clair', gCode.objet);
  const envoiInv = { modele: 'invitation', a: [{ email: 'a@x.test', nom: 'Anne' }], variables: { projetNom: 'ForgeMe', lien: 'https://capmedia.app/suivi/?i=JetonSecret123' } };
  const gInv = journal.renduAGarder(envoiInv, c.rendre('invitation', envoiInv.variables, { a: envoiInv.a }));
  verifier(!JSON.stringify(gInv).includes('JetonSecret123') && /\?i=…/.test(gInv.texte), 'ni le jeton d une invitation');
  const envoiDevis = { modele: 'devis', a: [{ email: 's@x.test', nom: 'SÉBASTIEN HOREMANS' }], variables: { numero: 'D-1', montant: 10, tva: 0 } };
  const vrai = c.rendre('devis', envoiDevis.variables, { a: envoiDevis.a });
  const gDevis = journal.renduAGarder(envoiDevis, vrai);
  verifier(gDevis.objet === vrai.objet && gDevis.html === vrai.html && gDevis.texte === vrai.texte && gDevis.tronque === false, 'une lettre ordinaire est gardée à l octet près');
  const enorme = journal.renduAGarder(envoiDevis, { objet: 'x', html: 'a'.repeat(journal.RENDU_MAX.html + 1), texte: 'b' });
  verifier(enorme.tronque === true && enorme.html === '' && JSON.stringify(enorme).length < 2000, 'au-delà des bornes : l objet seul, marqué « tronque »');
  /* Le journal : le rendu enregistré l'emporte, même si le gabarit a changé depuis. */
  const ancien = { objet: 'Objet tel que parti', html: '<p>Lettre telle que partie</p>', texte: 'Texte tel que parti', masques: [], tronque: false };
  const vu = journal.rendre({ ...envoiDevis, rendu: ancien });
  verifier(vu.provenance === 'enregistre' && vu.objet === ancien.objet && vu.html === ancien.html && vu.texte === ancien.texte, 'le journal montre le rendu enregistré, tel quel');
  const refait = journal.rendre(envoiDevis);
  verifier(refait.provenance === 'reconstitue' && refait.html === vrai.html && /Bonjour Sébastien,/.test(refait.texte), 'sans rendu : reconstitué comme le facteur, avec ses destinataires');
  const tronque = journal.rendre({ ...envoiDevis, rendu: enorme });
  verifier(tronque.provenance === 'reconstitue' && tronque.renduTronque === true, 'rendu tronqué : reconstitué, et dit pourquoi');
  const codeVu = journal.rendre({ ...envoiCode, rendu: { ...gCode, objet: '987654 est votre code de connexion' } });
  verifier(!JSON.stringify(codeVu).includes('987654'), 'même un rendu enregistré en clair ressort masqué');
}

console.log('\n== 5 · Le facteur, la page, la file');
const suivi = readFileSync(new URL('../suivi.js', import.meta.url), 'utf8');
const facteur = suivi.slice(suivi.indexOf('exports.suiviFacteur'), suivi.indexOf('6. suiviAdmin'));
verifier(/courriels\.rendre\(envoi\.modele, envoi\.variables, \{ a: /.test(facteur), 'le facteur passe les destinataires au gabarit');
verifier(/const rendu = journalEnvois\.renduAGarder\(envoi, courriel\)/.test(facteur)
  && /etat: 'envoye'[^\n]*rendu \}/.test(facteur) && /etat: 'simule'[^\n]*rendu \}/.test(facteur), 'il enregistre le rendu à l envoi (et sur le banc, « simulé »)');
const page = readFileSync(new URL('../../agence/suivi/assets/js/vues/admin-emails.js', import.meta.url), 'utf8');
verifier(/data-provenance="\$\{e\.provenance === 'enregistre'/.test(page) && /Telle qu'envoyée/.test(page) && /reconstituée/.test(page), 'la page dit si la lettre est enregistrée ou reconstituée');
const comm = readFileSync(new URL('../communication.js', import.meta.url), 'utf8');
const ecrire = comm.slice(comm.indexOf('async function ecrireAuxClients'), comm.indexOf('/** Une notification dans la boîte'));
verifier(/for \(const d of destinataires\) \{\n\s+const avecPlus/.test(ecrire) && !/mettreEnFile\(modele, destinataires,/.test(ecrire), 'une lettre par client : chacun est salué par son prénom');

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S)` : ''}`);
process.exit(ecarts.length ? 1 : 0);
