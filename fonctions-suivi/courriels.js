/* ==========================================================================
   ESPACE DE SUIVI CLIENT · les gabarits d'e-mail
   Contrat : docs/suivi.md, section 6.

   Un seul gabarit, au dessin de la suite Capmedia : la marque (logo,
   mot, badge du service, trait), une carte blanche à coins arrondis sur
   fond doux, le projet de la lettre en tête (son logo, ses initiales
   sinon), des blocs à fond doux, un bouton en pilule.

   Tout est en ligne : les clients de messagerie jettent les feuilles de
   style externes, et beaucoup jettent aussi les balises <style>. Donc
   chaque couleur, chaque marge est portée par un attribut « style ». La
   seule feuille de la lettre (FEUILLE) ajoute le mode sombre et la mise
   en page du téléphone : une messagerie qui l'ignore garde la lettre
   claire, entière.

   Les couleurs viennent de agence/suivi/assets/css/suite.css, en dur ici
   parce qu'un e-mail ne sait pas lire une variable CSS. Elles sont
   regroupées dans TEINTES et SOMBRE : le seul endroit à corriger si la
   suite change. Les images sont des PNG publiés avec le site (IMAGES) :
   Gmail et Outlook n'affichent pas le SVG.

   Chaque modèle renvoie { objet, html, texte }. Toujours les deux corps :
   un client de messagerie en mode texte doit rester lisible.
   ========================================================================== */

/* --- Les couleurs de la suite (Capmedia Desk), figées pour la messagerie --
   Celles de agence/suivi/assets/css/suite.css, en opaque : le rgba passe
   mal partout. SOMBRE double chaque teinte pour les messageries qui
   suivent le mode sombre (Apple Mail, iOS, Outlook.com). */
const TEINTES = {
  page: '#F5F5F7',      // --page, le fond autour de la lettre
  lettre: '#FFFFFF',    // --blanc, la carte
  panneau: '#F5F5F7',   // le fond d'un bloc dans la carte (faits, citation)
  texte: '#1D1D1F',     // --encre
  texte2: '#424245',    // le corps de la lettre
  texte3: '#86868B',    // --encre-3, libellés, notes, pied
  trait: '#E8E8ED',     // --trait-clair, les filets
  action: '#0075DE',    // le bleu du Hub, réservé au bouton et aux liens
  badge: '#E5F1FC',     // le fond du badge du service
  initiale: '#6E6E73',  // --encre-2, les initiales d'un projet sans logo
};
const SOMBRE = {
  page: '#111113', lettre: '#1C1C1E', panneau: '#2C2C2E',
  texte: '#F5F5F7', texte2: '#D1D1D6', texte3: '#98989D', trait: '#3A3A3C',
  lien: '#409CFF', badge: '#13314F', initiale: '#C7C7CC',
};

const POLICE = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const POLICE_TITRE = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const POLICE_MONO = "'SF Mono', ui-monospace, Menlo, Consolas, 'Courier New', monospace";
const LARGEUR = 600;

const SITE = 'https://capmedia.app';
const BASE = `${SITE}/suivi/`;
const SIGNATURE = 'Capmedia Digital';
/* Les images de la lettre : des PNG publiés avec le site (agence/assets/
   img/courriel, produits par outils/generer-images-courriel.mjs). */
const IMAGES = `${SITE}/assets/img/courriel/`;

/* Les lettres aux testeurs portent la marque de leur espace, Capmedia Test :
   un testeur n'a pas de projet chez nous, il a une mission de test.
   « service » : le badge bleu qui accompagne toujours la marque. */
const MARQUE_TEST = { signature: 'Capmedia Test', pied: 'Cet e-mail vous est adressé au titre de votre mission de test.', service: 'Test' };

/* Les lettres à l'équipe : même en-tête, mais un pied qui ne parle pas de
   « votre projet » (elles ne vont pas à un client). */
const MARQUE_EQUIPE = { signature: SIGNATURE, pied: "Cet e-mail est réservé à l'équipe Capmedia.", service: 'Cockpit' };

/* --- Les liens directs, une seule source ------------------------------- */
const lienEspace = () => BASE;
const lienTicket = (ticketId) => `${BASE}ticket?t=${encodeURIComponent(String(ticketId || ''))}`;
const lienProjet = (projetId) => `${BASE}projet?p=${encodeURIComponent(String(projetId || ''))}`;

/* ==========================================================================
   1. Les garde-fous de valeur
   ========================================================================== */

/**
 * Ramène n'importe quelle valeur à du texte présentable. Un objet ou un
 * indéfini deviennent une chaîne vide : personne ne doit lire « undefined »
 * ni « [object Object] » dans un e-mail signé de l'agence.
 */
function valeurTexte(valeur) {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'object') return '';
  if (typeof valeur === 'number' && !Number.isFinite(valeur)) return '';
  return String(valeur);
}

/**
 * Échappe avant toute insertion dans le HTML. Aucune exception, pas même
 * pour un champ « sûr » : le titre d'un ticket est saisi par un client, et
 * un e-mail d'agence ne doit jamais devenir un vecteur d'injection.
 */
function echapper(valeur) {
  return valeurTexte(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texte libre rendu avec ses retours à la ligne, sans HTML injecté. */
function enParagraphes(texteLibre, style, classe = '') {
  const blocs = echapper(texteLibre).split(/\n{2,}/).filter((b) => b.trim());
  if (!blocs.length) return '';
  return blocs
    .map((bloc) => `<p${classe ? ` class="${classe}"` : ''} style="${style}">${bloc.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Coupe un texte long pour l'aperçu d'un e-mail, sans couper un mot. */
function extrait(texteLibre, maximum = 600) {
  const brut = valeurTexte(texteLibre).trim();
  if (brut.length <= maximum) return brut;
  const coupe = brut.slice(0, maximum);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > maximum * 0.6 ? coupe.slice(0, espace) : coupe).trim()}…`;
}

/** Une date Firestore, une Date, ou une chaîne : vers « 14 mars 2026 ». */
function dateFr(valeur) {
  const date = enDate(valeur);
  if (!date) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function enDate(valeur) {
  if (!valeur) return null;
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? null : valeur;
  if (typeof valeur.toDate === 'function') {
    try { return enDate(valeur.toDate()); } catch (e) { return null; }
  }
  if (typeof valeur === 'object') {
    const secondes = valeur.seconds ?? valeur._seconds;
    return typeof secondes === 'number' ? new Date(secondes * 1000) : null;
  }
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* --- Les montants ------------------------------------------------------- */

/** Un montant en euros, seul : « 2 875,00 € ». Une valeur absente ne
 *  s'affiche pas. Jamais « EUR » : le symbole, comme sur les pièces. */
function euros(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return '';
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return '';
  return `${nombre.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ')} €`;
}

/** Un montant hors taxes : « 1 234,56 € HT ». */
function montantHT(valeur) {
  const e = euros(valeur);
  return e ? `${e} HT` : '';
}

/** Un montant toutes taxes, seul : « 1 481,47 € TTC ». */
function montantTTCSeul(valeur) {
  const e = euros(valeur);
  return e ? `${e} TTC` : '';
}

/** Un montant toutes taxes, avec le hors taxes entre parenthèses quand il
 *  en diffère. C'est le TTC que le client doit : c'est lui que la lettre
 *  annonce en premier. Sans TTC connu, le HT seul. */
function montantTTC(ttc, ht) {
  const toutes = Number(ttc);
  const hors = Number(ht);
  if (!Number.isFinite(toutes)) return montantHT(ht);
  const detail = Number.isFinite(hors) && Math.abs(hors - toutes) >= 0.01 ? ` (${montantHT(hors)})` : '';
  return `${montantTTCSeul(toutes)}${detail}`;
}

/* Capmedia est une micro-entreprise : franchise en base de TVA. Une pièce
   à TVA 0 n'a qu'un montant, le prix payé, en « € », et la lettre porte la
   mention légale une fois (comme la page « Devis et factures » du Hub). Une
   vraie TVA (> 0) garde HT et TTC. Sans taux connu, on compare TTC et HT ;
   sans l'un ni l'autre, c'est la franchise, le régime de Capmedia. */
const MENTION_FRANCHISE = 'TVA non applicable, article 293 B du CGI';
function franchiseDe(v) {
  const x = v || {};
  if (x.tva !== undefined && x.tva !== null && x.tva !== '' && Number.isFinite(Number(x.tva))) return Number(x.tva) <= 0;
  const ttc = Number(x.ttc); const ht = Number(x.montant);
  if (x.ttc !== undefined && x.ttc !== null && x.montant !== undefined && x.montant !== null && Number.isFinite(ttc) && Number.isFinite(ht)) return Math.abs(ttc - ht) < 0.01;
  return true;
}
/** Le montant d'une pièce selon son régime : seul en franchise, TTC sinon. */
function somme(v, valeur, ht) { return franchiseDe(v) ? euros(valeur) : montantTTC(valeur, ht); }
/** La ligne de la mention légale, en franchise seulement. */
function ligneFranchise(v) { return franchiseDe(v) ? ['TVA', MENTION_FRANCHISE] : ['', '']; }

/* ==========================================================================
   1 bis. La salutation

   Une seule formule pour toutes les lettres : « Bonjour Prénom, », ou
   « Bonjour, » quand on ne connaît pas de prénom. Avant, chaque modèle
   saluait à sa façon : le nom complet tel que saisi (« Bonjour SÉBASTIEN
   HOREMANS, »), le prénom, « Bonjour, », ou rien du tout.
   ========================================================================== */

/* Ce qui précède parfois un prénom, et n'en est pas un. */
const CIVILITES = new Set(['m', 'mr', 'mme', 'mlle', 'monsieur', 'madame', 'mademoiselle', 'dr', 'docteur', 'pr', 'professeur', 'me', 'maître', 'maitre']);
/* Les particules d'un nom de famille : un nom qui commence par l'une
   d'elles n'a pas de prénom devant (« de La Fontaine »). */
const PARTICULES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'van', 'von', 'der', 'den', 'di', 'da', 'del', 'della', 'dos', 'das', 'ten', 'ter', 'zu']);
/* Un nom qui désigne un service ou une société, pas une personne. */
const PAS_UNE_PERSONNE = /^(l['’]\s*)?(équipe|equipe|capmedia|client|contact|service|société|societe|support|admin|administrateur)\b/i;

/** Une partie de prénom remise à la casse d'usage, si elle a été saisie
 *  tout en capitales ou tout en minuscules ; une casse mixte (« DeAndre »)
 *  est gardée telle quelle. */
function casseDePrenom(mot) {
  if (mot !== mot.toUpperCase() && mot !== mot.toLowerCase()) return mot;
  return mot.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, sep, lettre) => `${sep}${lettre.toUpperCase()}`);
}

/**
 * Le prénom d'un nom saisi, prêt à saluer. Rend '' quand il n'y en a pas
 * de sûr : adresse e-mail, service, initiale seule, nom à particule.
 *   « SÉBASTIEN HOREMANS » → « Sébastien »
 *   « jean-pierre dupont » → « Jean-Pierre »
 *   « Mme Claire Martin »  → « Claire »
 *   « HOREMANS, Sébastien » → « Sébastien »
 *   « de La Fontaine »     → ''
 */
function prenomDe(nom) {
  let s = valeurTexte(nom).replace(/\s+/g, ' ').trim();
  if (!s || s.includes('@') || /\d/.test(s) || PAS_UNE_PERSONNE.test(s)) return '';
  /* « NOM, Prénom » : la forme des annuaires. */
  if (s.includes(',')) s = s.slice(s.indexOf(',') + 1).trim();
  const mots = s.split(' ').filter(Boolean);
  while (mots.length && CIVILITES.has(mots[0].toLowerCase().replace(/\.$/, ''))) mots.shift();
  const premier = (mots[0] || '').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (premier.length < 2) return '';
  const bas = premier.toLowerCase();
  if (PARTICULES.has(bas) || /^[dl]['’]/i.test(premier)) return '';
  return casseDePrenom(premier);
}

/** « Bonjour Sébastien, », ou « Bonjour, » sans prénom sûr. */
function salutation(nom) {
  const prenom = prenomDe(nom);
  return prenom ? `Bonjour ${prenom},` : 'Bonjour,';
}

/**
 * Le nom de la personne à qui CETTE lettre est adressée.
 *
 * `contexte.a` est la liste des destinataires de l'envoi (le facteur la
 * passe toujours) : une lettre à une seule personne la salue par son nom ;
 * une lettre à plusieurs ne salue personne en particulier. Sans contexte
 * (aperçu, épreuve), les variables qui désignent le destinataire.
 *   destinataire : variables qui nomment le destinataire, lues aussi quand
 *                  l'envoi ne porte pas de nom
 *   secours      : variables lues seulement sans contexte (le nom du client
 *                  du projet, qui peut être celui d'une société)
 */
function nomDuDestinataire(v, contexte, { destinataire = [], secours = [] } = {}) {
  const a = contexte && Array.isArray(contexte.a) ? contexte.a.filter((d) => d && d.email) : null;
  if (a && a.length > 1) return '';
  const sien = a && a.length === 1 ? valeurTexte(a[0].nom).trim() : '';
  if (sien) return sien;
  const champs = a ? destinataire : [...destinataire, ...secours];
  for (const c of champs) {
    const x = valeurTexte(v[c]).trim();
    if (x) return x;
  }
  return '';
}

/* Une lettre à l'équipe ne salue personne en particulier : elle part à
   l'adresse commune. */
const BONJOUR_EQUIPE = 'Bonjour,';

/* ==========================================================================
   2. Les libellés, alignés sur agence/suivi/assets/noyau.js
   ========================================================================== */

const STATUTS = {
  'nouveau': 'Reçue',
  'a-analyser': 'À analyser',
  'en-attente-client': "Besoin d'information",
  'acceptee': 'Acceptée',
  'planifiee': 'Planifiée',
  'en-cours': 'En cours',
  'en-revue': 'En revue',
  'a-valider': 'À valider',
  'resolu': 'Terminée',
  'refuse': 'Refusée',
  'annulee': 'Annulée',
  'ferme': 'Fermée',
};

/** Le bout de phrase qui passe dans l'objet : « Votre demande ... ». */
const PHRASES_STATUT = {
  'nouveau': 'est de nouveau en attente de traitement',
  'a-analyser': 'est à l\'étude',
  'en-attente-client': 'attend une précision de votre part',
  'acceptee': 'est acceptée',
  'planifiee': 'est planifiée',
  'en-cours': 'est en cours de traitement',
  'en-revue': 'est en cours de vérification',
  'a-valider': 'attend votre validation',
  'resolu': 'est terminée',
  'refuse': 'n\'a pas été retenue',
  'annulee': 'est annulée',
  'ferme': 'est fermée',
};

const URGENCES = {
  'bloquant': 'Bloquant',
  'critique': 'Critique',
  'important': 'Important',
  'mineur': 'Mineur',
};

/* Les neuf types du formulaire, et « autre ». */
const TYPES = {
  'bug': 'Anomalie',
  'modification': 'Modification',
  'fonctionnalite': 'Nouvelle fonctionnalité',
  'amelioration': 'Amélioration',
  'question': 'Question',
  'technique': 'Demande technique',
  'contenu': 'Demande de contenu',
  'devis': 'Demande de devis',
  'demande': 'Demande',
  'autre': 'Autre',
};

const PLATEFORMES = {
  'ios': 'iPhone',
  'android': 'Android',
  'web': 'Web',
  'admin': 'Tableau de bord',
  'backend': 'Serveur',
  'landing': 'Site vitrine',
  'mobile': 'iPhone et Android',
};

const libelle = (table, cle, defaut = '') => table[valeurTexte(cle)] || defaut;
const majuscule = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
/** « 1 nouvelle demande », « 7 nouvelles demandes ». */
const compte = (n, singulier, pluriel) => `${n} ${n > 1 ? pluriel : singulier}`;

/* ==========================================================================
   3. Le gabarit

   rendreGabarit reçoit du texte brut et l'échappe lui-même. Aucun appelant
   ne lui passe de HTML : c'est ce qui garantit qu'aucun champ ne peut
   échapper au nettoyage, même après une modification distraite.
   ========================================================================== */

/* Une police en propriétés séparées : Outlook lit mal le raccourci « font ». */
const f = (poids, taille, hauteur, famille = POLICE) =>
  `font-family:${famille};font-size:${taille}px;line-height:${hauteur}px;font-weight:${poids};`;

const S = {
  titre: `margin:0 0 20px;${f(700, 26, 32, POLICE_TITRE)}color:${TEINTES.texte};letter-spacing:-0.022em;`,
  corps: `margin:0 0 16px;${f(400, 16, 26)}color:${TEINTES.texte2};`,
  cle: `${f(400, 14, 20)}color:${TEINTES.texte3};`,
  val: `${f(600, 14, 20)}color:${TEINTES.texte};`,
  note: `margin:0;${f(400, 13, 20)}color:${TEINTES.texte3};`,
  pied: `margin:12px 0 0;${f(400, 12, 19)}color:${TEINTES.texte3};`,
  lienPied: `color:${TEINTES.texte3};text-decoration:underline;`,
  numero: `margin:0 0 4px;${f(500, 12, 16, POLICE_MONO)}color:${TEINTES.texte3};letter-spacing:0.02em;`,
  elementTitre: `margin:0;${f(600, 15, 21)}color:${TEINTES.texte};`,
  elementDetail: `margin:4px 0 0;${f(400, 14, 20)}color:${TEINTES.texte2};`,
  elementLien: `${f(600, 14, 20)}color:${TEINTES.action};text-decoration:none;`,
  second: `margin:18px 0 0;${f(400, 15, 22)}color:${TEINTES.texte2};`,
  citation: `margin:0 0 10px;${f(400, 15, 24)}color:${TEINTES.texte};`,
};

/* Un lien ne devient un href que s'il commence par https:// ; rien
   d'autre (pas de « javascript: », pas de chemin relatif). */
const lienSur = (url) => (/^https:\/\/\S+$/.test(valeurTexte(url).trim()) ? valeurTexte(url).trim() : '');

/* Le logo d'un projet n'entre dans la lettre que s'il est une image que
   toutes les messageries lisent : PNG, JPEG ou GIF, en https. Un SVG ou un
   WebP laisse la place aux initiales. */
const logoSur = (url) => {
  const u = lienSur(url);
  return u && /\.(png|jpe?g|gif)([?#]|$)/i.test(u) ? u : '';
};

/* Les initiales d'un projet sans logo, comme le Hub (ui.js, avatarProjet). */
const initiales = (nom) => valeurTexte(nom).trim().split(/\s+/).slice(0, 2)
  .map((m) => m.charAt(0)).join('').toUpperCase();

/* --- Les icônes ----------------------------------------------------------
   Celles du Hub, au trait, en PNG gris (#8E8E93) lisible sur les deux
   fonds. Toujours posées à côté d'un libellé, jamais dans une pastille.
   Décoratives : alt vide, la lettre se lit pareil images bloquées. */
const icone = (nom, marge = 10) => `<img src="${IMAGES}i-${nom}.png" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;border:0;outline:none;vertical-align:-3px;margin:0 ${marge}px 0 0;">`;

/* L'icône d'un fait, d'après son libellé. Le premier motif qui répond
   l'emporte : l'ordre compte (« Reste à payer » avant « Date »). */
const ICONES_FAITS = [
  [/montant|reste à payer|budget/i, 'euro'],
  [/^tva$/i, 'receipt'],
  [/^devis/i, 'documents'],
  [/^facture/i, 'receipt'],
  [/^moyen/i, 'paiement'],
  [/^code$/i, 'cadenas'],
  [/adresse ip/i, 'globe'],
  [/adresse/i, 'mail'],
  [/visioconf/i, 'video'],
  [/^lieu/i, 'pin'],
  [/durée|temps passé|rythme|^heure/i, 'horloge'],
  [/ le$|échéance|^date|jusqu|fin prévue|délai|séquence|jours de travail/i, 'calendrier'],
  [/urgence|gravité|bloquant|anomalie|échecs/i, 'alerte'],
  [/statut|^réponse/i, 'activite'],
  [/plateforme/i, 'smartphone'],
  [/^version/i, 'releases'],
  [/testeurs/i, 'utilisateurs'],
  [/rôle|ouverte par|testeur|^par$/i, 'utilisateur'],
  [/pièce/i, 'trombone'],
  [/fichier/i, 'fichiers'],
  [/tâche/i, 'taches'],
  [/réussi/i, 'check'],
  [/valid|examiner/i, 'valider'],
  [/sans objet/i, 'aucun'],
  [/scénario/i, 'liste'],
  [/^idée/i, 'ampoule'],
  [/note du test/i, 'sparkle'],
  [/attendons|vous testez/i, 'cible'],
  [/formule/i, 'composants'],
  [/feuille de route/i, 'route'],
  [/^projet|^application/i, 'projets'],
  [/demande|précision|correction|évolution/i, 'demandes'],
  [/^type|catégorie|référence/i, 'etiquette'],
];
const iconeDuFait = (cle) => (ICONES_FAITS.find(([motif]) => motif.test(cle)) || [null, 'note'])[1];

/* La flèche d'un lien, à la couleur du lien : deux images, l'une pour le
   clair, l'autre pour le sombre, échangées par la feuille de la lettre.
   Outlook (Word) ne lit pas cet échange : il n'a que la claire. */
const fleche = () => `<img class="cm-clair" src="${IMAGES}fleche.png" width="14" height="14" alt="" style="display:inline-block;width:14px;height:14px;border:0;vertical-align:-2px;margin-left:2px;">`
  + `<!--[if !mso]><!--><img class="cm-sombre" src="${IMAGES}fleche-sombre.png" width="14" height="14" alt="" style="display:none;width:14px;height:14px;border:0;vertical-align:-2px;margin-left:2px;"><!--<![endif]-->`;

/* Un bloc à fond doux et coins arrondis, dans la carte. */
const panneau = (contenu, marge = '8px 0 28px', pad = '6px 22px') => `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="cm-panneau" bgcolor="${TEINTES.panneau}"
                     style="border-collapse:separate;width:100%;margin:${marge};background:${TEINTES.panneau};border-radius:16px;">
                <tr><td class="cm-panneau-pad" style="padding:${pad};">${contenu}
                </td></tr>
              </table>`;

/* Un fait : l'icône et le libellé à gauche, la valeur à droite ; une
   valeur longue passe dessous, et tout s'empile sur un téléphone. */
const LONGUE = 44;
function ligneFait(cle, valeur, premiere) {
  const bord = premiere ? '' : `border-top:1px solid ${TEINTES.trait};`;
  const libelle = `${icone(iconeDuFait(cle))}<span class="cm-t3" style="${S.cle}">${echapper(cle)}</span>`;
  if (valeur.length > LONGUE || valeur.includes('\n')) {
    return `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tr><td class="cm-bord" style="padding:14px 0;${bord}">
                      <div style="${S.cle}">${libelle}</div>
                      <div class="cm-t1" style="margin:6px 0 0 26px;${S.val}">${echapper(valeur).replace(/\n/g, '<br>')}</div>
                    </td></tr>
                  </table>`;
  }
  return `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tr>
                      <td class="cm-bord cm-pile" valign="top" style="padding:14px 16px 14px 0;white-space:nowrap;${bord}${S.cle}">${libelle}</td>
                      <td class="cm-bord cm-pile cm-val cm-t1" valign="top" align="right" style="padding:14px 0;text-align:right;${bord}${S.val}">${echapper(valeur)}</td>
                    </tr>
                  </table>`;
}

/* Une ligne du récapitulatif. Le numéro de la demande, s'il ouvre le
   titre (« FORGEME-012 · Titre »), passe au-dessus en chasse fixe. */
function ligneElement(l, premiere) {
  const bord = premiere ? '' : `border-top:1px solid ${TEINTES.trait};`;
  const m = /^([A-Z0-9][A-Z0-9_]*-\d+) · (.+)$/.exec(l.titre);
  return `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tr><td class="cm-bord" style="padding:18px 0;${bord}">${m ? `
                      <p class="cm-t3" style="${S.numero}">${echapper(m[1])}</p>` : ''}
                      <p class="cm-t1" style="${S.elementTitre}">${echapper(m ? m[2] : l.titre)}</p>${l.detail ? `
                      <p class="cm-t2" style="${S.elementDetail}">${echapper(l.detail)}</p>` : ''}${l.lien ? `
                      <p style="margin:10px 0 0;${f(600, 14, 20)}"><a class="cm-lien" href="${echapper(l.lien)}" style="${S.elementLien}">${echapper(l.libelleLien)}</a>${fleche()}</p>` : ''}
                    </td></tr>
                  </table>`;
}

/* Le bouton, en pilule. Outlook (Word) ne sait pas arrondir un lien : il
   reçoit le même bouton dessiné en VML. */
function boutonPilule(libelle, url) {
  const l = echapper(libelle); const u = echapper(url);
  const largeur = Math.min(520, Math.max(200, Math.round(valeurTexte(libelle).length * 9.5 + 64)));
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="cm-bouton" style="border-collapse:separate;margin:4px 0 0;">
                <tr><td align="center" bgcolor="${TEINTES.action}" style="border-radius:999px;background:${TEINTES.action};">
                  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${u}" style="height:50px;v-text-anchor:middle;width:${largeur}px;" arcsize="50%" stroke="f" fillcolor="${TEINTES.action}"><w:anchorlock/><center style="color:#FFFFFF;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:600;">${l}</center></v:roundrect><![endif]-->
                  <!--[if !mso]><!--><a href="${u}" style="display:inline-block;padding:15px 30px;${f(600, 16, 20)}color:#FFFFFF;text-decoration:none;border-radius:999px;letter-spacing:-0.01em;">${l}</a><!--<![endif]-->
                </td></tr>
              </table>`;
}

/* La feuille de la lettre : le mode sombre et le téléphone. Les messageries
   qui l'ignorent (Gmail pour le sombre) gardent la lettre claire, entière. */
const FEUILLE = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  table { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media screen and (max-width: 620px) {
    .cm-ext { padding: 16px 10px 28px !important; }
    .cm-tete { padding: 4px 8px 16px !important; }
    .cm-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .cm-h1 { font-size: 23px !important; line-height: 29px !important; }
    .cm-panneau-pad { padding-left: 16px !important; padding-right: 16px !important; }
    .cm-pile { display: block !important; width: auto !important; text-align: left !important; white-space: normal !important; padding: 14px 0 0 0 !important; }
    .cm-val { border-top: 0 !important; padding: 4px 0 14px 26px !important; }
    .cm-bouton { width: 100% !important; }
    .cm-bouton a { display: block !important; }
  }
  @media (prefers-color-scheme: dark) {
    .cm-page { background: ${SOMBRE.page} !important; }
    .cm-carte { background: ${SOMBRE.lettre} !important; box-shadow: none !important; }
    .cm-panneau { background: ${SOMBRE.panneau} !important; }
    .cm-t1 { color: ${SOMBRE.texte} !important; }
    .cm-t2 { color: ${SOMBRE.texte2} !important; }
    .cm-t3, .cm-t3 a { color: ${SOMBRE.texte3} !important; }
    .cm-bord { border-color: ${SOMBRE.trait} !important; }
    .cm-filet { background: ${SOMBRE.trait} !important; }
    .cm-lien { color: ${SOMBRE.lien} !important; }
    .cm-badge { background: ${SOMBRE.badge} !important; color: ${SOMBRE.lien} !important; }
    .cm-initiale { background: ${SOMBRE.panneau} !important; color: ${SOMBRE.initiale} !important; }
    .cm-clair { display: none !important; }
    .cm-sombre { display: inline-block !important; }
  }
  [data-ogsb] .cm-page { background: ${SOMBRE.page} !important; }
  [data-ogsb] .cm-carte { background: ${SOMBRE.lettre} !important; }
  [data-ogsb] .cm-panneau, [data-ogsb] .cm-initiale { background: ${SOMBRE.panneau} !important; }
  [data-ogsc] .cm-t1 { color: ${SOMBRE.texte} !important; }
  [data-ogsc] .cm-t2 { color: ${SOMBRE.texte2} !important; }
  [data-ogsc] .cm-t3 { color: ${SOMBRE.texte3} !important; }
  [data-ogsc] .cm-lien { color: ${SOMBRE.lien} !important; }`;

/* L'en-tête du projet de la lettre, posé par rendre() le temps d'un rendu :
   { nom, logo }. Le rendu est synchrone, rien ne peut s'intercaler. */
let enteteProjet = null;

/**
 * @param {object} bloc
 *   titre    string          le titre de la lettre
 *   intro    string          un ou plusieurs paragraphes (séparés par \n\n)
 *   faits    array           [[clé, valeur]], les valeurs vides sont retirées
 *   citation string          un message repris tel quel, encadré
 *   liste    array           [{ titre, detail, lien, libelleLien }] : une
 *            ligne par élément, avec son propre lien (le récapitulatif)
 *   bouton   { libelle, url } l'unique bouton bleu
 *   second   { libelle, url } un lien secondaire, sous le bouton : jamais
 *            d'adresse nue dans une phrase du HTML
 *   note     string          la précision en petits caractères
 *   code     string          le code de connexion, mis en avant (le fait
 *            « Code » qui le porte ne se répète pas dans le HTML)
 *   marque   { signature, pied, service } facultatif : la signature, la
 *            phrase du pied et le badge du service à côté de la marque.
 *            MARQUE_TEST pour les testeurs, MARQUE_EQUIPE pour l'équipe ;
 *            sans elle, Capmedia Digital, le Hub et le suivi du projet.
 */
function rendreGabarit(bloc) {
  const signature = valeurTexte((bloc.marque || {}).signature).trim() || SIGNATURE;
  const pied = valeurTexte((bloc.marque || {}).pied).trim() || 'Cet e-mail vous est adressé au titre du suivi de votre projet.';
  const service = valeurTexte((bloc.marque || {}).service).trim() || 'Hub';
  const faits = (bloc.faits || [])
    .map(([cle, valeur]) => [valeurTexte(cle), valeurTexte(valeur).trim()])
    .filter(([cle, valeur]) => cle && valeur);
  const code = valeurTexte(bloc.code).trim();
  const faitsVus = code ? faits.filter(([, valeur]) => valeur !== code) : faits;

  const tableFaits = faitsVus.length
    ? panneau(faitsVus.map(([cle, valeur], i) => ligneFait(cle, valeur, i === 0)).join(''), '8px 0 28px', '4px 22px')
    : '';

  const blocCode = code ? panneau(`
                  <p class="cm-t3" style="margin:0;${S.cle}text-align:center;">${icone('cadenas', 8)}Code</p>
                  <p class="cm-t1" style="margin:10px 0 0;${f(600, 34, 40, POLICE_MONO)}color:${TEINTES.texte};letter-spacing:0.22em;text-align:center;padding-left:0.22em;">${echapper(code)}</p>`, '8px 0 28px', '24px 16px 26px') : '';

  const elements = listeDe(bloc.liste);
  const tableListe = elements.length
    ? panneau(elements.map((l, i) => ligneElement(l, i === 0)).join(''), '8px 0 28px', '2px 22px')
    : '';

  const citation = valeurTexte(bloc.citation).trim()
    ? panneau(`
                  ${enParagraphes(bloc.citation, S.citation, 'cm-t1')}`, '8px 0 28px', '20px 24px 10px')
    : '';

  const bouton = (bloc.bouton && valeurTexte(bloc.bouton.url))
    ? boutonPilule(bloc.bouton.libelle || 'Ouvrir mon espace', valeurTexte(bloc.bouton.url)) : '';

  const urlSecond = bloc.second ? lienSur(bloc.second.url) : '';
  const second = urlSecond
    ? `<p class="cm-t2" style="${S.second}"><a class="cm-lien" href="${echapper(urlSecond)}" style="${S.elementLien}font-size:15px;">${echapper(valeurTexte(bloc.second.libelle) || 'Ouvrir mon espace')}</a>${fleche()}</p>` : '';

  const note = valeurTexte(bloc.note).trim() ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:32px 0 0;">
                <tr><td class="cm-bord" style="border-top:1px solid ${TEINTES.trait};padding:20px 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td valign="top" style="width:16px;padding:2px 10px 0 0;">${icone(code ? 'cadenas' : 'info', 0)}</td>
                      <td valign="top"><p class="cm-t3" style="${S.note}">${echapper(bloc.note)}</p></td>
                    </tr>
                  </table>
                </td></tr>
              </table>` : '';

  /* Le projet de la lettre : son logo et son nom, en tête de la carte. */
  const projet = enteteProjet && enteteProjet.nom ? enteteProjet : null;
  const logo = projet ? logoSur(projet.logo) : '';
  const ecusson = !projet ? '' : logo
    ? `<img src="${echapper(logo)}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0;border-radius:12px;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                        <tr><td class="cm-initiale" width="44" height="44" align="center" valign="middle" bgcolor="${TEINTES.panneau}"
                                style="width:44px;height:44px;border-radius:12px;background:${TEINTES.panneau};${f(600, 16, 44, POLICE_TITRE)}color:${TEINTES.initiale};letter-spacing:0.02em;">${echapper(initiales(projet.nom))}</td></tr>
                      </table>`;
  const ligneProjet = projet ? `
        <tr>
          <td class="cm-pad" style="padding:32px 40px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td valign="middle" style="width:44px;">${ecusson}</td>
                <td valign="middle" style="padding:0 0 0 14px;"><p class="cm-t1" style="margin:0;${f(600, 17, 22, POLICE_TITRE)}color:${TEINTES.texte};letter-spacing:-0.012em;">${echapper(projet.nom)}</p></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="cm-pad" style="padding:24px 40px 0;">
            <div class="cm-filet" style="height:1px;line-height:1px;font-size:0;background:${TEINTES.trait};">&nbsp;</div>
          </td>
        </tr>` : '';

  const html = `<!doctype html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${echapper(bloc.titre)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${FEUILLE}
</style>
</head>
<body class="cm-page" style="margin:0;padding:0;background:${TEINTES.page};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="cm-page" bgcolor="${TEINTES.page}"
       style="border-collapse:collapse;width:100%;background:${TEINTES.page};margin:0;padding:0;">
  <tr>
    <td align="center" class="cm-ext" style="padding:40px 16px 48px;">
      <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR}"><tr><td><![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:${LARGEUR}px;">
        <tr>
          <td class="cm-tete" style="padding:0 8px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td valign="top" style="width:32px;padding:0 10px 0 0;"><img src="${IMAGES}capmedia.png" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;"></td>
                <td valign="top">
                  <p style="margin:0;${f(700, 22, 28, POLICE_TITRE)}"><span class="cm-t1" style="color:${TEINTES.texte};letter-spacing:-0.035em;">Capmedia</span>&nbsp;<span class="cm-badge" style="display:inline-block;padding:3px 8px 2px;border-radius:999px;background:${TEINTES.badge};color:${TEINTES.action};${f(600, 10, 13, POLICE_TITRE)}letter-spacing:0.06em;vertical-align:4px;">${echapper(service.toUpperCase())}</span></p>
                  <img class="cm-clair" src="${IMAGES}trait.png" width="86" height="8" alt="" style="display:block;width:86px;height:8px;border:0;margin:1px 0 0;">
                  <!--[if !mso]><!--><img class="cm-sombre" src="${IMAGES}trait-sombre.png" width="86" height="8" alt="" style="display:none;width:86px;height:8px;border:0;margin:1px 0 0;"><!--<![endif]-->
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="cm-carte" bgcolor="${TEINTES.lettre}"
             style="border-collapse:separate;width:100%;max-width:${LARGEUR}px;background:${TEINTES.lettre};border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,0.04),0 12px 32px rgba(0,0,0,0.06);">${ligneProjet}
        <tr>
          <td class="cm-pad" style="padding:${projet ? 28 : 40}px 40px 40px;">
            <h1 class="cm-t1 cm-h1" style="${S.titre}">${echapper(bloc.titre)}</h1>
            ${enParagraphes(bloc.intro, S.corps, 'cm-t2')}${blocCode}${tableFaits}${tableListe}${citation}${bouton}${second}${note}
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:${LARGEUR}px;">
        <tr>
          <td align="center" class="cm-pad" style="padding:32px 40px 0;">
            <img src="${IMAGES}capmedia.png" width="24" height="24" alt="Capmedia" style="display:block;width:24px;height:24px;border:0;margin:0 auto;">
            <p class="cm-t3" style="${S.pied}">${echapper(signature)} · <a href="${SITE}" style="${S.lienPied}">capmedia.app</a><br>
            ${echapper(pied)}</p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;

  return { html, texte: rendreTexte(bloc, faits, signature, elements, urlSecond) };
}

/* Les éléments d'une liste, en texte propre. */
function listeDe(liste) {
  return (Array.isArray(liste) ? liste : [])
    .map((l) => ({
      titre: valeurTexte(l && l.titre).trim(),
      detail: valeurTexte(l && l.detail).trim(),
      lien: lienSur(l && l.lien),
      libelleLien: valeurTexte(l && l.libelleLien).trim() || 'Voir',
    }))
    .filter((l) => l.titre);
}

/** La même lettre, en texte brut. Jamais vide : l'objet sert de secours.
 *  Ici, les adresses restent en clair : c'est le seul moyen de les suivre. */
function rendreTexte(bloc, faits, signature = SIGNATURE, elements = [], urlSecond = '') {
  const lignes = [valeurTexte(signature).toUpperCase(), ''];

  const titre = valeurTexte(bloc.titre).trim();
  if (titre) lignes.push(titre, '');

  const intro = valeurTexte(bloc.intro).trim();
  if (intro) lignes.push(intro, '');

  for (const [cle, valeur] of faits) lignes.push(`${cle} : ${valeur}`);
  if (faits.length) lignes.push('');

  for (const l of elements) {
    lignes.push(l.titre);
    if (l.detail) lignes.push(l.detail);
    if (l.lien) lignes.push(`${l.libelleLien} : ${l.lien}`);
    lignes.push('');
  }

  const citation = valeurTexte(bloc.citation).trim();
  if (citation) {
    lignes.push(...citation.split('\n').map((l) => `> ${l}`), '');
  }

  if (bloc.bouton && valeurTexte(bloc.bouton.url)) {
    lignes.push(`${valeurTexte(bloc.bouton.libelle) || 'Ouvrir mon espace'} : ${valeurTexte(bloc.bouton.url)}`, '');
  }
  if (urlSecond) lignes.push(`${valeurTexte(bloc.second.libelle) || 'Ouvrir mon espace'} : ${urlSecond}`, '');

  const note = valeurTexte(bloc.note).trim();
  if (note) lignes.push(note, '');

  lignes.push(`${signature} · ${SITE}`);
  return lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* --- L'objet ------------------------------------------------------------
   Une seule forme pour toutes les lettres : « Projet · Ce qui se passe »,
   ou « NUMÉRO · Ce qui se passe » pour une demande. */
function objetAvecNumero(numero, suite) {
  const num = valeurTexte(numero).trim();
  return num ? `${num} · ${suite}` : suite;
}
function objetDuProjet(projet, suite) {
  const p = valeurTexte(projet).trim();
  return p ? `${p} · ${suite}` : suite;
}
/** « Titre : détail », ou « Titre » seul quand le détail manque : jamais
 *  un objet qui finit par deux-points. */
const avecDetail = (suite, detail) => (valeurTexte(detail).trim() ? `${suite} : ${valeurTexte(detail).trim()}` : suite);
/** « la demande FORGEME-012, « Titre », » : le numéro et le titre, ce
 *  qu'on en a. Au milieu d'une phrase, l'incise du titre se ferme par une
 *  virgule ; en fin de phrase (enFin), non. */
function laDemande(numero, titre, article = 'la demande', enFin = false) {
  const n = valeurTexte(numero).trim(); const t = valeurTexte(titre).trim();
  return `${article}${n ? ` ${n}` : ''}${t ? `, « ${t} »${enFin ? '' : ','}` : ''}`;
}
/** Le salut, puis le corps de la lettre. */
const ecrire = (bonjour, corps) => `${bonjour}\n\n${corps}`;

/* ==========================================================================
   4. Les modèles des clients : accès, demandes, devis et factures

   Chacun reçoit les « variables » de son document d'envoi, et le contexte
   de l'envoi (ses destinataires), et renvoie { objet, html, texte }. Aucune
   lecture de base ici : tout ce qui est nécessaire a été figé au moment de
   la mise en file, ce qui rend l'e-mail fidèle à l'instant de l'événement
   même s'il part une heure plus tard.
   ========================================================================== */

const ROLES_CLIENT = { responsable: 'Responsable du projet', collaborateur: 'Collaborateur' };

/* 1. Invitation d'un client sur son espace. */
function invitation(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['clientNom'] }));
  return {
    objet: objetDuProjet(projet, 'Votre espace de suivi est ouvert'),
    ...rendreGabarit({
      titre: 'Votre espace de suivi est ouvert',
      intro: ecrire(bonjour, `Votre espace de suivi${projet ? ` du projet ${projet}` : ''} est désormais accessible. Vous pouvez y signaler une anomalie ou formuler une demande, `
        + 'suivre son avancement, échanger avec notre équipe et retrouver vos devis et factures.\n\n'
        + "La connexion se fait sans mot de passe : saisissez votre adresse e-mail et vous recevrez un code à six chiffres qui ouvre la session. Ce code est valable dix minutes et ne sert qu'une fois."),
      faits: [
        ['Projet', projet],
        ['Votre adresse', valeurTexte(v.email)],
        ['Votre rôle', libelle(ROLES_CLIENT, v.role)],
      ],
      bouton: { libelle: 'Ouvrir mon espace', url: valeurTexte(v.lien) || lienEspace() },
      note: "Connectez-vous avec l'adresse à laquelle vous avez reçu cet e-mail : c'est elle qui donne accès au projet.",
    }),
  };
}

/* 1 ter. L'ouverture d'un projet.

   La première fois qu'un projet s'ouvre au client, une seule lettre part à
   chaque interlocuteur : l'invitation, et ce qui l'attend déjà dans son
   espace. Pas une lettre par événement accumulé pendant la préparation :
   un résumé, puis l'espace. */
function ouverture(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['clientNom'] }));
  const points = (Array.isArray(v.points) ? v.points : []).slice(0, 8)
    .map((p) => [valeurTexte(p && p.quoi), valeurTexte(p && p.detail)]);
  return {
    objet: objetDuProjet(projet, 'Votre espace de suivi est ouvert'),
    ...rendreGabarit({
      titre: 'Votre espace de suivi est ouvert',
      intro: ecrire(bonjour, `Votre espace de suivi${projet ? ` du projet ${projet}` : ''} est prêt. Vous pouvez y suivre l'avancement, formuler vos demandes, `
        + 'échanger avec notre équipe et retrouver les éléments qui attendent votre avis.'
        + (points.length ? '\n\nVoici ce qui vous y attend déjà.' : '')),
      faits: [
        /* Un rôle inconnu ne s'invente pas : la ligne disparaît. */
        ['Votre rôle', libelle(ROLES_CLIENT, v.role)],
        ...points,
        ['Votre adresse', valeurTexte(v.email)],
      ],
      bouton: { libelle: 'Ouvrir mon espace', url: valeurTexte(v.lien) || lienEspace() },
      note: "La connexion se fait sans mot de passe : un code à six chiffres, valable dix minutes, est envoyé à l'adresse qui a reçu cet e-mail.",
    }),
  };
}

/* 2. Demande créée. Deux voix : l'accusé au client, l'alerte à l'équipe. */
function ticketCree(v, ctx) {
  const numero = valeurTexte(v.numero);
  const titre = valeurTexte(v.titre);
  const projet = valeurTexte(v.projetNom).trim();
  const faits = [
    ['Demande', numero],
    ['Projet', projet],
    ['Type', libelle(TYPES, v.type)],
    ['Urgence', libelle(URGENCES, v.urgence)],
    ['Plateforme', libelle(PLATEFORMES, v.plateforme)],
    ['Version', valeurTexte(v.version)],
  ];
  const lien = valeurTexte(v.lien) || lienEspace();

  if (valeurTexte(v.cote) === 'equipe') {
    return {
      objet: objetAvecNumero(numero, avecDetail('Nouvelle demande', titre)),
      ...rendreGabarit({
        titre: titre || 'Nouvelle demande',
        intro: ecrire(BONJOUR_EQUIPE, `${valeurTexte(v.auteurNom).trim() || 'Un client'} vient d'ouvrir une demande${projet ? ` sur le projet ${projet}` : ''}.`),
        faits: faits.concat([['Ouverte par', valeurTexte(v.auteurNom)], ['Adresse', valeurTexte(v.auteurEmail)]]),
        citation: extrait(v.description, 900),
        bouton: { libelle: 'Traiter la demande', url: lien },
        marque: MARQUE_EQUIPE,
      }),
    };
  }

  /* Une demande ouverte par l'équipe pour le compte du client ne peut pas
     lui être accusée comme si c'était lui qui l'avait écrite. « par » est
     le destinataire de CETTE lettre (une par personne) ; « clientNom »
     reste le nom de l'auteur, pour les envois d'avant. */
  const parLEquipe = v.parLEquipe === true || valeurTexte(v.parLEquipe) === 'true';
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['par'], secours: ['clientNom'] }));

  if (parLEquipe) {
    return {
      objet: objetAvecNumero(numero, 'Une demande a été ouverte pour vous'),
      ...rendreGabarit({
        titre: 'Une demande a été ouverte pour vous',
        intro: ecrire(bonjour, `Nous avons ouvert ${laDemande(numero, titre)} à la suite de nos échanges. Vous pouvez la suivre et y répondre depuis votre espace.`),
        faits,
        citation: extrait(v.description, 600),
        bouton: { libelle: 'Suivre la demande', url: lien },
        note: 'Si nous avons mal compris votre besoin, indiquez-le dans la demande : nous la corrigerons.',
      }),
    };
  }

  return {
    objet: objetAvecNumero(numero, 'Votre demande est enregistrée'),
    ...rendreGabarit({
      titre: 'Votre demande est enregistrée',
      intro: ecrire(bonjour, `Nous avons bien reçu votre demande${numero ? ` ${numero}` : ''}${titre ? `, « ${titre} »` : ''}. Elle est enregistrée et nous revenons vers vous dès sa prise en charge.`),
      faits,
      citation: extrait(v.description, 600),
      bouton: { libelle: 'Suivre la demande', url: lien },
      note: "Pour ajouter une précision ou une capture d'écran, rendez-vous sur la demande, dans votre espace.",
    }),
  };
}

/* 3. Changement de statut. */
function statut(v, ctx) {
  const numero = valeurTexte(v.numero);
  const titre = valeurTexte(v.titre);
  const apres = valeurTexte(v.statutApres);
  const libelleApres = libelle(STATUTS, apres, apres);
  const pourEquipe = valeurTexte(v.cote) === 'equipe';

  if (pourEquipe) {
    return {
      /* Un statut inconnu ne s'écrit pas « inconnu » : l'objet s'arrête. */
      objet: objetAvecNumero(numero, avecDetail('Statut modifié par le client', libelleApres)),
      ...rendreGabarit({
        titre: 'Statut modifié par le client',
        intro: ecrire(BONJOUR_EQUIPE, `Le client a modifié le statut de ${laDemande(numero, titre)} depuis son espace.`),
        faits: [
          ['Demande', numero],
          ['Titre', titre],
          ['Statut précédent', libelle(STATUTS, v.statutAvant)],
          ['Nouveau statut', libelleApres],
          ['Projet', valeurTexte(v.projetNom)],
        ],
        bouton: { libelle: 'Voir la demande', url: valeurTexte(v.lien) || lienEspace() },
        marque: MARQUE_EQUIPE,
      }),
    };
  }

  /* Un statut hors nomenclature ne doit pas produire une phrase tronquée. */
  const phrase = PHRASES_STATUT[apres]
    || (apres ? `est passée au statut « ${libelleApres} »` : 'a été mise à jour');
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['par'], secours: ['clientNom'] }));
  return {
    objet: objetAvecNumero(numero, `Votre demande ${phrase}`),
    ...rendreGabarit({
      titre: `Votre demande ${phrase}`,
      intro: ecrire(bonjour, `Le statut de ${laDemande(numero, titre, 'votre demande')} a été mis à jour.`
        + (apres === 'en-attente-client' ? '\n\nNous avons besoin d\'une précision de votre part pour avancer : vous pouvez nous répondre directement depuis la demande.' : '')
        + (apres === 'a-valider' ? '\n\nLa correction est livrée. Nous vous invitons à la vérifier, puis à la valider depuis la demande.' : '')),
      faits: [
        ['Demande', numero],
        ['Titre', titre],
        ['Statut précédent', libelle(STATUTS, v.statutAvant)],
        ['Nouveau statut', libelleApres],
        ['Projet', valeurTexte(v.projetNom)],
      ],
      bouton: { libelle: 'Voir la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 4. Assignation, adressée à l'assigné. */
function assignation(v, ctx) {
  const numero = valeurTexte(v.numero);
  const titre = valeurTexte(v.titre);
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['assigneNom'] }));
  return {
    objet: objetAvecNumero(numero, avecDetail('Demande assignée', titre)),
    ...rendreGabarit({
      titre: 'Une demande vous est assignée',
      intro: ecrire(bonjour, `${majuscule(laDemande(numero, titre))} vous est désormais assignée.`),
      faits: [
        ['Demande', numero],
        ['Titre', titre],
        ['Projet', valeurTexte(v.projetNom)],
        ['Type', libelle(TYPES, v.type)],
        ['Urgence', libelle(URGENCES, v.urgence)],
        ['Statut', libelle(STATUTS, v.statut)],
      ],
      bouton: { libelle: 'Traiter la demande', url: valeurTexte(v.lien) || lienEspace() },
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* 5. Nouveau message sur une demande, vers l'autre partie. */
function message(v, ctx) {
  const numero = valeurTexte(v.numero);
  const titre = valeurTexte(v.titre);
  const auteur = valeurTexte(v.auteurNom).trim();
  const versEquipe = valeurTexte(v.cote) === 'equipe';
  const faits = [
    ['Demande', numero],
    ['Projet', valeurTexte(v.projetNom)],
    ['Statut', libelle(STATUTS, v.statut)],
  ];

  if (versEquipe) {
    return {
      objet: objetAvecNumero(numero, `Réponse du client${auteur ? ` (${auteur})` : ''}`),
      ...rendreGabarit({
        titre: 'Le client a répondu',
        intro: ecrire(BONJOUR_EQUIPE, `${auteur || 'Le client'} a écrit sur ${laDemande(numero, titre, 'la demande', true)}.`),
        faits,
        citation: extrait(v.texte, 1200),
        bouton: { libelle: 'Répondre', url: valeurTexte(v.lien) || lienEspace() },
        note: 'Répondez depuis la demande : une réponse par e-mail ne serait pas rattachée à la demande.',
        marque: MARQUE_EQUIPE,
      }),
    };
  }

  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['par'] }));
  return {
    objet: objetAvecNumero(numero, 'Nouveau message sur votre demande'),
    ...rendreGabarit({
      titre: 'Nouveau message sur votre demande',
      intro: ecrire(bonjour, `${auteur || 'Notre équipe'} vous a écrit au sujet de ${laDemande(numero, titre, 'votre demande', true)}.`),
      faits,
      citation: extrait(v.texte, 1200),
      bouton: { libelle: 'Répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Merci de répondre depuis votre espace : une réponse par e-mail ne serait pas rattachée à la demande.',
    }),
  };
}

/* 6. Demande terminée. */
function resolu(v, ctx) {
  const numero = valeurTexte(v.numero);
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['par'], secours: ['clientNom'] }));
  return {
    objet: objetAvecNumero(numero, 'Votre demande est terminée'),
    ...rendreGabarit({
      titre: 'Votre demande est terminée',
      intro: ecrire(bonjour, `${majuscule(laDemande(numero, v.titre, 'votre demande'))} est terminée.\n\n`
        + 'Si le problème se reproduit, vous pouvez la rouvrir depuis votre espace pendant sept jours. Au-delà, ouvrez une nouvelle demande depuis sa fiche : elle restera liée à celle-ci.'),
      faits: [
        ['Demande', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Terminée le', dateFr(v.date)],
      ],
      bouton: { libelle: 'Voir la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 7. Demande fermée. */
function ferme(v, ctx) {
  const numero = valeurTexte(v.numero);
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['par'], secours: ['clientNom'] }));
  return {
    objet: objetAvecNumero(numero, 'Votre demande est fermée'),
    ...rendreGabarit({
      titre: 'Votre demande est fermée',
      intro: ecrire(bonjour, `${majuscule(laDemande(numero, v.titre, 'votre demande'))} est fermée. `
        + 'Elle reste consultable dans votre espace, avec tout son historique.\n\n'
        + 'Une demande fermée ne peut pas être rouverte. Si le sujet revient, ouvrez une nouvelle demande : nous y retrouverons le contexte.'),
      faits: [
        ['Demande', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Fermée le', dateFr(v.date)],
      ],
      bouton: { libelle: 'Consulter la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 8. Devis déposé, vers le client. Le nom figé (« clientNom ») est celui
   du client du projet, parfois une société : il ne sert qu'à défaut des
   destinataires de l'envoi. */
const NOM_FINANCE = { destinataire: ['par'], secours: ['clientNom'] };

function devis(v, ctx) {
  const numero = valeurTexte(v.numero);
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_FINANCE));
  return {
    objet: objetAvecNumero(numero, avecDetail('Votre devis', valeurTexte(v.libelle) || 'prestation')),
    ...rendreGabarit({
      titre: 'Votre devis est disponible',
      intro: ecrire(bonjour, `Le devis${numero ? ` ${numero}` : ''} est disponible dans votre espace, rubrique « Devis et factures ». Vous pouvez le télécharger, puis l'accepter ou le refuser depuis sa fiche.`),
      faits: [
        ['Devis', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant', somme(v, v.ttc, v.montant)],
        ligneFranchise(v),
        ['Projet', valeurTexte(v.projetNom)],
        ['Valable jusqu\'au', dateFr(v.echeance)],
      ],
      bouton: { libelle: 'Voir le devis', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Votre réponse est horodatée dans votre espace et vaut accord ou refus, sans autre formalité.',
    }),
  };
}

/* 9. Réponse du client à un devis, vers l'équipe. */
function devisReponse(v) {
  const numero = valeurTexte(v.numero);
  const projet = valeurTexte(v.projetNom).trim();
  const accepte = valeurTexte(v.reponse) === 'accepte';
  const verdict = accepte ? 'accepté' : 'refusé';
  return {
    objet: objetAvecNumero(numero, `Devis ${verdict}${projet ? ` · ${projet}` : ''}`),
    ...rendreGabarit({
      titre: `Devis ${verdict}`,
      intro: ecrire(BONJOUR_EQUIPE, `${valeurTexte(v.clientNom).trim() || 'Le client'} a ${verdict} le devis${numero ? ` ${numero}` : ''}${projet ? ` du projet ${projet}` : ''}.`),
      faits: [
        ['Devis', numero],
        ['Objet', valeurTexte(v.libelle)],
        ...(franchiseDe(v)
          ? [['Montant', euros(Number.isFinite(Number(v.ttc)) ? v.ttc : v.montant)], ligneFranchise(v)]
          : [['Montant HT', montantHT(v.montant)], ['Montant TTC', montantTTCSeul(v.ttc)]]),
        ['Projet', projet],
        ['Réponse', accepte ? 'Accepté' : 'Refusé'],
        ['Répondu le', dateFr(v.date)],
        /* Le motif d'un refus, ou le mot laissé avec l'acceptation. */
        valeurTexte(v.commentaire).trim() ? [accepte ? 'Commentaire du client' : 'Motif du refus', valeurTexte(v.commentaire)] : ['', ''],
      ],
      bouton: { libelle: 'Ouvrir dans le Cockpit', url: valeurTexte(v.lien) || lienEspace() },
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* 10. Facture déposée, vers le client. */
function facture(v, ctx) {
  const numero = valeurTexte(v.numero);
  const echeance = dateFr(v.echeance);
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_FINANCE));
  return {
    objet: objetAvecNumero(numero, avecDetail('Votre facture', valeurTexte(v.libelle) || 'prestation')),
    ...rendreGabarit({
      titre: 'Votre facture est disponible',
      intro: ecrire(bonjour, `La facture${numero ? ` ${numero}` : ''} est disponible dans votre espace${v.avecPdf ? ', avec son fichier PDF' : ''}.`
        + (echeance ? ` Son règlement est attendu au plus tard le ${echeance}.` : '')),
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant', somme(v, v.ttc, v.montant)],
        ligneFranchise(v),
        ['Projet', valeurTexte(v.projetNom)],
        ['Échéance', echeance],
      ],
      bouton: { libelle: 'Voir la facture', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Pour toute question sur cette facture, ouvrez une demande depuis votre espace : nous vous répondrons rapidement.',
    }),
  };
}

/* 10 bis. L'échéance approche : trois jours avant, une fois. */
function factureEcheance(v, ctx) {
  const numero = valeurTexte(v.numero);
  const echeance = dateFr(v.echeance);
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_FINANCE));
  /* Sans date, l'objet ne s'arrête pas sur « avant le ». */
  const titre = echeance ? `Facture à régler avant le ${echeance}` : 'Facture bientôt à échéance';
  return {
    objet: objetAvecNumero(numero, titre),
    ...rendreGabarit({
      titre,
      intro: ecrire(bonjour, `Nous vous rappelons que la facture${numero ? ` ${numero}` : ''} arrive à échéance${echeance ? ` le ${echeance}` : ' prochainement'}. `
        + 'Si le règlement a déjà été effectué, merci de le déclarer depuis la fiche de la facture : nous le confirmerons dès réception.'),
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Reste à payer', somme(v, v.reste, v.reste)],
        ligneFranchise(v),
        ['Projet', valeurTexte(v.projetNom)],
        ['Échéance', echeance],
      ],
      bouton: { libelle: 'Voir la facture', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Les coordonnées de règlement figurent sur la fiche de la facture, dans votre espace.',
    }),
  };
}

/* 10 ter. L'échéance est passée : la facture est en retard, une fois. */
function factureRetard(v, ctx) {
  const numero = valeurTexte(v.numero);
  const echeance = dateFr(v.echeance);
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_FINANCE));
  return {
    objet: objetAvecNumero(numero, 'Facture en attente de règlement'),
    ...rendreGabarit({
      titre: 'Une facture a dépassé son échéance',
      intro: ecrire(bonjour, `Sauf erreur de notre part, le règlement de la facture${numero ? ` ${numero}` : ''}${echeance ? `, attendu avant le ${echeance},` : ''} ne nous est pas encore parvenu. `
        + 'Si le virement a été effectué, merci de le déclarer depuis la fiche de la facture. Dans le cas contraire, nous vous remercions de procéder au règlement dans les meilleurs délais.\n\n'
        + 'Pour toute question ou difficulté, ouvrez une demande depuis votre espace : nous restons à votre disposition.'),
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Reste à payer', somme(v, v.reste, v.reste)],
        ligneFranchise(v),
        ['Projet', valeurTexte(v.projetNom)],
        ['Échéance dépassée', echeance],
      ],
      bouton: { libelle: 'Voir la facture', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 10 quater. Le client déclare avoir réglé, vers l'équipe. */
function reglementDeclare(v) {
  const numero = valeurTexte(v.numero);
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: objetAvecNumero(numero, `Règlement déclaré${projet ? ` · ${projet}` : ''}`),
    ...rendreGabarit({
      titre: 'Un règlement déclaré par le client',
      intro: ecrire(BONJOUR_EQUIPE, `${valeurTexte(v.par).trim() || 'Le client'} déclare avoir réglé la facture${numero ? ` ${numero}` : ''}${projet ? ` du projet ${projet}` : ''}. `
        + 'Dès réception, enregistrez le paiement dans le Cockpit : le client verra alors son règlement confirmé.'),
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant déclaré', somme(v, v.montant, v.montant)],
        ['Réglé le', dateFr(v.date)],
        ['Moyen', valeurTexte(v.moyen)],
        ['Référence', valeurTexte(v.reference)],
        ['Reste à payer avant ce règlement', somme(v, v.reste, v.reste)],
        ligneFranchise(v),
      ],
      bouton: { libelle: 'Ouvrir dans le Cockpit', url: valeurTexte(v.lien) || lienEspace() },
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* ==========================================================================
   5. Les modèles du hub : tâches, versions, fichiers, réunions, validations,
   conversation, qualification, nouveaux projets
   ========================================================================== */

const QUALIFS = { 'incluse': 'incluse au contrat', 'hors-perimetre': 'hors du périmètre prévu', 'a-chiffrer': 'à chiffrer', 'offerte': 'offerte' };
const CHANGEMENTS = { nouveau: 'Nouveau', amelioration: 'Amélioration', correction: 'Correction', technique: 'Technique' };
/* La plupart des lettres du hub ne figent aucun nom : elles saluent le
   destinataire de l'envoi, ou personne. */
const NOM_ENVOI = { destinataire: ['par'] };

function tacheAttente(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, avecDetail('Votre retour est attendu', v.titre)),
    ...rendreGabarit({
      titre: 'Votre retour est attendu',
      intro: ecrire(bonjour, `Pour avancer sur ${projet ? `le projet ${projet}` : 'votre projet'}, nous avons besoin de votre retour sur le point suivant.`),
      faits: [['Tâche', valeurTexte(v.titre)], ['Détail', valeurTexte(v.description)]],
      bouton: { libelle: 'Voir et répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Répondez directement depuis la fiche de la tâche, avec un fichier si nécessaire : nous en sommes aussitôt informés.',
    }),
  };
}

/* La réponse du client sur une tâche, vers l'équipe. */
function tacheReponse(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const par = valeurTexte(v.par).trim();
  const titre = valeurTexte(v.titre).trim();
  return {
    objet: objetDuProjet(projet, avecDetail('Réponse du client sur une tâche', titre)),
    ...rendreGabarit({
      titre: 'Le client a répondu sur une tâche',
      intro: ecrire(BONJOUR_EQUIPE, `${par || 'Le client'} a répondu sur la tâche${titre ? ` « ${titre} »` : ''}${projet ? ` du projet ${projet}` : ''}. Elle est passée à l'état « Réponse reçue » et revient de votre côté.`),
      faits: [['Tâche', titre], ['Pièces jointes', Number(v.pieces) > 0 ? String(v.pieces) : '']],
      citation: valeurTexte(v.texte),
      bouton: { libelle: 'Ouvrir la tâche', url: valeurTexte(v.lien) || lienEspace() },
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* Un point bloquant de son côté : ce qu'on attend de lui, pour quand, et
   la fiche où dire « C'est fait ». */
function blocageClient(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, avecDetail('Une action est attendue de votre part', v.titre)),
    ...rendreGabarit({
      titre: 'Une action est attendue de votre part',
      intro: ecrire(bonjour, `Pour avancer sur ${projet ? `le projet ${projet}` : 'votre projet'}, un point dépend de vous. Voici ce que nous attendons, et dans quel délai.`),
      faits: [
        ['Point bloquant', valeurTexte(v.titre)],
        ['Ce que nous attendons', valeurTexte(v.attendu)],
        ['Attendu pour le', dateFr(v.echeance)],
        ['Détail', valeurTexte(v.description)],
      ],
      bouton: { libelle: 'Voir le point bloquant', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Depuis la fiche, indiquez-nous « C\'est fait » une fois le point réglé, ou écrivez-nous si quelque chose vous en empêche.',
    }),
  };
}

function release(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const version = valeurTexte(v.version).trim();
  const notes = Array.isArray(v.notes) ? v.notes : [];
  const store = lienSur(v.lienStore);
  const titre = version ? `Version ${version} disponible` : 'Nouvelle version disponible';
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, titre),
    ...rendreGabarit({
      titre,
      intro: ecrire(bonjour, `Une nouvelle version${projet ? ` de ${projet}` : ''} est disponible${valeurTexte(v.titre).trim() ? ` : ${valeurTexte(v.titre).trim()}` : ''}.`),
      faits: notes.slice(0, 12).map((n) => [CHANGEMENTS[(n || {}).type] || 'Changement', valeurTexte((n || {}).texte)]),
      bouton: store
        ? { libelle: 'Télécharger la mise à jour', url: store }
        : { libelle: 'Voir les changements', url: valeurTexte(v.lien) || lienEspace() },
      /* Avec le lien du store, le détail des changements reste à un clic,
         sous le bouton : plus d'adresse nue dans la note. */
      second: store ? { libelle: 'Voir le détail des changements dans votre espace', url: valeurTexte(v.lien) } : null,
    }),
  };
}

function fichier(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  if (v.cote === 'equipe') {
    const par = valeurTexte(v.par).trim();
    return {
      objet: objetDuProjet(projet, par ? `Fichier déposé par ${par}` : 'Fichier déposé par le client'),
      ...rendreGabarit({
        titre: 'Un client a déposé un fichier',
        intro: ecrire(BONJOUR_EQUIPE, `${par || 'Le client'} a déposé un fichier${projet ? ` sur le projet ${projet}` : ''}.`),
        faits: [['Fichier', valeurTexte(v.nom)], ['Catégorie', valeurTexte(v.categorie)]],
        bouton: { libelle: 'Ouvrir les fichiers', url: valeurTexte(v.lien) || lienEspace() },
        marque: MARQUE_EQUIPE,
      }),
    };
  }
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, 'Nouveau fichier disponible'),
    ...rendreGabarit({
      titre: 'Un nouveau fichier vous attend',
      intro: ecrire(bonjour, `Un fichier vient d'être ajouté à votre espace${projet ? ` du projet ${projet}` : ''}.`),
      faits: [['Fichier', valeurTexte(v.nom)], ['Catégorie', valeurTexte(v.categorie)]],
      bouton: { libelle: 'Ouvrir les fichiers', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* Les informations d'une réunion, dans le même ordre partout. */
const faitsReunion = (v) => [
  ['Objet', valeurTexte(v.titre)],
  ['Date', valeurTexte(v.date)],
  ['Durée', Number(v.duree) > 0 ? `${valeurTexte(v.duree)} min` : ''],
  ['Lieu', valeurTexte(v.lieu)],
  ['Visioconférence', valeurTexte(v.lienVisio)],
  ['Ordre du jour', valeurTexte(v.ordreDuJour)],
];
/* Le bouton mène à la visio quand il y en a une ; la fiche de la réunion,
   d'où se prend le fichier d'agenda, reste alors à un clic, sous lui. */
function liensReunion(v) {
  const visio = lienSur(v.lienVisio);
  const fiche = valeurTexte(v.lien) || lienEspace();
  return visio
    ? { bouton: { libelle: 'Rejoindre la réunion', url: visio }, second: { libelle: 'Voir la réunion et ajouter à mon agenda', url: fiche }, note: '' }
    : { bouton: { libelle: 'Voir la réunion', url: fiche }, second: null, note: "Le fichier d'agenda se télécharge depuis la fiche de la réunion." };
}

function reunion(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const quoi = v.deplacee ? 'Réunion déplacée' : 'Réunion programmée';
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, avecDetail(quoi, v.titre)),
    ...rendreGabarit({
      titre: quoi,
      intro: ecrire(bonjour, v.deplacee
        ? `La réunion ci-dessous${projet ? `, sur le projet ${projet},` : ''} a été déplacée. Voici ses nouvelles informations.`
        : `Une réunion a été programmée${projet ? ` sur le projet ${projet}` : ''}. Voici ses informations.`),
      faits: faitsReunion(v),
      ...liensReunion(v),
    }),
  };
}

/* La veille d'une réunion, à 17 h : un rappel, une seule fois. */
function reunionRappel(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const titre = valeurTexte(v.titre).trim();
  const heure = valeurTexte(v.heure).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, `Rappel : ${titre ? `${titre}, ` : 'votre réunion, '}demain${heure ? ` à ${heure}` : ''}`),
    ...rendreGabarit({
      titre: 'Rappel : votre réunion a lieu demain',
      intro: ecrire(bonjour, `Nous vous rappelons la réunion prévue demain${heure ? ` à ${heure}` : ''}${projet ? ` sur le projet ${projet}` : ''}.`),
      faits: faitsReunion(v),
      ...liensReunion(v),
    }),
  };
}

function validationDemandee(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, avecDetail('Votre validation est attendue', v.titre)),
    ...rendreGabarit({
      titre: 'Votre validation est attendue',
      intro: ecrire(bonjour, `Nous avons besoin de votre accord pour poursuivre${projet ? ` le projet ${projet}` : ''}.`),
      faits: [['À valider', valeurTexte(v.titre)], ['Points à examiner', valeurTexte(v.description)]],
      bouton: { libelle: 'Examiner et répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Vous pouvez approuver, ou demander des modifications en laissant un commentaire.',
    }),
  };
}

function validationReponse(v) {
  const approuvee = v.statut === 'approuvee';
  const quoi = approuvee ? 'Validation approuvée' : 'Modifications demandées';
  const titre = valeurTexte(v.titre).trim();
  return {
    objet: objetDuProjet(v.projetNom, avecDetail(quoi, titre)),
    ...rendreGabarit({
      titre: quoi,
      intro: ecrire(BONJOUR_EQUIPE, `${valeurTexte(v.par).trim() || 'Le client'} a répondu à la demande de validation${titre ? ` « ${titre} »` : ''}.`),
      faits: [['Réponse', approuvee ? 'Approuvée' : 'Modifications demandées'], ['Commentaire', valeurTexte(v.commentaire)]],
      bouton: { libelle: 'Ouvrir dans le Cockpit', url: valeurTexte(v.lien) || lienEspace() },
      marque: MARQUE_EQUIPE,
    }),
  };
}

function messageProjet(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const versEquipe = v.cote === 'equipe';
  const auteur = valeurTexte(v.auteur).trim();
  const pieces = Number(v.pieces) > 0 ? [['Pièces jointes', String(Number(v.pieces))]] : [];
  if (versEquipe) {
    return {
      objet: objetDuProjet(projet, `Message de ${auteur || 'votre client'}`),
      ...rendreGabarit({
        titre: `${auteur || 'Le client'} vous écrit`,
        intro: ecrire(BONJOUR_EQUIPE, `${auteur || 'Le client'} a envoyé un message${projet ? ` sur le projet ${projet}` : ''}.`),
        faits: pieces,
        citation: extrait(v.texte, 1200),
        bouton: { libelle: 'Répondre', url: valeurTexte(v.lien) || lienEspace() },
        marque: MARQUE_EQUIPE,
      }),
    };
  }
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, `Nouveau message de ${auteur || 'Capmedia'}`),
    ...rendreGabarit({
      titre: `${auteur || 'Notre équipe'} vous écrit`,
      intro: ecrire(bonjour, `${auteur || 'Notre équipe'} vous a envoyé un message${projet ? ` sur le projet ${projet}` : ''}.`),
      faits: pieces,
      citation: extrait(v.texte, 1200),
      bouton: { libelle: 'Répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Répondez depuis votre espace : la conversation y reste complète.',
    }),
  };
}

const TITRES_QUALIF = {
  'a-chiffrer': 'Un devis va vous être proposé',
  'hors-perimetre': 'Cette demande sort du périmètre prévu',
  'incluse': 'Cette demande est incluse au contrat',
  'offerte': 'Cette demande vous est offerte',
};
const SUITES_QUALIF = {
  'a-chiffrer': 'Nous vous proposerons un devis avant tout développement.',
  'hors-perimetre': 'Nous revenons vers vous pour en discuter ou vous proposer un chiffrage.',
  'incluse': 'Elle sera traitée dans le cadre de votre contrat.',
  'offerte': 'Elle sera réalisée sans frais supplémentaires.',
};

function qualification(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const cle = valeurTexte(v.qualification);
  const q = QUALIFS[cle] || cle;
  const titre = valeurTexte(v.titre).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, objetAvecNumero(v.numero, q ? `Demande ${q}` : 'Demande qualifiée')),
    ...rendreGabarit({
      titre: TITRES_QUALIF[cle] || 'Votre demande a été étudiée',
      intro: ecrire(bonjour, `Nous avons étudié votre demande${titre ? ` « ${titre} »` : ''}.${q ? ` Elle est ${q}.` : ''}${SUITES_QUALIF[cle] ? ` ${SUITES_QUALIF[cle]}` : ''}`),
      faits: [['Demande', valeurTexte(v.numero)], ['Titre', titre]],
      bouton: { libelle: 'Voir la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

function preprojet(v, ctx) {
  const titre = valeurTexte(v.titre).trim();
  if (v.cote === 'equipe') {
    const par = valeurTexte(v.par).trim();
    const email = valeurTexte(v.email).trim();
    const qui = par && email ? `${par} (${email})` : (par || email || 'Un client');
    return {
      objet: avecDetail('Nouveau projet demandé', titre),
      ...rendreGabarit({
        titre: 'Un client décrit un nouveau projet',
        intro: ecrire(BONJOUR_EQUIPE, `${qui} vient de décrire un nouveau projet.`),
        faits: [['Titre', titre], ['Type', valeurTexte(v.type)], ['Budget', valeurTexte(v.budget)], ['Délai', valeurTexte(v.delai)], ['Idée', valeurTexte(v.idee).slice(0, 600)]],
        bouton: { libelle: 'Ouvrir la demande', url: valeurTexte(v.lien) || lienEspace() },
        marque: MARQUE_EQUIPE,
      }),
    };
  }
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: avecDetail('Votre demande de projet est bien reçue', titre),
    ...rendreGabarit({
      titre: 'Votre demande est bien reçue',
      intro: ecrire(bonjour, 'Merci pour votre demande. Nous l\'étudions et revenons vers vous rapidement pour en discuter dans votre espace.'),
      faits: [['Projet', titre]],
      bouton: { libelle: 'Suivre ma demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/*
 * La maintenance continue. Vers l'équipe : le client demande un forfait,
 * ou propose une évolution. Vers le client : l'état de son forfait change.
 */
const TITRES_MAINTENANCE = {
  proposition: 'Une proposition de maintenance vous attend',
  actif: 'Votre forfait de maintenance est en cours',
  suspendu: 'Votre forfait de maintenance est suspendu',
  termine: 'Votre forfait de maintenance est terminé',
};
const INTROS_MAINTENANCE = {
  proposition: "Nous avons préparé une proposition de forfait de maintenance continue pour votre projet : ce qui est compris, le rythme et les délais. Elle est consultable dans votre espace, où le devis correspondant vous attend. Rien n'est engagé tant que vous ne l'avez pas accepté.",
  actif: 'Votre forfait est actif. Chaque journée travaillée et chaque évolution livrée apparaîtront dans votre espace, au fur et à mesure.',
  suspendu: 'Votre forfait est mis en pause. Les séquences et les évolutions restent consultables dans votre espace. Vous pourrez le reprendre à tout moment depuis votre page Maintenance, avec le bouton « Reprendre le forfait ».',
  termine: 'Votre forfait est arrivé à son terme. Son historique reste consultable dans votre espace, et vous pouvez le reprendre à tout moment.',
};
const PERIODES = { mensuelle: 'mois', trimestrielle: 'trimestre', annuelle: 'an' };

function maintenance(v, ctx) {
  const projet = valeurTexte(v.projet).trim();
  if (v.cote === 'equipe') {
    const evolution = v.evenement === 'evolution';
    const par = valeurTexte(v.par).trim();
    const email = valeurTexte(v.email).trim();
    const qui = par && email ? `${par} (${email})` : (par || email || 'Le client');
    return {
      objet: objetDuProjet(projet, evolution ? 'Évolution proposée par le client' : 'Forfait de maintenance demandé'),
      ...rendreGabarit({
        titre: evolution ? 'Le client propose une évolution' : 'Le client demande un forfait de maintenance',
        intro: ecrire(BONJOUR_EQUIPE, `${qui} vient d'écrire depuis son espace${projet ? `, sur le projet ${projet}` : ''}.`),
        faits: [['Projet', projet], evolution ? ['Évolution', valeurTexte(v.titre)] : ['Rythme souhaité', valeurTexte(v.rythme)]],
        citation: valeurTexte(v.message),
        bouton: { libelle: 'Ouvrir la maintenance', url: valeurTexte(v.lien) || lienEspace() },
        marque: MARQUE_EQUIPE,
      }),
    };
  }
  const periode = PERIODES[valeurTexte(v.periode)] || 'mois';
  const evenement = valeurTexte(v.evenement);
  const titre = TITRES_MAINTENANCE[evenement] || 'Votre forfait de maintenance a évolué';
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, titre),
    ...rendreGabarit({
      titre,
      intro: ecrire(bonjour, INTROS_MAINTENANCE[evenement] || 'Votre forfait de maintenance a évolué. Le détail est consultable dans votre espace.'),
      faits: [
        ['Projet', projet],
        ['Formule', valeurTexte(v.formule)],
        Number(v.montant) ? ['Montant', `${franchiseDe({ tva: v.tva }) ? euros(v.montant) : montantHT(v.montant)} par ${periode}`] : ['', ''],
        Number(v.montant) ? ligneFranchise({ tva: v.tva }) : ['', ''],
        Number(v.jours) ? ['Jours de travail', `${valeurTexte(v.jours)} par ${periode}`] : ['', ''],
      ],
      bouton: { libelle: 'Voir la maintenance', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/*
 * Une évolution de maintenance change de sort : acceptée, planifiée, livrée,
 * écartée. Préférence « Vie du projet ».
 */
const TITRES_EVOLUTION = {
  acceptee: 'Votre évolution est acceptée',
  planifiee: 'Votre évolution est planifiée',
  livree: 'Votre évolution est livrée',
  refusee: 'Votre évolution n\'est pas retenue',
  proposee: 'Votre évolution est de nouveau à l\'étude',
};
const INTROS_EVOLUTION = {
  acceptee: 'Nous avons accepté votre évolution. Sa planification vous sera indiquée sur votre page Maintenance.',
  planifiee: 'Votre évolution est planifiée. Chaque journée de travail qui lui sera consacrée apparaîtra dans votre espace.',
  livree: 'Votre évolution est livrée. Si quelque chose ne vous convient pas, ouvrez une demande depuis votre espace.',
  refusee: 'Après étude, nous ne donnerons pas suite à cette évolution.',
  proposee: 'Votre évolution est de nouveau à l\'étude. Aucune décision n\'est prise pour le moment.',
};

function evolutionStatut(v, ctx) {
  const projet = valeurTexte(v.projet).trim();
  const etat = valeurTexte(v.statut);
  const reponse = valeurTexte(v.reponse).trim();
  const titre = TITRES_EVOLUTION[etat] || 'Votre évolution a été mise à jour';
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, titre),
    ...rendreGabarit({
      titre,
      intro: ecrire(bonjour, (INTROS_EVOLUTION[etat] || 'Votre évolution a été mise à jour. Le détail est consultable dans votre espace.')
        + (etat === 'refusee' ? (reponse ? ' Vous trouverez nos explications ci-dessous.' : ' N\'hésitez pas à nous écrire pour en discuter.') : '')),
      faits: [['Projet', projet], ['Évolution', valeurTexte(v.titre)], ['Séquence', valeurTexte(v.sequence)], ['Version', valeurTexte(v.version)]],
      citation: reponse,
      bouton: { libelle: 'Voir la maintenance', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/*
 * La relance hebdomadaire. Elle ne part que s'il y a vraiment quelque
 * chose, et elle liste quoi.
 */
function relance(v, ctx) {
  const lignes = Array.isArray(v.points) ? v.points : [];
  const n = lignes.length;
  const projet = valeurTexte(v.projet).trim();
  const resume = n > 1 ? `${n} points attendent votre réponse` : 'Un point attend votre réponse';
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, resume),
    ...rendreGabarit({
      titre: resume,
      intro: ecrire(bonjour, `Rien d'urgent de notre côté, mais ${n > 1 ? 'ces points sont bloqués' : 'ce point est bloqué'} tant que nous n'avons pas votre retour${projet ? ` sur le projet ${projet}` : ''}. `
        + `${n > 1 ? 'Ils se traitent' : 'Il se traite'} en quelques minutes depuis votre espace.`),
      faits: lignes.slice(0, 8).map((l) => [valeurTexte((l || {}).quoi), valeurTexte((l || {}).detail)]),
      bouton: { libelle: 'Voir ce qui vous attend', url: valeurTexte(v.lien) || lienEspace() },
      note: "Vous recevez ce rappel au plus une fois par semaine, et seulement si des points vous attendent. Il s'arrête dès que la liste est vide.",
    }),
  };
}

/*
 * Le code de connexion. Rien d'autre dans la lettre : pas de lien à
 * cliquer, donc rien à détourner. Le code se lit, se recopie, et meurt.
 */
function code(v, ctx) {
  const chiffres = valeurTexte(v.code);
  const minutes = Number(v.minutes) || 10;
  const bonjour = salutation(nomDuDestinataire(v, ctx));
  return {
    objet: `${chiffres} est votre code de connexion`,
    ...rendreGabarit({
      titre: 'Votre code de connexion',
      intro: ecrire(bonjour, "Voici votre code de connexion. Saisissez-le dans la page de connexion, sur l'appareil où vous venez de le demander.\n\n"
        + `Il est valable ${minutes} minutes et ne sert qu'une fois.`),
      /* Les six chiffres collés, sans espace : un double-clic ou un appui long
         les sélectionne d'un coup, et le collage arrive entier. */
      faits: [['Code', chiffres]],
      code: chiffres,
      note: "Si vous n'avez rien demandé, ignorez ce message : sans ce code, personne n'entre. Ne le transmettez à personne, nous ne vous le demanderons jamais.",
      /* La porte de connexion est commune : le badge dit « Suite », ou
         « Cockpit » pour une personne de l'équipe. */
      marque: { signature: SIGNATURE, pied: 'Cet e-mail fait suite à une demande de connexion avec votre adresse.', service: v.equipe === true ? 'Cockpit' : 'Suite' },
    }),
  };
}

/* L'arrivée dans l'équipe. */
function invitationEquipe(v, ctx) {
  const admin = valeurTexte(v.role) === 'admin';
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['nom'] }));
  return {
    objet: 'Votre accès au Cockpit Capmedia',
    ...rendreGabarit({
      titre: "Bienvenue dans l'équipe",
      intro: ecrire(bonjour, `Un accès au Cockpit Capmedia vient de vous être ouvert, avec le rôle ${admin ? 'd\'administrateur' : 'd\'agent'}. `
        + (admin ? "Vous voyez tous les projets et vous administrez l'équipe." : 'Vous voyez les projets sur lesquels vous intervenez.')
        + '\n\nLa connexion se fait sans mot de passe : saisissez votre adresse, et un code à six chiffres, valable cinq minutes, vous est envoyé.'),
      faits: [['Votre adresse', valeurTexte(v.email)], ['Rôle', admin ? 'Administrateur' : 'Agent']],
      bouton: { libelle: 'Ouvrir le Cockpit', url: valeurTexte(v.lien) || lienEspace() },
      note: "Si vous n'attendiez pas cet accès, ignorez cet e-mail et prévenez-nous.",
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* L'alerte d'ouverture d'une session d'équipe : le Cockpit voit tous les
   projets, une ouverture qu'on n'a pas faite doit se remarquer. */
function connexionEquipe(v, ctx) {
  const bonjour = salutation(nomDuDestinataire(v, ctx));
  return {
    objet: "Une session du Cockpit vient de s'ouvrir",
    ...rendreGabarit({
      titre: 'Session du Cockpit ouverte',
      intro: ecrire(bonjour, "Une session du Cockpit vient d'être ouverte avec votre adresse. Si c'est bien vous, aucune action n'est nécessaire."),
      faits: [['Date', valeurTexte(v.quand)], ['Adresse IP', valeurTexte(v.ip)]],
      note: "Si ce n'est pas vous, sécurisez immédiatement l'accès à votre boîte e-mail : c'est elle qui permet d'ouvrir le Cockpit.",
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* ==========================================================================
   6. Les tests : lettres aux testeurs, à l'équipe et au client
   ========================================================================== */

/* 1 bis. L'invitation d'un testeur. Un testeur n'est membre d'aucun
   projet : il ne voit que les scénarios qu'on lui confie, jamais le reste.
   La lettre le dit, parce que son écran ne ressemble à rien de ce qu'il
   connaît. */
function invitationTesteur(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['prenom'] }));
  const plateformes = (Array.isArray(v.plateformes) ? v.plateformes : [])
    .map((p) => libelle(PLATEFORMES, p, valeurTexte(p))).filter(Boolean).join(', ');
  return {
    objet: objetDuProjet(projet, 'Votre espace de test est ouvert'),
    ...rendreGabarit({
      titre: 'Votre espace de test est ouvert',
      intro: ecrire(bonjour, `Nous vous avons inscrit comme testeur${projet ? ` sur ${projet}` : ''}. Votre mission consiste à dérouler des scénarios précis, `
        + "décrits étape par étape, et à indiquer pour chacun le résultat obtenu : réussi, en échec, ou sans objet.\n\n"
        + "Lorsqu'un scénario échoue, une capture d'écran vous est demandée : c'est elle qui nous permet de reproduire le problème, puis de le corriger.\n\n"
        + "La connexion se fait sans mot de passe : saisissez votre adresse e-mail et vous recevrez un code à six chiffres qui ouvre la session. Ce code est valable quinze minutes et ne sert qu'une fois."),
      faits: [
        ['Projet', projet],
        ['Votre adresse', valeurTexte(v.email)],
        ['Ce que vous testez', plateformes],
      ],
      bouton: { libelle: 'Ouvrir mon espace de test', url: valeurTexte(v.lien) || lienEspace() },
      note: "Connectez-vous avec l'adresse à laquelle vous avez reçu cet e-mail : c'est elle qui ouvre votre espace. Vous n'y voyez que les scénarios qui vous sont confiés, et vous n'avez accès à rien d'autre du projet.",
      marque: MARQUE_TEST,
    }),
  };
}

/* La fin de test d'un testeur : son bilan à l'équipe, tout compté. */
function testeurTermine(v) {
  const echecs = (Array.isArray(v.echecs) ? v.echecs : []).map(valeurTexte).filter(Boolean);
  const qui = valeurTexte(v.testeur).trim() || 'Un testeur';
  const campagne = valeurTexte(v.campagne).trim();
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: avecDetail(`${qui} a terminé le test`, campagne),
    ...rendreGabarit({
      titre: 'Un testeur a terminé',
      intro: ecrire(BONJOUR_EQUIPE, `${qui} a indiqué avoir terminé ses tests sur ${campagne ? `la campagne « ${campagne} »` : 'la campagne'}${projet ? ` (${projet})` : ''}. Ses résultats sont figés ; il peut encore ajouter une remarque pendant sept jours.`),
      faits: [
        ['Testeur', `${qui}${valeurTexte(v.email) ? ` · ${valeurTexte(v.email)}` : ''}`],
        ['Réussis', valeurTexte(v.ok)],
        ['Échecs', valeurTexte(v.ko)],
        ['Sans objet', valeurTexte(v.na)],
        ['Scénarios déroulés', valeurTexte(v.total)],
        ['Temps passé', valeurTexte(v.temps)],
        ['Avis sur l\'application', majuscule(valeurTexte(v.avisDonne))],
        ['Note du test', valeurTexte(v.noteTest)],
        ['Accès jusqu\'au', valeurTexte(v.finAcces)],
      ],
      citation: [valeurTexte(v.noteTestCommentaire) ? `Sur le test : ${valeurTexte(v.noteTestCommentaire)}` : '', ...echecs].filter(Boolean).join('\n'),
      bouton: { libelle: 'Ouvrir la campagne dans le Cockpit', url: valeurTexte(v.lien) },
      note: 'Le client est informé qu\'un testeur a terminé, sans voir son nom. Le détail des réponses et des échecs est dans la campagne.',
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* Une remarque d'un testeur, reprise telle quelle. « libre » : écrite à
   tout moment (campagnes/{c}/remarques), pas seulement après la fin. */
function testeurRemarque(v) {
  const remarques = (Array.isArray(v.remarques) ? v.remarques : []).map(valeurTexte).filter(Boolean);
  const qui = valeurTexte(v.testeur).trim() || 'Un testeur';
  const libre = v.libre === true;
  const scenario = valeurTexte(v.scenario);
  const campagne = valeurTexte(v.campagne).trim();
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: avecDetail(libre ? `Remarque de ${qui}` : `Remarque de ${qui} après son test`, campagne),
    ...rendreGabarit({
      titre: libre ? 'Une remarque d\'un testeur' : 'Une remarque après le test',
      intro: ecrire(BONJOUR_EQUIPE, `${qui} a ajouté la remarque suivante sur ${campagne ? `la campagne « ${campagne} »` : 'la campagne'}${projet ? ` (${projet})` : ''}${libre ? '.' : ', après avoir terminé ses tests.'}`),
      faits: [['Testeur', `${qui}${valeurTexte(v.email) ? ` · ${valeurTexte(v.email)}` : ''}`], ['Scénario', scenario]],
      citation: remarques.join('\n\n'),
      bouton: { libelle: 'Ouvrir la campagne dans le Cockpit', url: valeurTexte(v.lien) },
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* Un message d'un testeur à l'équipe, repris tel quel. */
function messageTesteur(v) {
  const qui = valeurTexte(v.testeur).trim() || 'Un testeur';
  return {
    objet: `Message de ${qui} (testeur)`,
    ...rendreGabarit({
      titre: 'Un testeur vous écrit',
      intro: ecrire(BONJOUR_EQUIPE, `${qui}${valeurTexte(v.email) ? ` (${valeurTexte(v.email)})` : ''} a laissé ce message depuis son espace de test.`),
      citation: valeurTexte(v.texte),
      bouton: { libelle: 'Répondre dans le Cockpit', url: valeurTexte(v.lien) },
      note: 'Votre réponse lui parvient dans son espace, en direct, et par e-mail.',
      marque: MARQUE_EQUIPE,
    }),
  };
}

/* La réponse de l'équipe au testeur. */
function messageTesteurReponse(v, ctx) {
  const auteur = valeurTexte(v.auteur).trim() || 'L\'équipe Capmedia';
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['prenom'] }));
  return {
    objet: `${auteur} vous a répondu`,
    ...rendreGabarit({
      titre: "Une réponse de l'équipe",
      intro: ecrire(bonjour, `${auteur} vous a répondu dans votre espace de test.`),
      citation: valeurTexte(v.texte),
      bouton: { libelle: 'Ouvrir la conversation', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Vous pouvez répondre depuis la bulle de discussion, en bas à droite de votre espace.',
      marque: MARQUE_TEST,
    }),
  };
}

/* La campagne commence : la lettre à chaque testeur qu'on y a mis, au
   moment où elle s'ouvre (ou où on l'y ajoute, campagne déjà ouverte). */
function campagneTesteur(v, ctx) {
  const application = valeurTexte(v.application).trim();
  const n = Number(v.scenarios) || 0;
  const fin = valeurTexte(v.fin).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, { destinataire: ['prenom'] }));
  return {
    objet: objetDuProjet(application, 'Votre campagne de tests commence'),
    ...rendreGabarit({
      titre: 'Votre campagne commence',
      intro: ecrire(bonjour, `La campagne « ${valeurTexte(v.titre).trim() || 'de tests'} » est ouverte${application ? ` : vous testez ${application}` : ''}. `
        + (n ? `${n > 1 ? `${n} scénarios vous attendent` : 'Un scénario vous attend'} dans votre espace.` : 'Vos scénarios arrivent dans votre espace : vous les verrez dès qu\'ils vous seront confiés.')
        + "\n\nPour chacun, indiquez le résultat obtenu : Réussi, Échec ou Sans objet. Pour toute question, la bulle de discussion en bas à droite de votre espace vous met en contact avec l'équipe."),
      faits: [
        ['Application', application],
        ['Vos scénarios', n ? String(n) : ''],
        ['Fin prévue', fin],
      ],
      bouton: { libelle: 'Commencer mes tests', url: valeurTexte(v.lien) || lienEspace() },
      note: "La connexion se fait avec l'adresse à laquelle vous avez reçu cet e-mail, et un code à six chiffres.",
      marque: MARQUE_TEST,
    }),
  };
}

/* Les tests avant la sortie, vus du client : une anomalie trouvée par les
   testeurs ou corrigée, une campagne ouverte ou close. Le client ne voit
   jamais le nom d'un testeur, seulement le scénario et la gravité. */
const GRAVITES_ANOMALIE = { bloquant: 'Bloquante', critique: 'Critique', important: 'Importante', mineur: 'Mineure' };

function anomalie(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const corrigee = v.evenement === 'corrigee';
  const titre = valeurTexte(v.titre).trim();
  const gravite = GRAVITES_ANOMALIE[valeurTexte(v.gravite)] || valeurTexte(v.gravite);
  const quoi = corrigee ? 'Anomalie corrigée' : 'Anomalie relevée par les testeurs';
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  return {
    objet: objetDuProjet(projet, avecDetail(quoi, titre)),
    ...rendreGabarit({
      titre: corrigee ? 'Anomalie corrigée' : 'Une anomalie a été relevée par les testeurs',
      intro: ecrire(bonjour, corrigee
        ? `L'anomalie${titre ? ` « ${titre} »` : ''} est corrigée. Les testeurs vont rejouer le scénario pour le confirmer.`
        : `Lors des tests de ${projet || 'votre application'}, les testeurs ont relevé une anomalie. Nous allons la reproduire, puis la corriger.`),
      faits: [['Scénario', valeurTexte(v.scenario)], ['Gravité', gravite], ['Description', valeurTexte(v.description)]],
      bouton: { libelle: 'Voir l\'anomalie', url: valeurTexte(v.lien) || lienEspace() },
      note: corrigee ? '' : 'Depuis sa fiche, vous pouvez en faire une demande pour en suivre le traitement.',
    }),
  };
}

function campagne(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const close = v.evenement === 'close';
  const titre = valeurTexte(v.titre).trim();
  const quoi = close ? 'Campagne de tests close' : 'Campagne de tests ouverte';
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  const nommee = titre ? `La campagne « ${titre} »` : 'La campagne de tests';
  return {
    objet: objetDuProjet(projet, avecDetail(quoi, titre)),
    ...rendreGabarit({
      titre: quoi,
      intro: ecrire(bonjour, close
        ? `${nommee} est terminée et ses résultats sont figés. Une validation « Bon pour sortie » vous attend dans votre espace : en l'approuvant, vous donnez votre accord pour la mise en ligne.`
        : `${nommee} commence : les testeurs déroulent les scénarios, et vous pouvez suivre les résultats en direct dans votre espace.`),
      faits: [['Scénarios', valeurTexte(v.scenarios)], ['Testeurs', valeurTexte(v.testeurs)], ['Anomalies ouvertes', close ? valeurTexte(v.anomalies) : '']],
      bouton: { libelle: close ? 'Donner mon feu vert' : 'Suivre les tests', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* ==========================================================================
   7. Le récapitulatif des demandes

   Plusieurs lettres de la vie des demandes en attente pour une même
   personne, sur un même projet (voir regroupement.js) : une seule lettre,
   une ligne par demande. Une demande qui a connu plusieurs événements
   pendant l'attente dit son état final (« Nouvelle demande, en cours »).

   Les variables sont figées par regroupement.js :
     projetNom, par (le destinataire), lien (ses demandes),
     lignes: [{ numero, titre, lien, cree, parLEquipe, statut, messages,
                qualification }], total et nouvelles (comptés avant la
     coupe des lignes trop nombreuses)
   ========================================================================== */

/* L'état d'une demande, en bout de ligne. Ce qui est un verbe (« attend
   votre réponse ») se lit seul ; le reste prend « désormais » quand la
   demande n'est pas nouvelle. */
const ETATS_LIGNE = {
  'nouveau': 'reçue',
  'a-analyser': 'à l\'étude',
  'en-attente-client': 'attend votre réponse',
  'acceptee': 'acceptée',
  'planifiee': 'planifiée',
  'en-cours': 'en cours',
  'en-revue': 'en cours de vérification',
  'a-valider': 'attend votre validation',
  'resolu': 'terminée',
  'refuse': 'non retenue',
  'annulee': 'annulée',
  'ferme': 'fermée',
};
const QUALIFS_LIGNE = { 'a-chiffrer': 'un devis va vous être proposé', 'hors-perimetre': 'hors du périmètre prévu' };

/** Ce qui s'est passé sur une demande pendant l'attente, en une phrase. */
function quoiDeLaLigne(l) {
  const x = l || {};
  const parts = [];
  if (x.cree === true) parts.push(x.parLEquipe === true ? 'nouvelle demande ouverte pour vous' : 'nouvelle demande');
  const etatCle = valeurTexte(x.statut);
  const etat = ETATS_LIGNE[etatCle] || (etatCle ? libelle(STATUTS, etatCle, '').toLowerCase() : '');
  if (etat && !(x.cree === true && etatCle === 'nouveau')) {
    parts.push(x.cree === true || /^attend /.test(etat) ? etat : `désormais ${etat}`);
  }
  const q = valeurTexte(x.qualification);
  if (q) parts.push(QUALIFS_LIGNE[q] || (QUALIFS[q] ? `qualifiée ${QUALIFS[q]}` : ''));
  const n = Number(x.messages) || 0;
  if (n > 0) parts.push(n > 1 ? `${n} nouveaux messages` : 'un nouveau message');
  return majuscule(parts.filter(Boolean).join(', ')) || 'Mise à jour';
}

/** Le décompte des lignes : nouvelles demandes, puis mises à jour. */
function resumeRecapitulatif(lignes) {
  const toutes = Array.isArray(lignes) ? lignes : [];
  const nouvelles = toutes.filter((l) => l && l.cree === true).length;
  const maj = toutes.length - nouvelles;
  return { nouvelles, maj };
}

function recapitulatif(v, ctx) {
  const projet = valeurTexte(v.projetNom).trim();
  const bonjour = salutation(nomDuDestinataire(v, ctx, NOM_ENVOI));
  const lignes = (Array.isArray(v.lignes) ? v.lignes : []).filter((l) => l && typeof l === 'object');
  /* Le décompte porte sur toutes les demandes, même celles qu'une lettre
     trop longue n'affiche pas : « total » et « nouvelles » les comptent
     avant la coupe (regroupement.js). */
  const total = Math.max(Number(v.total) || 0, lignes.length);
  const nouvelles = Math.min(total, Math.max(Number(v.nouvelles) || 0, resumeRecapitulatif(lignes).nouvelles));
  const maj = total - nouvelles;
  const dit = [];
  if (nouvelles) dit.push(compte(nouvelles, 'nouvelle demande', 'nouvelles demandes'));
  if (maj) dit.push(compte(maj, 'mise à jour', 'mises à jour'));
  const resume = dit.length === 2 ? `${dit[0]} et ${dit[1]}` : (nouvelles ? dit[0] : `${dit[0] || compte(1, 'mise à jour', 'mises à jour')} de vos demandes`);
  const cachees = total - lignes.length;
  return {
    objet: objetDuProjet(projet, majuscule(resume)),
    ...rendreGabarit({
      titre: 'Le point sur vos demandes',
      intro: ecrire(bonjour, `Voici les dernières évolutions de vos demandes${projet ? ` sur le projet ${projet}` : ''} : ${resume}. `
        + 'Pour ne pas vous envoyer un e-mail à chaque événement, nous les regroupons ici.'),
      liste: lignes.map((l) => {
        const numero = valeurTexte(l.numero).trim();
        const titre = valeurTexte(l.titre).trim() || 'Demande sans titre';
        return {
          titre: numero ? `${numero} · ${titre}` : titre,
          detail: quoiDeLaLigne(l),
          lien: valeurTexte(l.lien) || '',
          libelleLien: 'Voir la demande',
        };
      }),
      bouton: { libelle: 'Ouvrir mes demandes', url: valeurTexte(v.lien) || lienEspace() },
      note: (cachees > 0 ? `${compte(cachees, 'autre demande a également été mise à jour', 'autres demandes ont également été mises à jour')} : vous les retrouverez dans votre espace. ` : '')
        + 'Merci de répondre depuis votre espace : une réponse par e-mail ne serait pas rattachée à la demande.',
    }),
  };
}

/* ==========================================================================
   8. Le point d'entrée unique

   Le facteur ne connaît que le nom du modèle, tel qu'il a été écrit dans
   le document d'envoi. Un nom inconnu lève : c'est une erreur de code, et
   elle doit se voir dans les journaux plutôt que partir chez un client.
   ========================================================================== */

const MODELES = {
  'invitation': invitation,
  'anomalie': anomalie,
  'campagne': campagne,
  'testeur-termine': testeurTermine,
  'testeur-remarque': testeurRemarque,
  'message-testeur': messageTesteur,
  'message-testeur-reponse': messageTesteurReponse,
  'campagne-testeur': campagneTesteur,
  'invitation-testeur': invitationTesteur,
  'invitation-equipe': invitationEquipe,
  'ouverture': ouverture,
  'ticket-cree': ticketCree,
  'statut': statut,
  'assignation': assignation,
  'message': message,
  'resolu': resolu,
  'ferme': ferme,
  'devis': devis,
  'devis-reponse': devisReponse,
  'facture': facture,
  'facture-echeance': factureEcheance,
  'facture-retard': factureRetard,
  'reglement-declare': reglementDeclare,
  'tache-attente': tacheAttente,
  'tache-reponse': tacheReponse,
  'blocage-client': blocageClient,
  'release': release,
  'fichier': fichier,
  'reunion': reunion,
  'reunion-rappel': reunionRappel,
  'validation-demandee': validationDemandee,
  'validation-reponse': validationReponse,
  'message-projet': messageProjet,
  'qualification': qualification,
  'preprojet': preprojet,
  'maintenance': maintenance,
  'evolution-statut': evolutionStatut,
  'relance': relance,
  'code': code,
  'connexion-equipe': connexionEquipe,
  'recapitulatif': recapitulatif,
};

/**
 * @param {string} modele      une clé de MODELES
 * @param {object} variables   ce qui a été figé à la mise en file
 * @param {object} [contexte]  { a } : les destinataires de l'envoi, pour
 *                             saluer la personne qui reçoit la lettre
 * @returns {{objet: string, html: string, texte: string}}
 */
function rendre(modele, variables, contexte = null) {
  const fabrique = MODELES[valeurTexte(modele)];
  if (!fabrique) throw new Error(`Modèle d'e-mail inconnu : ${valeurTexte(modele) || '(vide)'}`);
  const v = variables && typeof variables === 'object' ? variables : {};
  const ctx = contexte && typeof contexte === 'object' ? contexte : null;
  /* L'en-tête du projet : son nom tel que figé dans la lettre, et son logo
     si le facteur l'a trouvé (contexte.projetLogo). Sans logo, la lettre
     est exactement celle que refait la page « E-mails envoyés ». */
  const nom = valeurTexte(v.projetNom).trim() || valeurTexte(v.projet).trim() || valeurTexte(v.application).trim();
  enteteProjet = nom ? { nom, logo: valeurTexte(ctx && ctx.projetLogo) } : null;
  try {
    return fabrique(v, ctx);
  } finally {
    enteteProjet = null;
  }
}

module.exports = {
  rendre,
  quoiDeLaLigne,
  MODELES,
  MARQUE_TEST,
  MARQUE_EQUIPE,
  echapper,
  valeurTexte,
  dateFr,
  euros,
  montantHT,
  montantTTC,
  franchiseDe,
  prenomDe,
  salutation,
  nomDuDestinataire,
  MENTION_FRANCHISE,
  STATUTS,
  URGENCES,
  TYPES,
  PLATEFORMES,
  SITE,
  BASE,
  lienEspace,
  lienTicket,
  lienProjet,
};
