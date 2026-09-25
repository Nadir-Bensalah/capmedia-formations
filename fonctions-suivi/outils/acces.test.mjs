/* ==========================================================================
   CAPMEDIA CLIENT HUB · qui peut quoi, sans rien lancer

   Les décisions pures de la Gate 2, appelées directement : permissions
   d'un rôle, projet d'un agent, dernier administrateur, accès effectif
   d'un projet, conversion d'un projet d'avant, destinataires d'un e-mail
   et d'une notification, état d'une invitation. Puis deux cohérences :
   le miroir de l'écran (noyau.js) dit la même chose que le serveur
   (acces.js), et chaque action de suiviAdmin passe par le registre.

     node fonctions-suivi/outils/acces.test.mjs
   ========================================================================== */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const acces = require('../acces.js');
const communication = require('../communication.js');
const invitations = require('../invitations.js');

let ok = 0; const ecarts = [];
const verifier = (c, m, d = '') => { if (c) { ok += 1; console.log(`  ok     ${m}`); } else { ecarts.push(m); console.log(`  ÉCART  ${m}${d ? ` · ${d}` : ''}`); } };

const admin = { uid: 'a1', role: 'admin', actif: true };
const admin2 = { uid: 'a2', role: 'admin', actif: true };
const agent = { uid: 'g1', role: 'agent', actif: true, projets: ['p-a'] };
const agentDelegue = { uid: 'g2', role: 'agent', actif: true, projets: ['p-a'], permissions: ['finance.gerer', 'equipe.gerer', 'systeme'] };
const inactif = { uid: 'x1', role: 'admin', actif: false };

console.log('\n== Les permissions d un rôle');
verifier(acces.decider({ fiche: admin, permission: 'equipe.gerer' }).ok, 'un administrateur actif administre l équipe');
verifier(acces.decider({ fiche: admin, permission: 'finance.gerer', projet: 'p-z' }).ok, 'un administrateur agit sur n importe quel projet');
verifier(acces.decider({ fiche: agent, permission: 'demandes.gerer', projet: 'p-a' }).ok, 'un agent répond aux demandes de SON projet');
verifier(!acces.decider({ fiche: agent, permission: 'demandes.gerer', projet: 'p-b' }).ok, 'un agent ne touche pas un projet qui n est pas le sien');
verifier(!acces.decider({ fiche: agent, permission: 'equipe.gerer' }).ok, 'un agent n administre pas l équipe');
verifier(!acces.decider({ fiche: agent, permission: 'acces.gerer', projet: 'p-a' }).ok, 'un agent ne donne pas d accès client par défaut');
verifier(!acces.decider({ fiche: agent, permission: 'finance.gerer', projet: 'p-a' }).ok, 'ni ne gère la finance par défaut');
verifier(acces.decider({ fiche: agentDelegue, permission: 'finance.gerer', projet: 'p-a' }).ok, 'une permission déléguée s ajoute au socle');
verifier(!acces.decider({ fiche: agentDelegue, permission: 'equipe.gerer' }).ok, 'administrer l équipe ne se délègue pas');
verifier(!acces.decider({ fiche: agentDelegue, permission: 'systeme' }).ok, 'les opérations système ne se délèguent pas');
verifier(!acces.decider({ fiche: inactif, permission: 'projet.voir' }).ok, 'un membre inactif ne peut plus rien, même administrateur');
verifier(/désactivé/.test(acces.decider({ fiche: inactif, permission: 'projet.voir' }).motif), 'et le refus le dit');
verifier(!acces.decider({ fiche: null, permission: 'projet.voir' }).ok, 'sans fiche d équipe (un client, un testeur) : refusé');
verifier(!acces.decider({ fiche: { role: 'chef', actif: true }, permission: 'projet.voir' }).ok, 'un rôle inconnu : refusé');
verifier(acces.decider({ fiche: agent, permission: null }).ok, 'un agent actif passe la porte sans permission demandée (qui suis-je)');

console.log('\n== Le dernier administrateur');
const equipe = [admin, agent, inactif];
verifier(Boolean(acces.controleDernierAdmin(equipe, 'a1', { ...admin, actif: false })), 'le dernier administrateur actif ne se désactive pas');
verifier(Boolean(acces.controleDernierAdmin(equipe, 'a1', { ...admin, role: 'agent' })), 'ni ne se rétrograde en agent');
verifier(Boolean(acces.controleDernierAdmin(equipe, 'a1', null)), 'ni ne se retire');
verifier(!acces.controleDernierAdmin([...equipe, admin2], 'a1', { ...admin, actif: false }), 's il en reste un autre actif, c est permis');
verifier(Boolean(acces.controleDernierAdmin([admin, inactif], 'a1', null)), 'un administrateur INACTIF ne compte pas comme relève');
verifier(!acces.controleDernierAdmin(equipe, 'g1', { ...agent, actif: false }), 'désactiver un agent ne touche pas à la règle');
verifier(!acces.controleDernierAdmin(equipe, 'x1', null), 'retirer un administrateur déjà inactif est permis');

console.log('\n== L accès effectif d un projet');
const inter = [
  { uid: 'c1', role: 'responsable', statut: 'actif' },
  { uid: 'c2', role: 'collaborateur', statut: 'actif' },
  { uid: 'c3', role: 'collaborateur', statut: 'retire' },
  { uid: 'c4', role: 'a-definir', statut: 'actif' },
  { uid: null, role: 'responsable', statut: 'actif' },
];
const ouvert = acces.planAcces({ ouvert: true }, inter);
verifier(JSON.stringify(ouvert.membres.sort()) === JSON.stringify(['c1', 'c2']), 'ouvert : les interlocuteurs actifs AVEC rôle et compte sont membres', JSON.stringify(ouvert.membres));
verifier(ouvert.roles.c1 === 'responsable' && ouvert.roles.c2 === 'collaborateur' && !ouvert.roles.c3, 'chacun avec son rôle, le retiré sans rôle');
verifier(!ouvert.membres.includes('c3'), 'un interlocuteur retiré n est pas membre');
verifier(!ouvert.membres.includes('c4'), 'un rôle à définir ne donne pas accès');
const ferme = acces.planAcces({ ouvert: false }, inter);
verifier(ferme.membres.length === 0 && !Object.keys(ferme.roles).length, 'fermé : personne n est membre');
verifier(ferme.personnes.includes('c1') && ferme.personnes.includes('c4') && !ferme.personnes.includes('c3'), 'mais les personnes préparées restent connues (pour le registre des rôles)');
verifier(acces.planAcces({ interne: true, ouvert: true }, inter).membres.length === 0, 'un projet interne n a aucun membre, même marqué ouvert');
verifier(acces.planAcces({}, inter).membres.length === 0, 'sans « ouvert : vrai », le projet est fermé');
verifier(acces.roleClient({ membres: ['c1'], roles: { c1: 'responsable' } }, 'c1') === 'responsable', 'le rôle se lit sur la fiche projet');
verifier(acces.roleClient({ membres: [], roles: { c1: 'responsable' } }, 'c1') === null, 'un rôle sans appartenance ne vaut rien');

console.log('\n== Convertir un projet d avant la Gate 2 (rien n est deviné)');
const org = { roles: { u1: 'owner' }, contacts: [{ email: 'patron@exemple.test', role: 'owner' }, { email: 'autre@exemple.test', role: 'member' }] };
const legacyOuvert = acces.planMigrationProjet({ membres: ['u1'], silence: true, organisation: 'o' }, org, { u1: 'patron@exemple.test' });
verifier(legacyOuvert.champs.ouvert === true, 'un projet où quelqu un est déjà membre est ouvert de fait');
verifier(legacyOuvert.champs.emailsClient === 'coupes', 'sa sourdine devient « e-mails coupés » : même comportement qu avant');
verifier(legacyOuvert.interlocuteurs.length === 1 && legacyOuvert.interlocuteurs[0].fiche.role === 'responsable', 'le propriétaire de la société devient responsable');
verifier(legacyOuvert.champs.accesVersion === 2 && !legacyOuvert.bloquant, 'et le projet est converti');
const legacyInconnu = acces.planMigrationProjet({ membres: ['u9'], organisation: 'o' }, org, { u9: 'inconnu@exemple.test' });
verifier(legacyInconnu.bloquant && legacyInconnu.arbitrages.some((a) => /rôle responsable ou collaborateur/.test(a)), 'un membre au rôle indéductible : arbitrage, et le projet n est pas converti');
verifier(!legacyInconnu.champs.accesVersion, 'aucun accès n est recalculé sur une supposition');
const legacyFermeSourdine = acces.planMigrationProjet({ membres: [], silence: true, contacts: [{ email: 'autre@exemple.test', nom: 'A' }] }, org, {});
verifier(legacyFermeSourdine.champs.ouvert === false, 'sans membre et en sourdine : fermé, rien ne change pour lui');
verifier(legacyFermeSourdine.interlocuteurs[0].fiche.role === 'a-definir' && legacyFermeSourdine.interlocuteurs[0].fiche.invitation.etat === 'preparee', 'son contact est préparé, rôle à décider, rien envoyé');
const legacyProspect = acces.planMigrationProjet({ membres: [], client: { email: 'prospect@exemple.test' } }, null, {});
verifier(legacyProspect.bloquant && /le fermer/.test(legacyProspect.arbitrages.join(' ')), 'un prospect hors sourdine qui recevait des e-mails : arbitrage humain, pas de fermeture silencieuse');
verifier(acces.planMigrationProjet({ interne: true }, null, {}).champs.ouvert === false, 'un projet interne : fermé, sans interlocuteur');
verifier(acces.planMigrationProjet({ accesVersion: 2 }, null, {}).deja, 'un projet déjà converti n est pas retouché (relançable)');

console.log('\n== Qui reçoit un e-mail');
const projet = { id: 'p-a', ouvert: true, membres: ['c1', 'c2'], roles: { c1: 'responsable', c2: 'collaborateur' }, emailsClient: 'actifs' };
const resp = { uid: 'c1', email: 'resp@exemple.test', statut: 'actif', role: 'responsable' };
const collab = { uid: 'c2', email: 'collab@exemple.test', statut: 'actif', role: 'collaborateur' };
const retire = { uid: 'c3', email: 'parti@exemple.test', statut: 'retire', role: 'collaborateur' };
const d = (p, i, e, pref) => communication.decisionEmailClient({ projet: p, interlocuteur: i, evenement: e, preferences: pref });
verifier(d(projet, resp, 'message').ok && d(projet, collab, 'message').ok, 'projet ouvert : responsable et collaborateur reçoivent un message');
verifier(d(projet, resp, 'facture').ok, 'le responsable reçoit une facture');
verifier(!d(projet, collab, 'facture').ok && /responsable/.test(d(projet, collab, 'facture').motif), 'le collaborateur ne reçoit ni facture');
verifier(!d(projet, collab, 'devis').ok && !d(projet, collab, 'paiement').ok, 'ni devis, ni paiement');
verifier(!d({ ...projet, ouvert: false }, resp, 'message').ok, 'projet fermé : rien, même au responsable');
verifier(!d({ ...projet, ouvert: undefined }, resp, 'invitation').ok, 'projet sans « ouvert : vrai » : rien, pas même une invitation');
verifier(!d({ ...projet, interne: true }, resp, 'message').ok, 'projet interne : rien');
verifier(!d({ ...projet, emailsClient: 'coupes' }, resp, 'message').ok, 'e-mails coupés : aucun e-mail');
verifier(!d({ ...projet, emailsClient: 'coupes' }, resp, 'invitation').ok, 'pas même l invitation');
verifier(!d(projet, retire, 'message').ok, 'un interlocuteur retiré ne reçoit plus rien');
/* Le cas que seule la fiche écarte : le projet n'a pas encore été
   recalculé et le compte en ancien membre ; la fiche, elle, dit « retiré ». */
verifier(!d({ ...projet, membres: ['c1', 'c2', 'c3'], roles: { ...projet.roles, c3: 'collaborateur' } }, retire, 'message').ok, 'retiré mais encore listé par une fiche projet en retard : rien non plus');
verifier(!d({ ...projet, membres: ['c1'] }, collab, 'message').ok, 'un actif qui n est pas (ou plus) membre effectif ne reçoit rien');
verifier(!d(projet, resp, 'fichier', { fichiers: 'off' }).ok, 'une catégorie désactivée dans ses préférences ne part pas');
verifier(d(projet, resp, 'ouverture', { projet: 'off' }).ok, 'l ouverture de son espace part malgré les préférences (essentiel)');
verifier(!d(projet, { ...resp, email: 'pas-une-adresse' }, 'message').ok, 'une adresse illisible ne part pas');

console.log('\n== Qui reçoit une notification dans le Hub');
const n = (p, uid, e) => communication.decisionNotificationClient({ projet: p, uid, evenement: e });
verifier(n({ ...projet, emailsClient: 'coupes' }, 'c1', 'message').ok, 'e-mails coupés : le Hub notifie toujours');
verifier(n(projet, 'c1', 'fichier', { fichiers: 'off' }).ok, 'les préférences d e-mail ne coupent pas le Hub');
verifier(!n(projet, 'c2', 'paiement').ok, 'la notification d un paiement ne va qu au responsable');
verifier(!n({ ...projet, ouvert: false }, 'c1', 'message').ok, 'projet fermé : aucune notification');
verifier(!n(projet, 'c9', 'message').ok, 'un compte hors des membres : aucune');

console.log('\n== Qui reçoit côté équipe');
const e = (f, p) => communication.decisionEquipe({ fiche: f, projetId: p }).ok;
verifier(e(admin, 'p-z'), 'un administrateur actif reçoit pour tout projet');
verifier(e(agent, 'p-a') && !e(agent, 'p-b'), 'un agent reçoit pour ses projets, pas les autres');
verifier(!e(inactif, 'p-a'), 'un membre inactif ne reçoit rien');

console.log('\n== L état d une invitation');
const ET = invitations.etatInvitation;
verifier(ET({ etat: 'envoyee', expire: new Date(Date.now() + 1000) }) === 'envoyee', 'envoyée et encore valable');
verifier(ET({ etat: 'envoyee', expire: new Date(Date.now() - 1000) }) === 'expiree', 'passée l échéance : expirée');
verifier(ET({ etat: 'acceptee', expire: new Date(Date.now() - 1000) }) === 'acceptee', 'acceptée reste acceptée');
verifier(ET({ etat: 'envoyee', revoquee: true }) === 'revoquee', 'révoquée l emporte');
verifier(!invitations.utilisable({ etat: 'acceptee' }), 'une invitation consommée ne pré-remplit plus');
verifier(invitations.utilisable({ etat: 'en-attente', expire: new Date(Date.now() + 1000) }), 'une invitation prête, non envoyée, reste utilisable (lien copié)');
verifier(invitations.idDe('abc') !== 'abc' && invitations.idDe('abc').length === 64, 'le jeton n est jamais l identifiant du document (seule son empreinte)');

console.log('\n== Qui peut répondre à un devis');
{
  const projet = { id: 'pd', ouvert: true, membres: ['r1', 'c1'], roles: { r1: 'responsable', c1: 'collaborateur' } };
  const leg = (reponse, ficheEquipe = null) => acces.reponseDevisLegitime({ projet, reponse, ficheEquipe });
  verifier(leg({ par: 'r1' }) === true, 'le responsable du projet');
  verifier(leg({ par: 'c1' }) === false, 'pas le collaborateur');
  verifier(leg({ par: 'x9' }) === false, 'pas une personne étrangère au projet');
  verifier(leg({}) === false, 'pas une réponse sans signature');
  /* Refermé, le projet n'a plus de membres (l'accès se dérive des
     interlocuteurs) : son responsable ne répond plus. */
  const ferme = { id: 'pd', ouvert: false, ...acces.planAcces({ ouvert: false }, [{ uid: 'r1', role: 'responsable', statut: 'actif' }]) };
  verifier(acces.reponseDevisLegitime({ projet: ferme, reponse: { par: 'r1' } }) === false, 'pas le responsable d un projet refermé');
  verifier(leg({ par: 'a1', cote: 'equipe' }, { role: 'admin', actif: true }) === true, 'l équipe qui gère la finance (devis signé hors du Hub)');
  verifier(leg({ par: 'a2', cote: 'equipe' }, { role: 'agent', actif: true, projets: ['pd'] }) === false, 'pas un agent sans la permission finance');
  verifier(leg({ par: 'a3', cote: 'equipe' }, { role: 'agent', actif: true, projets: ['pd'], permissions: ['finance.gerer'] }) === true, 'un agent à qui la finance est déléguée, sur ce projet');
  verifier(leg({ par: 'a4', cote: 'equipe' }, { role: 'admin', actif: false }) === false, 'pas un administrateur désactivé');
  verifier(leg({ par: 'r1', cote: 'equipe' }, null) === false, 'un client qui se dit « équipe » sans fiche est refusé');
}

console.log('\n== Le miroir de l écran dit la même chose que le serveur');
const noyau = readFileSync(new URL('../../agence/suivi/assets/js/noyau.js', import.meta.url), 'utf8');
const extraire = (nom) => {
  const m = noyau.match(new RegExp(`export const ${nom} = (\\{[\\s\\S]*?\\n\\});`));
  return m ? m[1] : null;
};
// eslint-disable-next-line no-new-func
const PERMS_ECRAN = extraire('PERMISSIONS') ? new Function(`return ${extraire('PERMISSIONS')}`)() : {};
verifier(JSON.stringify(Object.keys(PERMS_ECRAN).sort()) === JSON.stringify(Object.keys(acces.PERMISSIONS).sort()), 'les mêmes permissions, des deux côtés', Object.keys(PERMS_ECRAN).join(','));
const socleAgent = noyau.match(/agent: \[([^\]]+)\]/);
const listeAgent = socleAgent ? socleAgent[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean).sort() : [];
verifier(JSON.stringify(listeAgent) === JSON.stringify([...acces.SOCLE.agent].sort()), 'le même socle pour un agent', listeAgent.join(','));
verifier(/filter\(\(p\) => !\['equipe\.gerer', 'systeme'\]\.includes\(p\)\)/.test(noyau), 'les mêmes permissions non délégables');

console.log('\n== Chaque action de suiviAdmin passe par le registre');
const suivi = readFileSync(new URL('../suivi.js', import.meta.url), 'utf8');
const actionsCode = [...new Set([...suivi.matchAll(/action === '([a-zA-Z]+)'/g)].map((m) => m[1]))];
const registre = Object.keys(require('../suivi.js')._actions);
const orphelines = actionsCode.filter((a) => !registre.includes(a));
verifier(!orphelines.length, 'aucune action du code sans permission déclarée', orphelines.join(', '));
const sansCode = registre.filter((a) => !actionsCode.includes(a) && !require('../suivi.js')._actions[a].retiree);
verifier(!sansCode.length, 'aucune entrée du registre sans code', sansCode.join(', '));
const sansPermission = registre.filter((a) => a !== 'moi' && !require('../suivi.js')._actions[a].retiree && !require('../suivi.js')._actions[a].permission);
verifier(!sansPermission.length, 'toute action (hors « moi ») exige une permission', sansPermission.join(', '));
verifier(!/ADMIN_CLE/.test(suivi.replace(/\/\*[\s\S]*?\*\//g, '')), 'plus aucune trace de ADMIN_CLE dans le code de suivi.js');
const serveurFront = readFileSync(new URL('../../agence/suivi/assets/js/serveur.js', import.meta.url), 'utf8');
verifier(/Authorization: `Bearer \$\{jeton\}`/.test(serveurFront) && !/cle,/.test(serveurFront), 'le cockpit appelle avec le jeton Firebase, sans clé');

console.log(`\n${ok} contrôle(s) conforme(s)${ecarts.length ? `, ${ecarts.length} ÉCART(S) :\n  - ${ecarts.join('\n  - ')}` : ''}`);
process.exit(ecarts.length ? 1 : 0);
