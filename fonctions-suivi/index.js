/* ==========================================================================
   CAPMEDIA DIGITAL · Fonctions de l'espace de suivi client

   Projet Firebase : capmedia-1f90d, distinct de capmedia-academy qui porte
   les formations et le webhook Stripe. Les deux ne partagent rien.

   Contrat de données et cycle de vie d'un ticket : docs/suivi.md
   Gabarits d'e-mail : courriels.js

   Déployer :
     firebase deploy --config firebase.suivi.json --only functions --project capmedia-1f90d
   ========================================================================== */

const suivi = require('./suivi');

exports.suiviTicketCree      = suivi.suiviTicketCree;
exports.suiviTicketModifie   = suivi.suiviTicketModifie;
exports.suiviMessageCree     = suivi.suiviMessageCree;
exports.suiviDocumentCree    = suivi.suiviDocumentCree;
exports.suiviDocumentModifie = suivi.suiviDocumentModifie;
exports.suiviFacteur         = suivi.suiviFacteur;
exports.suiviProfilTesteur   = suivi.suiviProfilTesteur;
exports.suiviPassageKo       = suivi.suiviPassageKo;
exports.suiviAnomalieCorrigee = suivi.suiviAnomalieCorrigee;
exports.suiviAdmin           = suivi.suiviAdmin;

/* Les automatisations du hub : activité, notifications, e-mails, progression. */
const hub = require('./hub');
Object.assign(exports, hub);

/* La porte des robots : les tests automatisés rendent leur verdict en direct. */
exports.suiviRobot = require('./robot').suiviRobot;

/* La porte d'entrée : lien d'invitation, code à six chiffres, session. */
const connexion = require('./connexion');
exports.suiviConnexion = connexion.suiviConnexion;
