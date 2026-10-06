/* ==========================================================================
   CAPMEDIA CLIENT HUB · les briques d'interface
   Tout ce qui se dessine plus d'une fois vit ici : pastilles, avatars,
   états vides, squelettes, modales, menus, toasts, dépôt de fichiers.
   Chaque brique renvoie du HTML sûr : tout texte passe par `echapper`.
   ========================================================================== */

import {
  $, $$, echapper, initiales, borner, poids, depuis, enParagraphes, avecLiens,
  envoyerPiece, lienPiece, estPieceMessage, lirePieceMessage, jourRelatif, enDate, PLATEFORMES_CHOIX, PLATEFORMES_DEMANDE, libellePlateforme, FORMATS_ACCEPTES,
} from './noyau.js';
import { icone } from './icones.js';

export { icone };

/* ==========================================================================
   1. Les petites briques
   ========================================================================== */

/** Une pastille d'état. `carte` est un vocabulaire du noyau, `cle` sa valeur. */
export const pastille = (carte, cle, options = {}) => {
  const fiche = (carte && carte[cle]) || null;
  const libelle = fiche
    ? (options.client && fiche.client) || (options.equipe && fiche.equipe) || fiche.libelle
    : (cle || '');
  const voile = fiche ? fiche.voile : 'gris';
  return `<span class="pastille pastille--${voile}">${echapper(libelle)}</span>`;
};

export const pastilleTexte = (texte, voile = 'gris') =>
  `<span class="pastille pastille--${voile}">${echapper(texte)}</span>`;

export const puce = (carte, cle) => {
  const fiche = (carte && carte[cle]) || { libelle: cle, voile: 'gris' };
  return `<span class="puce puce--${fiche.voile}"><i aria-hidden="true"></i>${echapper(fiche.libelle)}</span>`;
};

/** Une plateforme : son icône, son libellé, sa couleur. */
export const pucePlateforme = (cle, options = {}) => {
  const f = PLATEFORMES_DEMANDE[cle];
  if (!f) return '';
  return `<span class="plateforme plateforme--${f.voile}"${options.titre ? ` title="${echapper(f.libelle)}"` : ''}>${icone(f.icone)}${options.court === true ? echapper(f.court) : options.court === false ? '' : echapper(f.libelle)}</span>`;
};

/**
 * Un choix de plateformes en pastilles. `genre` : 'checkbox' pour en cocher
 * plusieurs (un projet), 'radio' pour une seule (une demande).
 */
export const choixPlateformes = (nom, choisies = [], { genre = 'checkbox', limiter = null, avecVide = false, table = PLATEFORMES_CHOIX } = {}) => {
  const cles = Object.keys(limiter && limiter.length ? Object.fromEntries(limiter.filter((c) => table[c]).map((c) => [c, table[c]])) : table)
    .filter((c) => c !== '' || avecVide);
  const prises = Array.isArray(choisies) ? choisies : [choisies];
  return `<div class="choix-plateformes">${cles.map((c) => {
    const f = table[c];
    return `<label><input type="${genre}" name="${echapper(nom)}" value="${echapper(c)}"${prises.includes(c) ? ' checked' : ''}><span class="plateforme plateforme--${f.voile}">${icone(f.icone)}${echapper(f.libelle)}</span></label>`;
  }).join('')}</div>`;
};

/** L'icône et la couleur d'une plateforme, pour une pastille de liste. */
export const iconePlateforme = (cle) => (PLATEFORMES_DEMANDE[cle] || {}).icone || '';
export const tonPlateforme = (cle) => (PLATEFORMES_DEMANDE[cle] || {}).voile || '';

export const badge = (n, vif = false) => (n > 0
  ? `<span class="badge${vif ? ' badge--vif' : ''}">${echapper(n)}</span>`
  : '');

/* Une teinte par nom, toujours la même : deux clients ne se ressemblent
   pas, et l'œil retrouve le sien d'une liste à l'autre. */
const TEINTES = ['bleu', 'vert', 'violet', 'ambre', 'rouge', 'sarcelle', 'rose', 'indigo'];
export const teinteDe = (nom) => {
  const t = String(nom || '');
  let somme = 0;
  for (let i = 0; i < t.length; i += 1) somme = (somme * 31 + t.charCodeAt(i)) % 100000;
  return TEINTES[somme % TEINTES.length];
};

export const avatar = (nom, options = {}) => {
  const classes = ['avatar'];
  if (options.equipe) classes.push('avatar--equipe');
  else if (options.teinte !== false) classes.push(`avatar--t-${teinteDe(nom)}`);
  if (options.taille) classes.push(`avatar--${options.taille}`);
  return `<span class="${classes.join(' ')}" aria-hidden="true">${echapper(initiales(nom))}</span>`;
};

/**
 * Un avatar de client et le logo d'un de ses projets, en pile : le logo
 * se pose en bas à droite, légèrement par-dessus. Sans projet, l'avatar
 * reste seul.
 */
export const avatarEmpile = (nom, projet, options = {}) => `
  <span class="pile-avatar${options.taille ? ` pile-avatar--${options.taille}` : ''}">
    ${avatar(nom, options)}
    ${projet ? `<span class="pile-avatar-jeton">${avatarProjet(projet, 'mini')}</span>` : ''}
  </span>`;

/**
 * L'écusson d'un projet : son logo s'il en a un, ses initiales sinon.
 * `projet` accepte aussi une simple chaîne, pour les anciens appels.
 */
export const avatarProjet = (projet, taille = '') => {
  const nom = typeof projet === 'string' ? projet : (projet && projet.nom) || '';
  const logo = typeof projet === 'object' && projet ? projet.logo : '';
  const classes = `avatar-projet${taille ? ` avatar-projet--${taille}` : ''}${logo ? ' avatar-projet--logo' : ''}`;
  if (logo) return `<span class="${classes}" aria-hidden="true"><img src="${echapper(logo)}" alt=""></span>`;
  return `<span class="${classes}" aria-hidden="true">${echapper(initiales(nom))}</span>`;
};

/* Les familles de plateformes, pour la pastille posée sur un logo de projet :
   une application mobile, un site ou une interface web, un serveur. */
const FAMILLES = {
  mobile:  { cles: ['ios', 'android'],           icone: 'smartphone', voile: 'bleu',   libelle: 'Mobile' },
  web:     { cles: ['web', 'landing', 'admin'],  icone: 'globe',      voile: 'violet', libelle: 'Web' },
  backend: { cles: ['backend'],                  icone: 'serveur',    voile: 'ambre',  libelle: 'Serveur' },
};
export const familleProjet = (projet) => {
  const p = (projet && projet.plateformes) || [];
  return Object.keys(FAMILLES).find((f) => FAMILLES[f].cles.some((c) => p.includes(c))) || '';
};

/**
 * Les projets d'un client, en logos alignés. Chaque logo porte la pastille
 * de sa famille : mobile, web ou serveur. Au-delà de quatre, le reste est
 * compté. Purement indicatif : la ligne entière reste le seul lien.
 */
export const pileProjets = (projets, { max = 4 } = {}) => {
  const liste = (projets || []).filter(Boolean);
  if (!liste.length) return '';
  const vus = liste.slice(0, max);
  const reste = liste.length - vus.length;
  return `<span class="pile-projets" aria-hidden="true">${vus.map((p) => {
    const f = FAMILLES[familleProjet(p)];
    const noms = (p.plateformes || []).map((c) => libellePlateforme(c)).filter(Boolean).join(', ');
    return `<span class="pile-projet" data-astuce="${echapper(noms ? `${p.nom} · ${noms}` : p.nom)}">
      ${avatarProjet(p, 'petit')}
      ${f ? `<span class="pile-badge pile-badge--${f.voile}" title="${echapper(f.libelle)}">${icone(f.icone)}</span>` : ''}
    </span>`;
  }).join('')}${reste > 0 ? `<span class="pile-reste">+${reste}</span>` : ''}</span>`;
};

export const progression = (valeur, ton = '') =>
  `<div class="progression${ton ? ` progression--${ton}` : ''}" role="progressbar" aria-valuenow="${borner(valeur)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${borner(valeur)}%"></i></div>`;

export const anneau = (valeur, grand = false) =>
  `<div class="anneau${grand ? ' anneau--grand' : ''}" style="--v:${borner(valeur)}" role="img" aria-label="${borner(valeur)} %"><span>${borner(valeur)}%</span></div>`;

/* Une progression inconnue n'est pas une progression nulle. Plutôt que de
   dessiner une barre à zéro sur un projet bien avancé, on l'avoue. */
export const progressionOuPas = (prog, ton = '') => (prog && prog.valeur === null
  ? '<span class="t-micro t-3">Non estimée</span>'
  : progression(prog ? prog.valeur : 0, ton));
export const anneauOuPas = (prog, grand = false) => (prog && prog.valeur === null
  ? `<div class="anneau anneau--vide${grand ? ' anneau--grand' : ''}" role="img" aria-label="Progression non estimée"><span>?</span></div>`
  : anneau(prog ? prog.valeur : 0, grand));

/**
 * Le verdict d'une échéance, en pastille. C'est la brique qui répond à la
 * seule question pour laquelle un client décroche son téléphone : est-ce
 * qu'on tient la date ?
 */
export const verdictHtml = (v, options = {}) => {
  if (!v || v.cle === 'sans') return options.vide === false ? '' : '<span class="puce t-3"><i></i>Pas de date fixée</span>';
  const detail = v.detail && options.detail !== false ? ` <span class="t-3">${echapper(v.detail)}</span>` : '';
  return `<span class="puce puce--${v.voile}"><i aria-hidden="true"></i>${echapper(v.libelle)}${detail}</span>`;
};

export const metrique = (valeur, libelle, options = {}) => `
  <div class="metrique${options.ton ? ` metrique--${options.ton}` : ''}">
    <p class="metrique-valeur">${echapper(valeur)}</p>
    <p class="metrique-libelle">${echapper(libelle)}</p>
    ${options.nuance ? `<p class="metrique-nuance">${echapper(options.nuance)}</p>` : ''}
  </div>`;

/** Une ligne de liste : icône, titre, sous-titre, fin. */
export const ligne = ({ href, icone: nomIcone, ton, titre, sous, fin, nonLu, action, attrs = '' }) => {
  /* Une ligne qui ne mène nulle part n'est pas un bouton : sinon les boutons
     d'édition qu'elle porte se retrouveraient imbriqués, et le navigateur
     les rejetterait hors de la ligne, l'un sous l'autre.

     Et une ligne qui mène quelque part ET porte un bouton tombe dans le
     même piège : un <button> dans un <button> est invalide, le navigateur
     éjecte l'intérieur, et le crayon se retrouve seul sur la ligne du
     dessous. Dans ce cas la ligne reste un conteneur inerte et c'est son
     TITRE qui devient le bouton : la rangée entière n'est plus cliquable,
     mais rien ne saute hors de sa place. */
  const porteUnBouton = /<button/.test(String(fin || ''));
  const agissante = Boolean(href || action || /data-action/.test(attrs));
  const titreAgit = agissante && !href && porteUnBouton;
  const balise = href ? 'a' : (agissante && !titreAgit ? 'button' : 'div');
  const lien = href ? ` href="${echapper(href)}"` : (agissante && !titreAgit ? ' type="button"' : '');
  const classes = ['ligne'];
  if (!agissante) classes.push('ligne--inerte');
  if (titreAgit) classes.push('ligne--titre-agit');
  if (!nomIcone) classes.push('ligne--sans-icone');
  if (nonLu) classes.push('non-lu');
  /* Quand c'est le titre qui agit, les attributs d'action voyagent avec
     lui : la ligne elle-même ne doit plus rien déclencher. */
  const surLigne = titreAgit ? '' : `${action ? ` data-action="${echapper(action)}"` : ''} ${attrs}`;
  const surTitre = titreAgit ? `${action ? ` data-action="${echapper(action)}"` : ''} ${attrs}` : '';

  return `<${balise} class="${classes.join(' ')}"${lien}${surLigne}>
    ${nomIcone ? `<span class="ligne-icone${ton ? ` ligne-icone--${ton}` : ''}">${icone(nomIcone)}</span>` : ''}
    <span class="ligne-corps">
      ${titreAgit ? `<button class="ligne-titre ligne-titre--bouton" type="button"${surTitre}>${titre}</button>` : `<span class="ligne-titre">${titre}</span>`}
      ${sous ? `<span class="ligne-sous">${sous}</span>` : ''}
    </span>
    <span class="ligne-fin">${fin || ''}${href ? `<span class="chevron">${icone('chevronDroite')}</span>` : ''}</span>
  </${balise}>`;
};

/** Un fait : libellé au-dessus, valeur en dessous. */
export const fait = (libelle, valeur) => (valeur
  ? `<div class="fait"><dt>${echapper(libelle)}</dt><dd>${valeur}</dd></div>`
  : '');

/** Un bloc vide utile : il dit ce qui manque et propose le geste suivant. */
export const vide = ({ icone: nomIcone = 'inbox', titre, texte = '', action = '', compact = false }) => `
  <div class="vide${compact ? ' vide--compact' : ''}">
    <span class="vide-icone">${icone(nomIcone)}</span>
    <p class="vide-titre">${echapper(titre)}</p>
    ${texte ? `<p class="vide-texte">${echapper(texte)}</p>` : ''}
    ${action}
  </div>`;

export const encart = (texte, ton = '', nomIcone = 'info') =>
  `<div class="encart${ton ? ` encart--${ton}` : ''}">${icone(nomIcone)}<div>${texte}</div></div>`;

/** Le squelette d'attente. `genre` : lignes, cartes, page. */
export const squelette = (genre = 'lignes', n = 4) => {
  if (genre === 'page') {
    return `<div class="squelette" aria-busy="true" aria-live="polite">
      <div class="os os--titre"></div><div class="os os--texte"></div>
      <div style="height:16px"></div>
      ${'<div class="os os--ligne"></div>'.repeat(n)}
    </div>`;
  }
  if (genre === 'cartes') {
    return `<div class="grille grille-3" aria-busy="true">${'<div class="os os--carte"></div>'.repeat(n)}</div>`;
  }
  return `<div class="squelette" aria-busy="true">${'<div class="os os--ligne"></div>'.repeat(n)}</div>`;
};

/** Un <select> prêt à l'emploi depuis un vocabulaire. */
export const optionsDe = (carte, valeur = '', options = {}) => Object.entries(carte)
  .filter(([cle]) => !options.exclure || !options.exclure.includes(cle))
  .map(([cle, fiche]) => {
    const libelle = typeof fiche === 'string' ? fiche : fiche.libelle;
    return `<option value="${echapper(cle)}"${cle === valeur ? ' selected' : ''}>${echapper(libelle)}</option>`;
  }).join('');

/** L'échéance colorée d'une date. */
export const echeanceHtml = (fiche) => (fiche && fiche.texte
  ? `<span class="puce puce--${fiche.ton}"><i aria-hidden="true"></i>${echapper(fiche.texte)}</span>`
  : '');

/* ==========================================================================
   2. La chronologie
   ========================================================================== */

/** Groupe une liste par jour, dans l'ordre reçu. */
export const parJour = (items, champ = 'date') => {
  const groupes = [];
  for (const item of items) {
    const jour = jourRelatif(item[champ]);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === jour) dernier.items.push(item);
    else groupes.push({ jour, items: [item] });
  }
  return groupes;
};

export const chronoItem = ({ icone: nomIcone = 'point', ton = '', texte, date, lien }) => `
  <div class="chrono-item">
    <span class="chrono-point${ton ? ` chrono-point--${ton}` : ''}">${icone(nomIcone) || ''}</span>
    <div>
      <div class="chrono-texte">${lien ? `<a href="${echapper(lien)}" style="color:inherit">${texte}</a>` : texte}</div>
      ${date ? `<div class="chrono-date">${echapper(date)}</div>` : ''}
    </div>
  </div>`;

/* ==========================================================================
   3. La conversation
   ========================================================================== */

export const messageHtml = (m, options = {}) => {
  const de = m.de || {};
  const equipe = de.cote === 'equipe';
  const moi = options.moi && de.uid === options.moi;
  const classes = ['message'];
  if (equipe) classes.push('message--equipe');
  /* Une conversation se lit comme une conversation : mes messages d'un
     côté, ceux d'en face de l'autre. */
  if (moi) classes.push('message--moi');
  if (m.interne) classes.push('message--interne');
  /* Un message supprimé reste à sa place, vidé : « Message supprimé ».
     Un message modifié le dit, à côté de l'heure. `options.avant` (la
     citation d'une réponse) et `options.apres` (les réactions) se posent
     dans la colonne du message, alignés avec lui. */
  const supprime = Boolean(m.supprime);
  if (supprime) classes.push('message--supprime');
  const pieces = !supprime && Array.isArray(m.pieces) && m.pieces.length
    ? `<div class="pieces">${m.pieces.map((p) => pieceHtml(p)).join('')}</div>` : '';
  const corps = supprime
    ? '<p class="message-supprime">Message supprimé</p>'
    : (String(m.texte || '').trim() ? `<div class="message-corps">${avecLiens(m.texte || '')}</div>` : '');
  return `<article class="${classes.join(' ')}" data-id="${echapper(m.id || '')}">
    ${avatar(de.nom || (equipe ? 'Capmedia' : 'Client'), { equipe })}
    <div>
      <div class="message-tete">
        <span class="message-auteur">${echapper(de.nom || (equipe ? 'Capmedia' : 'Vous'))}${moi ? ' <span class="t-3">(vous)</span>' : ''}</span>
        <span class="message-date">${echapper(depuis(m.date))}</span>
        ${m.modifie && !supprime ? '<span class="message-modifie">modifié</span>' : ''}
        ${m.interne ? '<span class="marque-interne">Note interne</span>' : ''}
      </div>
      ${supprime ? '' : (options.avant || '')}
      ${corps}
      ${pieces}
      ${supprime ? '' : (options.apres || '')}
    </div>
  </article>`;
};

/* ==========================================================================
   4. Les fichiers
   ========================================================================== */

const genreFichier = (type = '', nom = '') => {
  if (/^image\//.test(type)) return { classe: 'image', court: 'IMG' };
  if (/pdf/.test(type)) return { classe: 'pdf', court: 'PDF' };
  if (/^video\//.test(type)) return { classe: 'image', court: 'VID' };
  const ext = (nom.split('.').pop() || '').slice(0, 4);
  return { classe: '', court: ext.toUpperCase() || 'DOC' };
};

/* Une image ou un PDF se regarde : la pièce d'un message s'ouvre dans un
   onglet. Tout autre fichier se télécharge sous son nom. */
const seRegarde = (g) => g.classe === 'image' || g.classe === 'pdf';

/* Les images d'une conversation se voient en vignette, pas en nom de
   fichier. L'adresse lue une fois est gardée pour la session : un redessin
   remet la même image tout de suite, sans la recharger ni clignoter. */
const vignettes = new Map();
const chargerVignette = (chemin) => {
  if (!vignettes.has(chemin)) {
    const promesse = (estPieceMessage(chemin)
      ? lirePieceMessage(chemin).then((blob) => URL.createObjectURL(blob))
      : lienPiece({ chemin }))
      .then((url) => { vignettes.set(chemin, url); return url; })
      .catch((e) => { vignettes.delete(chemin); throw e; });
    vignettes.set(chemin, promesse);
  }
  return Promise.resolve(vignettes.get(chemin));
};
const adresseConnue = (chemin) => { const v = vignettes.get(chemin); return typeof v === 'string' ? v : ''; };

export const pieceHtml = (p) => {
  const g = genreFichier(p.type, p.nom);
  if (g.classe === 'image' && p.chemin) {
    const src = adresseConnue(p.chemin);
    return `<a class="piece piece--vignette" href="#" data-agrandir-piece="${echapper(p.chemin)}" data-nom="${echapper(p.nom || '')}" title="${echapper(p.nom || '')}" aria-label="${echapper(`Agrandir ${p.nom || 'l\'image'}`)}">
      <img alt="${echapper(p.nom || '')}" data-vignette="${echapper(p.chemin)}"${src ? ` src="${echapper(src)}"` : ''} decoding="async">
      <span class="piece-vignette-pied"><span class="nom">${echapper(p.nom)}</span><span class="t-3">${echapper(poids(p.taille))}</span></span>
    </a>`;
  }
  const geste = seRegarde(g) ? 'data-ouvrir-piece' : 'data-piece';
  return `<a class="piece" href="#" ${geste}="${echapper(p.chemin)}" data-nom="${echapper(p.nom || '')}" title="${echapper(p.nom)}">${icone(g.classe === 'image' ? 'image' : 'file')}<span class="nom">${echapper(p.nom)}</span><span class="t-3">${echapper(poids(p.taille))}</span></a>`;
};

/**
 * La carte d'un fichier. `options.moi` (uid) fait dire « Déposé par vous »
 * sur ses propres dépôts ; `options.menu` pose le menu de l'équipe ;
 * `options.retirer` pose le menu sur ses propres dépôts seulement, pour
 * que le client retire ce qu'il a lui-même envoyé.
 */
export const fichierHtml = (f, options = {}) => {
  const g = genreFichier(f.type, f.nom);
  const mien = Boolean(options.moi && f.par && f.par.uid === options.moi);
  const qui = mien ? 'Déposé par vous' : (f.par && f.par.nom);
  const avecMenu = options.menu || (options.retirer && mien);
  return `<div class="fichier" data-id="${echapper(f.id || '')}">
    <span class="fichier-icone${g.classe ? ` fichier-icone--${g.classe}` : ''}">${echapper(g.court)}</span>
    <div style="min-width:0">
      <p class="fichier-nom">${echapper(f.nom)}${f.version ? ` <span class="etiquette" style="vertical-align:middle">${echapper(String(f.version))}</span>` : ''}</p>
      <p class="fichier-sous">${echapper([f.categorieLibelle, poids(f.taille), qui, depuis(f.cree || f.date)].filter(Boolean).join(' · '))}</p>
    </div>
    <div class="rang" style="gap:4px">
      ${seRegarde(g) ? `<button class="btn-icone" type="button" data-ouvrir-piece="${echapper(f.chemin)}" data-astuce="Ouvrir" aria-label="Ouvrir dans un nouvel onglet">${icone('externe')}</button>` : ''}
      <button class="btn-icone" type="button" data-piece="${echapper(f.chemin)}" data-nom="${echapper(f.nom || '')}" data-astuce="Télécharger" aria-label="Télécharger">${icone('telecharger')}</button>
      ${avecMenu ? `<button class="btn-icone" type="button" data-menu-fichier="${echapper(f.id || '')}" aria-label="Plus d'actions">${icone('points')}</button>` : ''}
    </div>
  </div>`;
};

/* Télécharger, c'est poser le fichier sous son nom dans les
   téléchargements : le lien signé est lu en mémoire, puis remis par un
   <a download>. Si le navigateur refuse la lecture (un réseau qui coupe,
   un bucket sans CORS), le lien s'ouvre dans un onglet plutôt que rien. */
const poserTelechargement = (blob, nom) => {
  const adresse = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = adresse; a.download = nom || 'fichier';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 60000);
};

const telechargerPiece = async (chemin, nom) => {
  /* Une pièce de conversation arrive par le serveur, jamais par un lien
     du stockage (noyau.js, lirePieceMessage). */
  if (estPieceMessage(chemin)) {
    poserTelechargement(await lirePieceMessage(chemin), nom || String(chemin).split('/').pop());
    return;
  }
  const url = await lienPiece({ chemin });
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    const adresse = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = adresse; a.download = nom || String(chemin).split('/').pop() || 'fichier';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(adresse), 60000);
  } catch (e) {
    window.open(url, '_blank', 'noopener');
  }
};

/**
 * Branche les gestes sur les pièces : [data-piece] télécharge sous le nom
 * porté par data-nom, [data-ouvrir-piece] ouvre dans un nouvel onglet.
 */
export const brancherPieces = (racine) => {
  /* La zone des vues est la même d'une page à l'autre : brancher à chaque
     montage empilait les écouteurs, et un clic ouvrait plusieurs onglets. */
  if (racine.__piecesBranchees) return;
  racine.__piecesBranchees = true;
  /* Les vignettes qui arrivent dans la zone se remplissent seules. */
  const remplir = () => racine.querySelectorAll('img[data-vignette]:not([src])').forEach((img) => {
    if (img.__enCours) return;
    img.__enCours = true;
    chargerVignette(img.dataset.vignette)
      .then((url) => { img.src = url; })
      .catch(() => { const a = img.closest('.piece--vignette'); if (a) a.classList.add('piece--vignette-ko'); });
  });
  new MutationObserver(remplir).observe(racine, { childList: true, subtree: true });
  remplir();
  racine.addEventListener('click', async (ev) => {
    const grande = ev.target.closest('[data-agrandir-piece]');
    if (grande) {
      ev.preventDefault();
      const chemin = grande.dataset.agrandirPiece;
      const nom = grande.dataset.nom || '';
      try {
        const url = await chargerVignette(chemin);
        const m = modale({ titre: nom || 'Image', large: true,
          corps: `<img class="piece-agrandie" src="${echapper(url)}" alt="${echapper(nom)}">`,
          pied: `<button class="btn btn-secondaire" type="button" data-piece="${echapper(chemin)}" data-nom="${echapper(nom)}">${icone('telecharger')} Télécharger</button>` });
        brancherPieces(m.el);
      } catch (e) {
        toast("Cette image n'est pas accessible.", 'erreur');
      }
      return;
    }
    const cible = ev.target.closest('[data-piece], [data-ouvrir-piece]');
    if (!cible) return;
    ev.preventDefault();
    /* Une pièce de conversation s'ouvre depuis son contenu, lu par le
       serveur : l'onglet est réservé tout de suite, pendant le clic, pour
       que le navigateur ne le prenne pas pour une fenêtre surgissante. */
    const ouvrirMessage = cible.dataset.ouvrirPiece && estPieceMessage(cible.dataset.ouvrirPiece);
    const onglet = ouvrirMessage ? window.open('', '_blank') : null;
    try {
      if (ouvrirMessage) {
        const blob = await lirePieceMessage(cible.dataset.ouvrirPiece);
        /* Seuls un PDF et une image matricielle s'ouvrent dans un onglet, et
           sous un type recréé ici : un SVG ou un HTML déguisé ouvert en
           blob: aurait l'origine du Hub. Tout le reste se télécharge. */
        const sur = /^(application\/pdf|image\/(png|jpeg|gif|webp|heic|heif))$/.test(blob.type);
        if (sur && onglet && !onglet.closed) {
          onglet.opener = null;
          onglet.location.href = URL.createObjectURL(new Blob([blob], { type: blob.type }));
        } else {
          if (onglet && !onglet.closed) { try { onglet.close(); } catch (err) { /* déjà fermé */ } }
          poserTelechargement(blob, cible.dataset.nom || String(cible.dataset.ouvrirPiece).split('/').pop());
        }
      } else if (cible.dataset.ouvrirPiece) {
        const url = await lienPiece({ chemin: cible.dataset.ouvrirPiece });
        window.open(url, '_blank', 'noopener');
      } else {
        await telechargerPiece(cible.dataset.piece, cible.dataset.nom);
      }
    } catch (e) {
      if (onglet) { try { onglet.close(); } catch (err) { /* déjà fermé */ } }
      /* Nos phrases (serveur, session) se montrent ; un texte technique, jamais. */
      const m = (e && e.message) || '';
      toast(m && !/firebase|storage\//i.test(m) && m.length < 260 ? m : "Ce fichier n'est pas accessible.", 'erreur');
    }
  });
};

/* Un envoi refusé se dit en français, jamais avec le texte brut de
   Firebase (« Firebase Storage: User does not have permission... »). */
const phraseEnvoi = (e, nom) => {
  const code = String((e && e.code) || '');
  if (code === 'storage/unauthorized') return `« ${nom} » n'a pas pu être joint : vous n'avez pas accès à ce dossier.`;
  if (code === 'storage/canceled') return 'Envoi annulé.';
  if (code === 'storage/quota-exceeded') return "L'espace de stockage est plein. Prévenez-nous.";
  if (code.startsWith('storage/')) return `« ${nom} » n'a pas pu être envoyé. Réessayez dans un instant.`;
  const m = (e && e.message) || '';
  return m && !/firebase/i.test(m) && m.length < 260 ? m : `« ${nom} » n'a pas pu être envoyé. Réessayez dans un instant.`;
};

/**
 * Un dépôt de fichiers : glisser-déposer, sélection, envoi avec progression,
 * retrait. `chemin` est le dossier de stockage. Renvoie l'état des pièces.
 */
/* L'aide et l'attribut « accept » viennent de la même liste (noyau.js,
   FORMATS_ACCEPTES) : le texte dit vrai, et le sélecteur du navigateur ne
   propose que ce qui passera, au lieu de refuser après le choix. */
export const depot = (zone, { chemin, metadonnees = null, max = 10, texte = 'Déposez vos fichiers ici, ou <strong>choisissez-les</strong>.', aide = FORMATS_ACCEPTES.aide, compact = false, cible = null } = {}) => {
  const etat = { pieces: [], enCours: 0 };
  zone.innerHTML = `
    <label class="depot${compact ? ' depot--compact' : ''}">
      <span>${texte}</span><br><span class="t-micro t-3">${echapper(aide)}</span>
      <input type="file" multiple accept="${echapper(FORMATS_ACCEPTES.accept)}">
    </label>
    <div class="pieces" aria-live="polite"></div>`;
  const entree = $('input', zone);
  const liste = $('.pieces', zone);
  const label = $('.depot', zone);

  const rendre = () => {
    liste.innerHTML = etat.pieces.map((p, i) => p.envoi
      ? `<span class="piece piece--envoi" style="--p:${p.progres || 0}%">${icone('file')}<span class="nom">${echapper(p.nom)}</span><span class="t-3">${p.progres || 0}%</span></span>`
      : `<span class="piece">${icone(/^image\//.test(p.type) ? 'image' : 'file')}<span class="nom">${echapper(p.nom)}</span><span class="t-3">${echapper(poids(p.taille))}</span><button type="button" data-retirer="${i}" aria-label="Retirer">${icone('fermer')}</button></span>`)
      .join('');
  };

  const ajouter = async (fichiers) => {
    for (const f of Array.from(fichiers)) {
      if (etat.pieces.length >= max) { toast(`${max} fichiers au maximum.`, 'erreur'); break; }
      const provisoire = { nom: f.name, type: f.type, taille: f.size, envoi: true, progres: 0 };
      etat.pieces.push(provisoire);
      etat.enCours += 1;
      rendre();
      try {
        /* `chemin` peut être une fonction : un fichier de projet se range
           sous l'identifiant de sa future fiche, tiré pour lui seul. Les
           métadonnées aussi : la marque « interne » se lit au moment de
           l'envoi (note interne ou réponse au client). */
        const dossier = typeof chemin === 'function' ? chemin(f) : chemin;
        const marques = typeof metadonnees === 'function' ? metadonnees(f) : metadonnees;
        const fiche = await envoyerPiece(f, dossier, (p) => { provisoire.progres = p; rendre(); }, marques);
        Object.assign(provisoire, fiche, { envoi: false });
      } catch (e) {
        etat.pieces = etat.pieces.filter((p) => p !== provisoire);
        toast(phraseEnvoi(e, f.name), 'erreur');
      } finally {
        etat.enCours -= 1;
        rendre();
      }
    }
  };

  entree.addEventListener('change', () => { ajouter(entree.files); entree.value = ''; });
  /* La zone de dépôt peut être toute une boîte, pas seulement l'étiquette :
     dans une bulle de discussion, on lâche le fichier n'importe où. */
  const accueil = cible || label;
  ['dragenter', 'dragover'].forEach((n) => accueil.addEventListener(n, (e) => { e.preventDefault(); accueil.classList.add('survole'); }));
  ['dragleave', 'drop'].forEach((n) => accueil.addEventListener(n, (e) => { e.preventDefault(); accueil.classList.remove('survole'); }));
  accueil.addEventListener('drop', (e) => ajouter(e.dataTransfer.files));
  liste.addEventListener('click', (e) => {
    const b = e.target.closest('[data-retirer]');
    if (!b) return;
    etat.pieces.splice(Number(b.dataset.retirer), 1);
    rendre();
  });

  return {
    get pieces() { return etat.pieces.filter((p) => !p.envoi).map(({ nom, chemin: c, taille, type }) => ({ nom, chemin: c, taille, type })); },
    get occupe() { return etat.enCours > 0; },
    vider() { etat.pieces = []; rendre(); },
  };
};

/* ==========================================================================
   5. Les surfaces flottantes
   ========================================================================== */

let piles = [];

/* Échap ferme la dernière modale, sauf celle qui ne se ferme pas (la fiche
   du testeur à sa première connexion) : le clavier ne contourne pas ce que
   la souris ne peut pas faire. */
const fermerDerniere = () => {
  const d = piles[piles.length - 1];
  if (d && d.fermable !== false) d.fermer();
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fermerDerniere();
});

/* Une feuille ouverte par une adresse (« #/finances/D-2026-014 ») restait
   posée sur l'écran suivant : le routeur démonte la vue, pas ce qui flotte
   au-dessus d'elle. On ferme donc tout ce qui flotte au changement
   d'adresse, et le menu contextuel avec.

   Une modale de confirmation ouverte PENDANT une navigation n'existe pas :
   la navigation est un geste, la confirmation en est un autre. */
export const fermerFlottants = () => {
  piles.splice(0).reverse().forEach((p) => { try { p.fermer(); } catch (e) { /* déjà partie */ } });
  document.querySelectorAll('.menu').forEach((m) => m.remove());
};

/**
 * Une modale ou une feuille latérale. Renvoie { el, corps, fermer, fin }.
 * `fin` est une promesse résolue à la fermeture avec la valeur passée.
 */
export const modale = ({ titre, sousTitre = '', corps = '', pied = '', large = false, feuille = false, scenario = false, fermable = true }) => {
  const voile = document.createElement('div');
  /* « scenario » : la fiche d'un scénario de test, la même dans les trois
     espaces. Une modale entière au centre, qui arrive et repart avec une
     transition (suite.css, section 20), jamais une feuille latérale. */
  voile.className = `voile${feuille ? ' voile--feuille' : ''}${scenario ? ' voile--scenario' : ''}`;
  voile.setAttribute('role', 'dialog');
  voile.setAttribute('aria-modal', 'true');
  voile.setAttribute('aria-label', titre);
  voile.innerHTML = `
    <div class="${feuille ? 'feuille' : `modale${large ? ' modale--large' : ''}${scenario ? ' modale--scenario' : ''}`}">
      <div class="modale-tete">
        <div><h2>${echapper(titre)}</h2>${sousTitre ? `<p>${echapper(sousTitre)}</p>` : ''}</div>
        ${fermable ? `<button class="btn-icone" type="button" data-fermer aria-label="Fermer">${icone('fermer')}</button>` : ''}
      </div>
      <div class="modale-corps">${corps}</div>
      ${pied ? `<div class="modale-pied">${pied}</div>` : ''}
    </div>`;
  document.body.appendChild(voile);
  document.body.style.overflow = 'hidden';

  let resoudre;
  const fin = new Promise((r) => { resoudre = r; });
  let fermee = false;
  const fermer = (valeur) => {
    if (!voile.isConnected || fermee) return;
    fermee = true;
    piles = piles.filter((p) => p.voile !== voile);
    if (!piles.length) document.body.style.overflow = '';
    /* La fiche d'un scénario repart comme elle est venue ; le temps de la
       sortie, elle ne répond plus. */
    const animee = scenario && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animee) { voile.classList.add('sort'); voile.style.pointerEvents = 'none'; setTimeout(() => voile.remove(), 280); }
    else voile.remove();
    resoudre(valeur);
  };
  const entree = { voile, fermer, fermable };
  piles.push(entree);

  voile.addEventListener('click', (e) => {
    if (fermable && (e.target === voile || e.target.closest('[data-fermer]'))) fermer(undefined);
  });
  /* Le premier élément atteint par le clavier ne doit jamais être une
     action destructrice : une fiche s'ouvrait avec « Supprimer » déjà
     sous la main, et une touche Entrée suffisait. */
  const premier = $('input, select, textarea, button:not([data-fermer]):not([data-suppr]):not(.btn-danger)', voile);
  if (premier) setTimeout(() => premier.focus(), 30);

  return { el: voile, corps: $('.modale-corps', voile), pied: $('.modale-pied', voile), fermer, fin };
};

/** Une confirmation. Résout true ou false. */
export const confirmer = ({ titre, texte = '', ok = 'Confirmer', annuler = 'Annuler', danger = false }) => {
  const m = modale({
    titre,
    corps: texte ? `<p class="t-corps t-2">${echapper(texte)}</p>` : '',
    pied: `<button class="btn btn-secondaire" type="button" data-non>${echapper(annuler)}</button>
           <button class="btn ${danger ? 'btn-danger' : 'btn-principal'}" type="button" data-oui>${echapper(ok)}</button>`,
  });
  $('[data-non]', m.el).addEventListener('click', () => m.fermer(false));
  $('[data-oui]', m.el).addEventListener('click', () => m.fermer(true));
  return m.fin.then((v) => v === true);
};

/** Un menu contextuel ancré sous un élément. `items` : [{libelle, icone, action, danger, titre}]. */
export const menu = (ancre, items) => {
  $$('.menu').forEach((m) => m.remove());
  const boite = document.createElement('div');
  boite.className = 'menu';
  boite.setAttribute('role', 'menu');
  boite.innerHTML = items.map((it) => {
    if (it === '-') return '<hr>';
    if (it.titre) return `<div class="titre">${echapper(it.titre)}</div>`;
    return `<button type="button" role="menuitem" class="${it.danger ? 'danger' : ''}" data-cle="${echapper(it.cle || it.libelle)}">${it.icone ? icone(it.icone) : ''}${echapper(it.libelle)}</button>`;
  }).join('');
  document.body.appendChild(boite);

  const r = ancre.getBoundingClientRect();
  const largeur = boite.offsetWidth;
  const hauteur = boite.offsetHeight;
  let gauche = r.right - largeur;
  if (gauche < 8) gauche = 8;
  let haut = r.bottom + 6;
  if (haut + hauteur > window.innerHeight - 8) haut = r.top - hauteur - 6;
  boite.style.left = `${Math.round(gauche)}px`;
  boite.style.top = `${Math.round(Math.max(8, haut))}px`;

  const fermer = () => { boite.remove(); document.removeEventListener('click', horsClic, true); };
  const horsClic = (e) => { if (!boite.contains(e.target)) fermer(); };
  setTimeout(() => document.addEventListener('click', horsClic, true), 0);

  boite.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cle]');
    if (!b) return;
    const it = items.find((x) => x && (x.cle || x.libelle) === b.dataset.cle);
    fermer();
    if (it && it.action) it.action();
  });
  return fermer;
};

/** Le toast : court, en bas, disparaît seul. */
export const toast = (texte, genre = 'ok', options = 4200) => {
  /* Troisième argument : une durée, ou bien un geste proposé dans le toast
     (« Répondre »), utile quand le message vient d'arriver ailleurs. */
  const duree = typeof options === 'number' ? options : (options.duree || 6000);
  const geste = typeof options === 'object' && options.libelle ? options : null;
  let zone = $('.toasts');
  if (!zone) {
    zone = document.createElement('div');
    zone.className = 'toasts';
    zone.setAttribute('aria-live', 'polite');
    document.body.appendChild(zone);
  }
  const t = document.createElement('div');
  t.className = `toast toast--${genre}`;
  t.setAttribute('role', 'status');
  t.innerHTML = `${icone(genre === 'erreur' ? 'alerte' : genre === 'info' ? 'messages' : 'check')}<span>${echapper(texte)}</span>${geste ? `<button class="toast-geste" type="button">${echapper(geste.libelle)}</button>` : ''}<button type="button" aria-label="Fermer">${icone('fermer')}</button>`;
  zone.appendChild(t);
  const retirer = () => t.remove();
  if (geste) $('.toast-geste', t).addEventListener('click', () => { retirer(); geste.action(); });
  t.querySelector('button[aria-label="Fermer"]').addEventListener('click', retirer);
  setTimeout(retirer, duree);
};

/* ==========================================================================
   5 bis. Les info-bulles

   Elles vivaient en pseudo-élément, donc prisonnières de leur conteneur :
   tronquées par une barre qui défile, coupées par un panneau arrondi, et
   pire, elles élargissaient la zone défilante d'un fil de discussion.

   Une seule bulle, posée sur le corps de la page, en position fixe. Elle
   se place au-dessus de son bouton, bascule dessous s'il n'y a pas la
   place, et reste toujours dans l'écran.
   ========================================================================== */

const brancherAstuces = () => {
  if (typeof document === 'undefined' || document.__astuces) return;
  document.__astuces = true;
  const bulle = document.createElement('div');
  bulle.className = 'astuce';
  bulle.setAttribute('role', 'tooltip');
  bulle.hidden = true;
  document.body.appendChild(bulle);

  let ancre = null;
  let minuteur = null;

  const cacher = () => {
    clearTimeout(minuteur);
    ancre = null;
    bulle.hidden = true;
    bulle.classList.remove('visible', 'astuce--dessous');
  };

  const placer = () => {
    if (!ancre || !ancre.isConnected) { cacher(); return; }
    const r = ancre.getBoundingClientRect();
    const b = bulle.getBoundingClientRect();
    const marge = 8;
    const dessous = r.top - b.height - 10 < marge;
    let x = r.left + r.width / 2 - b.width / 2;
    x = Math.max(marge, Math.min(x, window.innerWidth - b.width - marge));
    const y = dessous ? r.bottom + 8 : r.top - b.height - 8;
    bulle.style.left = `${Math.round(x)}px`;
    bulle.style.top = `${Math.round(y)}px`;
    bulle.classList.toggle('astuce--dessous', dessous);
  };

  const montrer = (el, tout_de_suite) => {
    const texte = el.getAttribute('data-astuce');
    if (!texte) return;
    ancre = el;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      if (ancre !== el || !el.isConnected) return;
      bulle.textContent = texte;
      bulle.hidden = false;
      bulle.style.left = '-9999px';
      placer();
      bulle.classList.add('visible');
    }, tout_de_suite ? 0 : 320);
  };

  /* Au doigt, pas d'info-bulle : le geste sert à agir, pas à survoler. */
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest && e.target.closest('[data-astuce]');
    if (!el) return;
    montrer(el, false);
  });
  /* Passer du bouton à l'icône qu'il contient déclenche un pointerout :
     on ne referme que si le curseur quitte vraiment le bouton. */
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest && e.target.closest('[data-astuce]');
    if (!el || el !== ancre) return;
    const vers = e.relatedTarget;
    if (vers && vers.nodeType === 1 && el.contains(vers)) return;
    cacher();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('[data-astuce]');
    if (el) montrer(el, true);
  });
  document.addEventListener('focusout', cacher);
  document.addEventListener('pointerdown', cacher);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cacher(); });
  window.addEventListener('scroll', cacher, true);
  window.addEventListener('resize', cacher);
};

brancherAstuces();

/* ==========================================================================
   6. Les formulaires
   ========================================================================== */

/** Les valeurs d'un formulaire, en objet. Les cases à cocher donnent true/false. */
export const lireForme = (forme) => {
  const donnees = {};
  for (const el of forme.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) donnees[el.name] = el.value; continue; }
    if (el.type === 'checkbox') {
      // Plusieurs cases sous le même nom forment une liste de valeurs ; une
      // case seule reste un oui ou un non.
      if (forme.querySelectorAll(`[type="checkbox"][name="${CSS.escape(el.name)}"]`).length > 1) {
        if (!Array.isArray(donnees[el.name])) donnees[el.name] = [];
        if (el.checked) donnees[el.name].push(el.value);
      } else donnees[el.name] = el.checked;
      continue;
    }
    else if (el.type === 'number') donnees[el.name] = el.value === '' ? null : Number(el.value);
    else if (el.multiple && el.tagName === 'SELECT') donnees[el.name] = Array.from(el.selectedOptions).map((o) => o.value);
    else donnees[el.name] = el.value.trim();
  }
  return donnees;
};

/**
 * Vérifie un formulaire contre des règles { champ: (valeur, donnees) => message | '' }.
 * Marque les champs fautifs et renvoie true si tout est bon.
 */
export const valider = (forme, regles) => {
  const donnees = lireForme(forme);
  let premier = null;
  $$('.erreur-champ', forme).forEach((e) => e.remove());
  $$('[aria-invalid]', forme).forEach((e) => e.removeAttribute('aria-invalid'));
  for (const [nom, regle] of Object.entries(regles)) {
    const el = forme.elements[nom];
    if (!el) continue;
    const message = regle(donnees[nom], donnees);
    if (!message) continue;
    el.setAttribute('aria-invalid', 'true');
    const note = document.createElement('p');
    note.className = 'erreur-champ';
    note.textContent = message;
    (el.closest('.groupe') || el.parentElement).appendChild(note);
    if (!premier) premier = el;
  }
  if (premier) premier.focus();
  return !premier;
};

export const obligatoire = (message = 'Ce champ est obligatoire.') => (v) => (v === '' || v === null || v === undefined ? message : '');
export const longueurMax = (n) => (v) => (typeof v === 'string' && v.length > n ? `${n} caractères au maximum.` : '');
export const emailValide = () => (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? 'Cette adresse a l\'air incomplète.' : '');
export const urlValide = () => (v) => (v && !/^https?:\/\/\S+$/.test(v) ? 'Une adresse commence par http:// ou https://.' : '');

/** Exécute une promesse en tenant un bouton occupé. Renvoie true si elle a réussi. */
export const agir = async (bouton, promesse, messageOk = '') => {
  if (bouton) { bouton.classList.add('btn-charge'); bouton.disabled = true; }
  try {
    await promesse();
    if (messageOk) toast(messageOk);
    return true;
  } catch (e) {
    console.error(e);
    toast(lisible(e), 'erreur');
    return false;
  } finally {
    if (bouton) { bouton.classList.remove('btn-charge'); bouton.disabled = false; }
  }
};

/** Un message d'erreur qu'un humain comprend, jamais « Error 500 ». */
export const lisible = (e) => {
  const code = (e && e.code) || '';
  if (code === 'permission-denied') return "Vous n'avez pas le droit de faire cela.";
  if (code === 'unavailable' || code === 'auth/network-request-failed') return 'La connexion au réseau a échoué. Réessayez dans un instant.';
  if (code === 'not-found') return 'Cet élément n\'existe plus.';
  if (code === 'storage/unauthorized') return "Ce fichier n'est pas accessible.";
  if (code === 'storage/canceled') return 'Envoi annulé.';
  const m = (e && e.message) || '';
  if (/injoignable/.test(m)) return m;
  /* Les refus du serveur sont écrits pour être lus : on les montre tels
     quels (« C'est le dernier administrateur actif... »). */
  if (m && m.length < 260 && !/^Firebase/.test(m)) return m;
  return "Quelque chose n'a pas fonctionné. Réessayez, et prévenez-nous si cela continue.";
};

/** Délégation d'événements : `sur(racine, 'click', '[data-action]', (el, ev) => ...)`. */
export const sur = (racine, type, selecteur, gestion) => {
  const ecoute = (ev) => {
    const el = ev.target.closest(selecteur);
    if (el && racine.contains(el)) gestion(el, ev);
  };
  racine.addEventListener(type, ecoute);
  return () => racine.removeEventListener(type, ecoute);
};

/** Copie un texte, et le dit. */
export const copier = async (texte) => {
  try { await navigator.clipboard.writeText(texte); toast('Copié.'); }
  catch (e) { toast('Impossible de copier.', 'erreur'); }
};

/** Un titre de page pour l'onglet du navigateur. */
export const titrePage = (texte) => { document.title = `${texte} · Capmedia`; };

/* Une barre d'onglets qui déborde sur téléphone : l'onglet actif est
   ramené en vue, et l'enveloppe signale qu'il en reste à droite. */
export const reglerBarreOnglets = (barre) => {
  if (!barre) return;
  const enveloppe = barre.parentElement;
  const jauger = () => enveloppe.classList.toggle('deborde', barre.scrollWidth - barre.clientWidth - barre.scrollLeft > 8);
  const actif = barre.querySelector('.onglet.actif');
  if (actif) {
    const g = actif.offsetLeft;
    const d = g + actif.offsetWidth;
    if (g < barre.scrollLeft + 8 || d > barre.scrollLeft + barre.clientWidth - 8) {
      barre.scrollTo({ left: Math.max(0, g - 24), behavior: 'smooth' });
    }
  }
  barre.addEventListener('scroll', jauger, { passive: true });
  jauger();
};

/** Défilement doux vers un élément, s'il existe. */
export const defilerVers = (sel) => { const el = $(sel); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
