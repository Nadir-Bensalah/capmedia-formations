/* ==========================================================================
   Les données réelles des outils vivent HORS du dépôt.

   Le dépôt est public. Les outils (semis, remplissage, pièces comptables,
   portefeuille) restent versionnés, mais les données d'un vrai client,
   ses montants, ses adresses, ses dépôts et les chemins du disque sont
   rangés dans `fonctions-suivi/outils/donnees-locales/`, que Git ignore.

   Chaque outil demande ses données par un nom : `chargerDonnees('regles')`
   lit `donnees-locales/regles.mjs`. Sur le banc (émulateur), si le fichier
   local manque, l'outil prend l'exemple fictif `exemples/regles.exemple.mjs`,
   pour que les suites tournent sur n'importe quelle machine. Hors banc,
   l'absence du fichier local arrête l'outil : on ne sème jamais un exemple
   fictif dans la vraie base.
   ========================================================================== */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_LOCAL = join(ici, '..', 'donnees-locales');
export const DOSSIER_EXEMPLES = join(ici, '..', 'exemples');

export const surLeBanc = () => Boolean(process.env.FIRESTORE_EMULATOR_HOST) || /127\.0\.0\.1|localhost/.test(process.env.PORTE_SUIVI || '');

/** Les données `nom` : le fichier local, sinon l'exemple fictif sur le banc, sinon une erreur. */
export const chargerDonnees = async (nom, { exemple: nomExemple = nom } = {}) => {
  const local = join(DOSSIER_LOCAL, `${nom}.mjs`);
  if (existsSync(local)) return import(pathToFileURL(local).href);
  const exemple = join(DOSSIER_EXEMPLES, `${nomExemple}.exemple.mjs`);
  if (surLeBanc() && existsSync(exemple)) {
    console.warn(`(données locales « ${nom} » absentes : exemple fictif utilisé, banc seulement)`);
    return import(pathToFileURL(exemple).href);
  }
  console.error(`Données locales absentes : ${local}\nCopiez ${exemple} vers ce chemin et remplissez-le. Ce dossier n'est jamais versionné.`);
  process.exit(2);
};

/** Une variable d'environnement obligatoire (adresse, identifiant réel) : jamais de valeur par défaut dans le dépôt. */
export const exiger = (nom, aide) => {
  const v = process.env[nom];
  if (!v || !String(v).trim()) { console.error(`Variable ${nom} requise. ${aide || ''}`.trim()); process.exit(2); }
  return String(v).trim();
};
