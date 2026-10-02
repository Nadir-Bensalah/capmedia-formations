/* ==========================================================================
   CAPMEDIA CLIENT HUB · la session d'un administrateur, pour les outils
   d'exploitation (ouvrir-comptes, poser-logos, remplir-projet...)

   Il n'y a plus de clé d'administration partagée : un outil agit au nom
   d'une personne de l'équipe, comme le cockpit. La session s'ouvre par la
   même porte que le cockpit, le code à six chiffres :

     1. l'adresse (ADMIN_EMAIL, ou demandée) reçoit un code ;
     2. on tape le code dans le terminal ;
     3. la porte rend un lien à usage unique, consommé ici, qui donne un
        jeton d'identité Firebase d'une heure ;
     4. chaque appel à suiviAdmin porte ce jeton ; le serveur décide
        d'après le rôle et les permissions de CETTE personne.

   Sur les émulateurs (FIREBASE_AUTH_EMULATOR_HOST), la session du banc
   (session-banc.cjs) remplace le code.

     import { appelerAdmin } from './lib/session-admin.mjs';
     const r = await appelerAdmin({ action: 'creerProjet', ref: 'X', nom: 'X' });
     // r = { code, texte, json }
   ========================================================================== */

import readline from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJET = process.env.PROJET_FIREBASE || process.env.GCLOUD_PROJECT || 'capmedia-1f90d';
const EMULATEUR = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const FONCTIONS = process.env.FONCTIONS_SUIVI
  || (EMULATEUR ? `${require('./ports-banc.cjs').fonctions}/${PROJET}/europe-west1` : `https://europe-west1-${PROJET}.cloudfunctions.net`);

/* La clé web publique du Hub, lue dans la configuration du site : elle ne
   protège rien (ce sont les règles et le serveur), elle désigne le projet. */
const cleWeb = () => {
  const texte = readFileSync(new URL('../../../agence/suivi/assets/js/config-suivi.js', import.meta.url), 'utf8');
  const m = texte.match(/apiKey:\s*'([^']+)'/);
  if (!m) throw new Error('Clé web du Hub introuvable dans config-suivi.js');
  return m[1];
};

const demander = async (question) => {
  const io = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return (await io.question(question)).trim(); } finally { io.close(); }
};

let jetonCourant = null;
let jetonDepuis = 0;

async function ouvrirSession() {
  if (EMULATEUR) {
    const { jetonPour, ADMIN_BANC } = require('./session-banc.cjs');
    return jetonPour(process.env.ADMIN_EMAIL || ADMIN_BANC);
  }
  const email = (process.env.ADMIN_EMAIL || await demander('Votre adresse d équipe : ')).toLowerCase();
  const porte = `${FONCTIONS}/suiviConnexion`;
  const appel = async (corps) => {
    const r = await fetch(porte, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    return { code: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const d = await appel({ action: 'demanderCode', email });
  if (!d.ok) throw new Error(d.message || `Demande de code refusée (${d.code})`);
  const code = await demander(`Code reçu à ${email} : `);
  const v = await appel({ action: 'verifierCode', email, code });
  if (!v.ok || !v.lien) throw new Error(v.message || `Code refusé (${v.code})`);
  const oobCode = new URL(v.lien).searchParams.get('oobCode');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${cleWeb()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, oobCode }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.idToken) throw new Error(`Session impossible : ${JSON.stringify(j).slice(0, 200)}`);
  console.log(`Session ouverte au nom de ${email}.`);
  return j.idToken;
}

/** Appelle suiviAdmin au nom de la personne connectée. Rend { code, texte, json }. */
export async function appelerAdmin(corps) {
  /* Un jeton d'identité vit une heure : on en rouvre un avant. */
  if (!jetonCourant || Date.now() - jetonDepuis > 50 * 60 * 1000) {
    jetonCourant = await ouvrirSession();
    jetonDepuis = Date.now();
  }
  const reponse = await fetch(`${FONCTIONS}/suiviAdmin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jetonCourant}` },
    body: JSON.stringify(corps),
  });
  const texte = await reponse.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* réponse en texte brut */ }
  return { code: reponse.status, texte, json };
}

export const PORTE_SUIVI = `${FONCTIONS}/suiviAdmin`;
