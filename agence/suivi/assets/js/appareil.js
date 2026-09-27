/* ==========================================================================
   Ce que la machine sait de l'appareil qui se connecte : le système, le
   navigateur, l'écran, le réseau. Tout est relevé, rien n'est tapé, sauf
   le modèle exact, que le web ne dit pas (un iPhone se présente comme
   « iPhone », sans son numéro) et que le testeur complète. Le relevé sert
   à sa fiche (ses appareils) et à chaque passage (le contexte).
   ========================================================================== */

const texte = (v, n = 80) => String(v || '').slice(0, n);

/* Le système et sa version, lus d'abord dans les indices de haute entropie
   (Chromium), sinon dans la chaîne de l'agent. */
const lireSysteme = async () => {
  const n = navigator;
  const ua = String(n.userAgent || '');
  let plateforme = String((n.userAgentData && n.userAgentData.platform) || n.platform || '');
  let version = '';
  let modele = '';
  if (n.userAgentData && typeof n.userAgentData.getHighEntropyValues === 'function') {
    try {
      const h = await n.userAgentData.getHighEntropyValues(['platformVersion', 'model', 'fullVersionList']);
      version = String(h.platformVersion || '');
      modele = String(h.model || '');
      if (h.platform) plateforme = String(h.platform);
    } catch (e) { /* refusé : l'agent suffit */ }
  }
  let os = '';
  if (/iPhone|iPad|iPod/.test(ua)) {
    const v = ua.match(/OS (\d+)[._](\d+)/);
    os = `iOS ${v ? `${v[1]}.${v[2]}` : ''}`.trim();
    modele = modele || (/iPad/.test(ua) ? 'iPad' : 'iPhone');
  } else if (/Android/.test(ua)) {
    const v = ua.match(/Android (\d+(?:\.\d+)?)/);
    os = `Android ${v ? v[1] : version}`.trim();
    const m = ua.match(/Android [^;]+; ([^;)]+)\)/);
    modele = modele || (m ? m[1].replace(/ Build.*/, '').trim() : '');
  } else if (/Mac/.test(plateforme)) {
    os = `macOS ${version}`.trim();
    modele = modele || 'Mac';
  } else if (/Win/.test(plateforme)) {
    os = `Windows ${version ? (Number(version.split('.')[0]) >= 13 ? '11' : '10') : ''}`.trim();
    modele = modele || 'PC';
  } else if (/Linux|CrOS/.test(plateforme)) {
    os = /CrOS/.test(ua) ? 'ChromeOS' : 'Linux';
    modele = modele || 'Ordinateur';
  } else os = plateforme;
  return { os: texte(os), modele: texte(modele), plateforme: texte(plateforme, 40) };
};

const lireNavigateur = () => {
  const ua = String(navigator.userAgent || '');
  if (window.capmediaBureau) return `Application Capmedia (${window.capmediaBureau.application || ''})`.trim();
  const essais = [
    [/Edg\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/Firefox\/(\d+)/, 'Firefox'], [/CriOS\/(\d+)/, 'Chrome'], [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];
  for (const [re, nom] of essais) { const m = ua.match(re); if (m) return `${nom} ${m[1]}`; }
  return 'Navigateur';
};

/* Le réseau, quand le navigateur le dit (Chromium, Android) : le type
   estimé et le débit descendant. Sinon rien, plutôt qu'un chiffre inventé. */
const lireReseau = () => {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return '';
  const parts = [];
  if (c.effectiveType) parts.push(c.effectiveType);
  if (c.downlink) parts.push(`${c.downlink} Mb/s`);
  if (c.rtt) parts.push(`${c.rtt} ms`);
  return parts.join(' · ').slice(0, 60);
};

/** La plateforme au sens de la campagne, devinée : ios, android ou web. */
export const plateformeDevinee = (os) => (/^iOS/.test(os) ? 'ios' : (/^Android/.test(os) ? 'android' : 'web'));

/**
 * Le relevé complet de cet appareil. `cle` identifie l'appareil d'une
 * visite à l'autre (système, navigateur, écran), pour ne pas le compter
 * dix fois.
 */
export const releverAppareil = async () => {
  const s = await lireSysteme();
  const navig = lireNavigateur();
  const ecran = `${window.screen ? window.screen.width : 0}×${window.screen ? window.screen.height : 0}`;
  const densite = window.devicePixelRatio || 1;
  const brut = `${s.os}|${s.modele}|${navig.replace(/ \d+$/, '')}|${ecran}|${densite}`;
  let h = 0;
  for (let i = 0; i < brut.length; i += 1) h = (Math.imul(31, h) + brut.charCodeAt(i)) | 0;
  return {
    cle: `a${(h >>> 0).toString(36)}`,
    plateforme: plateformeDevinee(s.os),
    modele: s.modele, os: s.os, navigateur: navig,
    ecran: `${ecran} · ×${densite}`,
    reseau: lireReseau(),
    agent: texte(navigator.userAgent, 300),
    memoire: navigator.deviceMemory || null,
    coeurs: navigator.hardwareConcurrency || null,
    tactile: (navigator.maxTouchPoints || 0) > 0,
    langue: texte(navigator.language, 12),
    fuseau: texte((Intl.DateTimeFormat().resolvedOptions() || {}).timeZone, 40),
  };
};

/** Un appareil, en une ligne lisible : « iPhone · iOS 18.1 · Safari 18 ». */
export const libelleAppareil = (a) => [a.modele, a.os, a.navigateur].filter(Boolean).join(' · ');
