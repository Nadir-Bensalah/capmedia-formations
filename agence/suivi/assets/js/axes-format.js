/* ==========================================================================
   LES AXES D'ÉVOLUTION : le format, ses bornes, sa validation

   Un axe d'évolution (projets/{p}/axes/{id}) est une piste de croissance
   que Capmedia propose au client, rangée par plateforme : un titre, une
   phrase, ce qu'il apporte et son ampleur. Le client coche ce qui lui
   plaît et dit ce qu'il en veut.

   Ce module ne dépend de rien : la page (vues/evolutions.js), l'éditeur
   du Cockpit et l'outil d'import (fonctions-suivi/outils/axes-importer.mjs)
   lisent les mêmes listes et la même validation. Les règles Firestore
   reprennent les mêmes bornes et les mêmes valeurs.
   ========================================================================== */

export const BORNES_AXE = { titre: 120, description: 400, detail: 4000, intro: 1000, id: 60, jours: 120 };

/* Les plateformes d'un axe, dans l'ordre de la page. « Général » reçoit ce
   qui touche tout le projet, et les suggestions d'avant sans plateforme. */
export const PLATEFORMES_AXE = {
  ios: { libelle: 'iPhone' },
  android: { libelle: 'Android' },
  web: { libelle: 'Web' },
  admin: { libelle: 'Tableau de bord' },
  backend: { libelle: 'Firebase' },
  landing: { libelle: 'Site vitrine' },
  general: { libelle: 'Général' },
};

/* Ce qu'un axe apporte : un mot, lu par le client. */
export const APPORTS_AXE = {
  engagement: { libelle: 'Engagement', aide: 'Vos utilisateurs reviennent plus souvent.', ton: 'bleu' },
  revenus: { libelle: 'Revenus', aide: 'De quoi vendre plus, ou mieux.', ton: 'vert' },
  fidelite: { libelle: 'Fidélité', aide: 'Vos utilisateurs restent.', ton: 'violet' },
  image: { libelle: 'Image', aide: 'Votre marque gagne en allure.', ton: 'rose' },
  securite: { libelle: 'Sécurité', aide: 'Vos données et celles de vos utilisateurs, mieux gardées.', ton: 'ardoise' },
  confort: { libelle: 'Confort', aide: 'Tout devient plus simple à utiliser.', ton: 'ciel' },
};

/* L'ampleur, en trois marches : la jauge de la page en remplit une, deux
   ou trois. */
export const AMPLEURS_AXE = {
  petit: { libelle: 'Petit chantier', marches: 1 },
  moyen: { libelle: 'Chantier moyen', marches: 2 },
  grand: { libelle: 'Grand chantier', marches: 3 },
};

/* L'état, posé par l'équipe. Le client lit « Au programme » et « En
   place » ; seul « Proposé » et « Au programme » se cochent encore. */
export const ETATS_AXE = {
  propose: { libelle: 'Proposé', client: '', voile: 'bleu' },
  prevu: { libelle: 'Au programme', client: 'Au programme', voile: 'vert' },
  livre: { libelle: 'En place', client: 'Déjà en place', voile: 'vert' },
};
export const ETATS_AXE_CLIENT_AGIT = ['propose', 'prevu'];

export const PUBLICATIONS_AXE = {
  brouillon: { libelle: 'Brouillon', voile: 'gris', aide: 'Le client ne le voit pas.' },
  publiee: { libelle: 'Publié', voile: 'vert', aide: 'Le client le voit dans ses axes d\'évolution.' },
};

/* Les trois gestes du client, dans l'ordre des boutons. Le libellé du
   bouton, ce qu'on lui redit une fois choisi, et ce que lit l'équipe. */
export const CHOIX_AXE = {
  interesse: { bouton: 'Ça m\'intéresse', fait: 'Ça vous intéresse', equipe: 'intéressé', notification: 'Un axe intéresse le client' },
  'a-prevoir': { bouton: 'À prévoir', fait: 'À prévoir pour vous', equipe: 'à prévoir', notification: 'Le client veut prévoir un axe' },
  'en-parler': { bouton: 'On en parle', fait: 'Vous voulez en parler', equipe: 'veut en parler', notification: 'Le client veut parler d\'un axe' },
};

const CADRATIN = '—';
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* « fidélité » dans un fichier, « fidelite » en base. */
export const normaliserApport = (v) => { const k = sansAccent(v); return APPORTS_AXE[k] ? k : null; };
/* Le temps estimé d'un axe, en jours de travail : un nombre de 0,5 à 120,
   lu par le client comme une approximation (« ≈ 3 jours »). */
export const joursValides = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0.5 && n <= BORNES_AXE.jours;
export const joursTexte = (n) => {
  if (!joursValides(n)) return '';
  if (n < 1) return 'une demi-journée';
  const j = Math.round(n * 2) / 2;
  return `${String(j).replace('.', ',')} jour${j > 1 ? 's' : ''}`;
};
export const normaliserAmpleur = (v) => { const k = sansAccent(v); return AMPLEURS_AXE[k] ? k : null; };

/** Valide un axe tel qu'écrit dans le fichier d'import. Rend { erreurs, avis }. */
export const validerAxe = (a, { plateforme = '', ou = '' } = {}) => {
  const erreurs = [];
  const avis = [];
  const dire = (m) => erreurs.push(`${ou}${m}`);
  if (!a || typeof a !== 'object' || Array.isArray(a)) { dire('un axe doit être un objet'); return { erreurs, avis }; }
  const connus = ['id', 'titre', 'description', 'apport', 'ampleur', 'detail', 'jours'];
  Object.keys(a).filter((k) => !connus.includes(k)).forEach((k) => dire(`champ inconnu « ${k} »`));
  if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(a.id) || a.id.length > BORNES_AXE.id) dire('id : minuscules, chiffres et tirets, 60 caractères au plus');
  else if (plateforme && !a.id.startsWith(`${plateforme}-`)) avis.push(`${ou}id « ${a.id} » ne commence pas par « ${plateforme}- »`);
  for (const [champ, max, requis] of [['titre', BORNES_AXE.titre, true], ['description', BORNES_AXE.description, true], ['detail', BORNES_AXE.detail, false]]) {
    const v = a[champ];
    if (v === undefined && !requis) continue;
    if (typeof v !== 'string' || (requis && !v.trim())) { dire(`${champ} : texte requis`); continue; }
    if (v.length > max) dire(`${champ} : ${v.length} caractères, ${max} au plus`);
    if (v.includes(CADRATIN)) dire(`${champ} : tiret cadratin interdit`);
  }
  if (!normaliserApport(a.apport)) dire(`apport « ${a.apport} » : ${Object.keys(APPORTS_AXE).join(', ')}`);
  if (a.jours !== undefined && !joursValides(a.jours)) dire(`jours « ${a.jours} » : un nombre de 0,5 à ${BORNES_AXE.jours}`);
  if (!normaliserAmpleur(a.ampleur)) dire(`ampleur « ${a.ampleur} » : ${Object.keys(AMPLEURS_AXE).join(', ')}`);
  if (/\d+\s?(€|euros?|k€)/i.test(`${a.titre} ${a.description}`)) avis.push(`${ou}un prix semble écrit dans le texte : il est servi au client`);
  return { erreurs, avis };
};

/** Valide un fichier entier : { intro, plateformes: { ios: [AXE...] } }. */
export const validerFichierAxes = (f) => {
  const erreurs = [];
  const avis = [];
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { erreurs: ['le fichier doit être un objet { intro, plateformes }'], avis, axes: [] };
  Object.keys(f).filter((k) => !['intro', 'plateformes'].includes(k)).forEach((k) => erreurs.push(`champ inconnu à la racine « ${k} »`));
  if (f.intro !== undefined) {
    if (typeof f.intro !== 'string') erreurs.push('intro : texte attendu');
    else if (f.intro.length > BORNES_AXE.intro) erreurs.push(`intro : ${f.intro.length} caractères, ${BORNES_AXE.intro} au plus`);
    else if (f.intro.includes(CADRATIN)) erreurs.push('intro : tiret cadratin interdit');
  }
  const p = f.plateformes;
  if (!p || typeof p !== 'object' || Array.isArray(p)) { erreurs.push('plateformes : objet attendu, une liste par plateforme'); return { erreurs, avis, axes: [] }; }
  const axes = [];
  const vus = new Set();
  for (const [cle, liste] of Object.entries(p)) {
    if (!PLATEFORMES_AXE[cle]) { erreurs.push(`plateforme inconnue « ${cle} » (${Object.keys(PLATEFORMES_AXE).join(', ')})`); continue; }
    if (!Array.isArray(liste)) { erreurs.push(`${cle} : liste attendue`); continue; }
    if (liste.length > 30) erreurs.push(`${cle} : ${liste.length} axes, 30 au plus`);
    liste.forEach((a, i) => {
      const r = validerAxe(a, { plateforme: cle, ou: `${cle}[${i}] ` });
      erreurs.push(...r.erreurs);
      avis.push(...r.avis);
      if (a && typeof a.id === 'string') {
        if (vus.has(a.id)) erreurs.push(`${cle}[${i}] id « ${a.id} » en double`);
        vus.add(a.id);
      }
      if (!r.erreurs.length) axes.push({ ...a, plateforme: cle, ordre: i + 1 });
    });
  }
  return { erreurs, avis, axes };
};

/** Le document Firestore d'un axe importé (sans dates ni réponse : l'appelant les pose). */
export const versDocumentAxe = (a) => ({
  plateforme: a.plateforme,
  titre: a.titre.trim(),
  description: a.description.trim(),
  detail: typeof a.detail === 'string' ? a.detail.trim() : '',
  apport: normaliserApport(a.apport) || '',
  ampleur: normaliserAmpleur(a.ampleur) || '',
  ...(joursValides(a.jours) ? { jours: a.jours } : {}),
  ordre: Number(a.ordre) || 0,
});

/* --- La conversion d'une suggestion d'avant ---------------------------
   Une plateforme : l'axe y va. Aucune, ou plusieurs : « Général ». Le
   détail garde le texte et le bénéfice ; le prix part dans montants/
   (lu par le responsable seul) ; la réponse « intéressé » reste la sienne,
   « pas intéressé » est gardée dans l'origine sans cocher de case. */
const ETATS_DEPUIS_SUGGESTION = { proposee: 'propose', 'a-l-etude': 'propose', acceptee: 'prevu', planifiee: 'prevu', livree: 'livre', refusee: 'propose', retiree: 'propose' };

export const axeDepuisSuggestion = (s) => {
  const plateformes = (Array.isArray(s.plateformes) ? s.plateformes : []).filter((p) => PLATEFORMES_AXE[p] && p !== 'general');
  const r = s.reponse && typeof s.reponse === 'object' ? s.reponse : null;
  const garde = (t, max) => String(t || '').replace(new RegExp(CADRATIN, 'g'), ':').slice(0, max);
  const detail = [s.texte || '', s.benefice ? `Ce que vous y gagnez : ${s.benefice}` : ''].filter(Boolean).join('\n\n');
  return {
    doc: {
      plateforme: plateformes.length === 1 ? plateformes[0] : 'general',
      titre: garde(s.titre || 'Sans titre', BORNES_AXE.titre),
      description: garde(s.resume || '', BORNES_AXE.description),
      detail: garde(detail, BORNES_AXE.detail),
      apport: '',
      ampleur: '',
      etat: ETATS_DEPUIS_SUGGESTION[s.statut] || 'propose',
      /* Une suggestion retirée par l'équipe ne revient pas devant le client. */
      publication: s.publication === 'publiee' && s.statut !== 'retiree' ? 'publiee' : 'brouillon',
      ordre: Number(s.ordre) || 0,
      devis: garde(s.devis || '', 80),
      reponse: r && r.choix === 'interesse' ? { par: String(r.par || ''), nom: garde(r.nom, 120), choix: 'interesse', demande: garde(r.demande, 80), le: r.le || null } : null,
      origine: { suggestion: String(s.id || ''), statut: String(s.statut || ''), ...(r ? { choix: String(r.choix || ''), raison: garde(r.raison, 1000), nom: garde(r.nom, 120) } : {}) },
    },
    prix: typeof s.prix === 'number' && Number.isFinite(s.prix) ? s.prix : null,
  };
};
