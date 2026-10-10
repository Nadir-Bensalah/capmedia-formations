/* ==========================================================================
   La fiche du testeur, remplie par lui à sa première connexion.

   Le Cockpit l'inscrit avec trois choses : son adresse, son prénom, ce
   qu'il teste. Le reste, c'est lui qui le dit, une fois, avant d'entrer :
   son nom, son profil (sexe, âge, ce qu'il fait, son aisance), ce qu'il
   teste vraiment, et l'appareil depuis lequel il se connecte, relevé par
   la machine et complété par lui. C'est lui qui valide, et c'est sa
   validation qui fait foi dans la base (ficheValidee). Ensuite, chaque
   connexion ajoute l'appareil du jour à sa liste, sans rien demander.

   Elle passe après l'accueil : il sait ce qu'est Capmedia Test avant qu'on
   lui demande son âge. Et elle a une sortie : on peut se déconnecter (une
   mauvaise adresse, un mauvais moment), et ne pas dire son sexe.
   ========================================================================== */

import { bdd, auth, doc, updateDoc, serverTimestamp, echapper, PLATEFORMES_TEST, signOut, effacerSecretsLocaux, uidCourant } from './noyau.js';
import { modale, toast, agir, icone } from './ui.js';
import { releverAppareil, libelleAppareil } from './appareil.js';

const AGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65 et plus'];
const AISANCE = ['À l\'aise', 'Moyenne', 'Peu à l\'aise'];
const SEXES = [['homme', 'Homme'], ['femme', 'Femme'], ['autre', 'Autre'], ['non-dit', 'Je préfère ne pas le dire']];
/* « 65 et plus » se lit « 65 ans et plus », pas « 65 et plus ans ». */
const libelleAge = (v) => (/ et plus$/.test(v) ? v.replace(/ et plus$/, ' ans et plus') : `${v} ans`);
const MOTS_PLATEFORME = { ios: 'iPhone', android: 'Android', web: 'Web' };

/* La liste des appareils, avec celui-ci ajouté ou rafraîchi. Dix au plus :
   les plus anciens s'effacent. */
/* Ce que la fiche garde d'un appareil : les règles n'acceptent que ces
   champs, et rien d'autre. Le reste du relevé (mémoire, cœurs, fuseau)
   sert au contexte d'un passage, pas à la fiche. */
const CHAMPS_APPAREIL = ['cle', 'plateforme', 'modele', 'os', 'navigateur', 'ecran', 'reseau', 'agent', 'vu', 'confirme'];
const epurer = (a) => Object.fromEntries(CHAMPS_APPAREIL.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));

const fusionner = (liste, courant, { confirme } = {}) => {
  const autres = (Array.isArray(liste) ? liste : []).filter((a) => a && a.cle !== courant.cle).map(epurer);
  const ancien = (Array.isArray(liste) ? liste : []).find((a) => a && a.cle === courant.cle) || {};
  const neuf = epurer({ ...ancien, ...courant, vu: new Date(), confirme: confirme === undefined ? (ancien.confirme !== false) : confirme });
  return [...autres, neuf].slice(-10);
};

/** À chaque connexion, silencieusement : cet appareil, daté. */
export const consignerAppareil = async (testeur) => {
  if (!testeur || !testeur.ficheValidee) return;
  const uid = uidCourant();
  try {
    const courant = await releverAppareil();
    const ancien = (testeur.appareils || []).find((a) => a && a.cle === courant.cle);
    /* Déjà vu aujourd'hui : rien à écrire. */
    if (ancien && ancien.vu && (Date.now() - new Date(ancien.vu.toDate ? ancien.vu.toDate() : ancien.vu).getTime()) < 6 * 3600 * 1000) return;
    const appareils = fusionner(testeur.appareils, { ...courant, modele: (ancien && ancien.modele) || courant.modele });
    await updateDoc(doc(bdd, 'testeurs', uid), { appareils, maj: serverTimestamp() });
    testeur.appareils = appareils;
  } catch (e) { console.warn('[testeur] appareil non consigné', e); }
};

const facultatif = ' <span class="facultatif">(facultatif)</span>';
const champ = (id, libelle, valeur, { type = 'text', placeholder = '', requis = false } = {}) => `
  <div class="groupe"><label class="etiquette-champ" for="${id}">${echapper(libelle)}${requis ? '' : ' <span class="facultatif">(facultatif)</span>'}</label>
    <input class="champ" id="${id}" type="${type}" value="${echapper(valeur || '')}" placeholder="${echapper(placeholder)}"></div>`;

/**
 * La fiche, devant tout, tant qu'elle n'est pas validée. Rend une promesse
 * tenue quand le testeur a validé (jamais avant : la fiche ne se ferme pas).
 */
export const ouvrirFiche = async (testeur) => {
  const uid = uidCourant();
  const p = testeur.profil || {};
  const courant = await releverAppareil();
  const dejaLa = (testeur.appareils || []).find((a) => a && a.cle === courant.cle);
  const plateformes = new Set(testeur.plateformes || []);
  if (!plateformes.size) plateformes.add(courant.plateforme);

  const m = modale({
    titre: 'Vous, en deux minutes',
    sousTitre: 'Qui teste et sur quoi, une seule fois. Le client lit votre profil, jamais votre nom.',
    feuille: true, fermable: false,
    corps: `
      <section class="fiche-bloc">
        <h3 class="bloc-tete">Vous</h3>
        <div class="forme-rang">
          ${champ('ft-prenom', 'Prénom', testeur.prenom || '', { requis: true, placeholder: 'Karim' })}
          ${champ('ft-nom', 'Nom', testeur.nom || '', { requis: true, placeholder: 'Votre nom de famille' })}
        </div>
        <div class="forme-rang">
          <div class="groupe"><label class="etiquette-champ" for="ft-sexe">Sexe</label>
            <select class="select" id="ft-sexe"><option value="">Choisir</option>${SEXES.map(([v, l]) => `<option value="${v}"${p.sexe === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="groupe"><label class="etiquette-champ" for="ft-age">Tranche d'âge</label>
            <select class="select" id="ft-age"><option value="">Choisir</option>${AGES.map((v) => `<option value="${echapper(v)}"${p.age === v ? ' selected' : ''}>${echapper(libelleAge(v))}</option>`).join('')}</select></div>
        </div>
        ${champ('ft-expertise', 'Votre domaine', p.expertise || p.fonction || '', { requis: true, placeholder: 'Infirmière, développeur, étudiante en droit, commerçant…' })}
        <div class="groupe"><label class="etiquette-champ" for="ft-aisance">Votre aisance avec le numérique${facultatif}</label>
          <select class="select" id="ft-aisance"><option value="">Choisir</option>${AISANCE.map((v) => `<option value="${echapper(v)}"${p.aisance === v ? ' selected' : ''}>${echapper(v)}</option>`).join('')}</select></div>
        <p class="aide">Un blocage n'a pas le même sens chez une experte et chez un débutant : c'est pour cela que le client lit votre profil.</p>
      </section>

      <section class="fiche-bloc">
        <h3 class="bloc-tete">Ce que vous testez</h3>
        <div class="cases-blocs">${Object.entries(PLATEFORMES_TEST).map(([cle, x]) => `
          <label class="case"><input type="checkbox" data-ft-plateforme="${echapper(cle)}" ${plateformes.has(cle) ? 'checked' : ''}> ${icone(cle === 'ios' ? 'apple' : cle === 'android' ? 'android' : 'globe')} ${echapper(MOTS_PLATEFORME[cle] || x.libelle)}</label>`).join('')}</div>
        <p class="aide">Cochez ce que vous avez sous la main. Un scénario iPhone ne sera confié qu'à qui a un iPhone.</p>
      </section>

      <section class="fiche-bloc">
        <h3 class="bloc-tete">Cet appareil</h3>
        <div class="appareil-releve">
          <p><b>${echapper(libelleAppareil(courant))}</b></p>
          <p class="t-petit t-2">Écran ${echapper(courant.ecran)}${courant.reseau ? ` · réseau ${echapper(courant.reseau)}` : ''}${courant.memoire ? ` · ${echapper(String(courant.memoire))} Go de mémoire` : ''}</p>
        </div>
        ${champ('ft-modele', 'Le modèle exact', (dejaLa && dejaLa.modele) || courant.modele, { placeholder: 'iPhone 13, Galaxy S23, MacBook Air M2…', requis: true })}
        <label class="case"><input type="checkbox" id="ft-confirme" checked> Je testerai depuis cet appareil</label>
        <p class="aide">Le web ne dit pas le numéro du modèle : précisez-le, c'est ce qui permet de reproduire un défaut. Vos autres appareils s'ajouteront tout seuls à votre première connexion depuis chacun.</p>
      </section>`,
    pied: '<button class="btn btn-fantome" type="button" data-sortir-fiche>Se déconnecter</button><span class="pousse"></span><button class="btn btn-principal" type="button" data-valider>Valider ma fiche</button>',
  });
  /* Sur un téléphone, le clavier ne monte pas tout seul sur le premier
     champ : il couvrirait la fiche avant qu'il l'ait lue. */
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    setTimeout(() => { if (m.el.contains(document.activeElement) && document.activeElement.matches('input, select, textarea')) document.activeElement.blur(); }, 60);
  }
  m.el.querySelector('[data-sortir-fiche]').addEventListener('click', async () => {
    try { effacerSecretsLocaux(); await signOut(auth); } catch (e) { /* on part quand même */ }
    location.replace('./?espace=test');
  });

  return new Promise((resoudre) => {
    const bouton = m.el.querySelector('[data-valider]');
    bouton.addEventListener('click', () => agir(bouton, async () => {
      const v = (id) => (m.el.querySelector(`#${id}`).value || '').trim();
      const prenom = v('ft-prenom'); const nom = v('ft-nom'); const expertise = v('ft-expertise');
      const sexeChoisi = v('ft-sexe'); const age = v('ft-age');
      /* « Je préfère ne pas le dire » est une réponse : rien n'est écrit. */
      const sexe = sexeChoisi === 'non-dit' ? '' : sexeChoisi; const aisance = v('ft-aisance'); const modele = v('ft-modele');
      const choisies = [...m.el.querySelectorAll('[data-ft-plateforme]')].filter((x) => x.checked).map((x) => x.dataset.ftPlateforme);
      if (!prenom || !nom) { toast('Votre prénom et votre nom, s\'il vous plaît.', 'erreur'); return; }
      if (!sexeChoisi || !age) { toast('Choisissez une réponse pour le sexe (vous pouvez ne pas le dire) et votre tranche d\'âge.', 'erreur'); return; }
      if (!expertise) { toast('Dites votre domaine : ce que vous faites, ce que vous connaissez.', 'erreur'); return; }
      if (!choisies.length) { toast('Cochez au moins une plateforme.', 'erreur'); return; }
      if (!modele) { toast('Précisez le modèle de cet appareil.', 'erreur'); return; }
      const confirme = m.el.querySelector('#ft-confirme').checked;
      const appareils = fusionner(testeur.appareils, { ...courant, modele }, { confirme });
      const profil = { ...(testeur.profil || {}), sexe, age, expertise, fonction: p.fonction || expertise, aisance, langue: p.langue || 'fr' };
      delete profil.certifie;
      if (testeur.profil && testeur.profil.certifie !== undefined) profil.certifie = Boolean(testeur.profil.certifie);
      const donnees = {
        prenom, nom, profil, plateformes: choisies,
        mobile: choisies.find((x) => x !== 'web') || '',
        appareils, ficheValidee: serverTimestamp(), maj: serverTimestamp(),
      };
      try {
        await updateDoc(doc(bdd, 'testeurs', uid), donnees);
        Object.assign(testeur, donnees, { ficheValidee: new Date() });
        toast('Merci. Votre fiche est enregistrée.');
        m.fermer(true);
        resoudre(true);
      } catch (e) {
        console.error(e);
        toast("La fiche n'a pas pu être enregistrée. Réessayez.", 'erreur');
      }
    }));
  });
};
