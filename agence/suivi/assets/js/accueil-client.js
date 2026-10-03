/* ==========================================================================
   CAPMEDIA HUB · l'accueil du client

   Les écrans de la première fois (le moteur est dans accueil.js), courts et
   dans l'ordre d'un fil : la porte (bienvenue, au nom de son entreprise),
   son projet, l'application à installer sur son ordinateur (seulement s'il
   est sur le web, depuis un Mac ou un PC), puis « tout est prêt ».

   Ce qui est fait est consigné dans son profil (app.js, champ « accueil ») :
   l'accueil ne se rejoue pas sur un autre appareil ni dans l'application,
   et l'administrateur voit sur la fiche du client qui a fait ses premiers pas.
   ========================================================================== */

import { echapper, prenom, nomAffiche, typeProjetAffiche } from './noyau.js';
import * as magasin from './magasin.js';
import { K } from './donnees.js';
import { icone } from './ui.js';
import { ouvrirAccueil as ouvrirMoteur, accueilVu as vu, marquerAccueilVu as marquer, mascotteHtml, ecranInstallerApp, ecranPret } from './accueil.js';
import { installable } from './installer.js';

const prenomDe = (session) => prenom(nomAffiche(session));
const societeDe = (session) => { const o = (session.organisations || [])[0] || {}; return String(o.entreprise || o.nom || '').trim(); };

const CLE = (uid) => `suivi:client-accueil:${uid || ''}`;

export const accueilVu = (uid) => vu(CLE(uid));
export const marquerAccueilVu = (uid) => marquer(CLE(uid));

const initialesDe = (nom) => String(nom || '').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('') || '·';
const iconeProjet = (p) => (p.logo
  ? `<span class="accueil-appli-icone"><img src="${echapper(p.logo)}" alt=""></span>`
  : `<span class="accueil-appli-icone accueil-appli-icone--initiales">${echapper(initialesDe(p.nom))}</span>`);
/* Le type dit « Application web et mobile » quand le projet a les deux :
   ses plateformes, et ses parties si elles sont déjà là. */
const typeDe = (p) => typeProjetAffiche(p, magasin.lire(K.composants(p.id)) || []);

/* --------------------------------------------------------------------------
   Les écrans
   -------------------------------------------------------------------------- */

const ecranProjets = (projets) => {
  const liste = (projets || []).filter((p) => !p.archive);
  if (!liste.length) {
    return {
      cle: 'projets',
      visuel: `<div class="accueil-appli"><span class="accueil-appli-icone accueil-appli-icone--vide">${icone('projets')}</span></div>`,
      texte: `<p class="surtitre">Votre projet</p>
        <h2>Il arrive bientôt</h2>
        <p>Dès que l'équipe l'ouvre, il apparaît ici.</p>`,
    };
  }
  if (liste.length === 1) {
    const p = liste[0];
    return {
      cle: 'projets',
      visuel: `<div class="accueil-appli">${iconeProjet(p)}<p class="accueil-appli-nom">${echapper(p.nom || '')}</p>${typeDe(p) ? `<p class="accueil-appli-type">${echapper(typeDe(p))}</p>` : ''}</div>`,
      texte: `<p class="surtitre">Votre projet</p>
        <h2>Tout votre projet, au même endroit</h2>
        <p>Son avancement, ses versions, vos tickets et vos fichiers.</p>`,
    };
  }
  return {
    cle: 'projets',
    visuel: `<div class="accueil-applis">${liste.slice(0, 4).map((p) => `<div class="accueil-appli accueil-appli--petite">${iconeProjet(p)}<p class="accueil-appli-nom">${echapper(p.nom || '')}</p></div>`).join('')}</div>`,
    texte: `<p class="surtitre">Vos projets</p>
      <h2>${liste.length} projets, au même endroit</h2>
      <p>Pour chacun : son avancement, ses versions, vos tickets et vos fichiers.</p>`,
  };
};

/* L'application pour son ordinateur et le dernier écran : communs au Hub
   et à Test (accueil.js). */
const ecranApplication = () => ecranInstallerApp('hub');
const ecranFin = (session) => ecranPret({ prenom: prenomDe(session) });

/* --------------------------------------------------------------------------
   L'ouverture
   -------------------------------------------------------------------------- */

/**
 * Renvoie { el, majProjets, fermer, entame }. `projets` est une fonction :
 * la liste peut arriver pendant que l'accueil est ouvert. `avecTests` est
 * gardé pour l'appelant (app.js) mais l'écran des tests n'existe plus.
 */
export const ouvrirAccueil = ({ session, projets, surFin = null }) => {
  const societe = societeDe(session);
  const moteur = ouvrirMoteur({
    service: 'Hub',
    classe: 'accueil-porte--hub',
    prenom: prenomDe(session) || '',
    titre: societe ? `Bienvenue ${societe}` : `Bienvenue${prenomDe(session) ? `, ${prenomDe(session)}` : ''}`,
    texte: 'Sur votre Hub Capmedia, un espace pensé pour vous.',
    visuel: mascotteHtml(),
    ecrans: () => [ecranProjets(projets()), ...(installable() ? [ecranApplication()] : []), ecranFin(session)],
    surFin,
  });
  return { el: moteur.el, majProjets: () => { moteur.redessiner('projets'); }, fermer: moteur.fermer, get entame() { return moteur.entame; } };
};
