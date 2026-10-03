/* ==========================================================================
   Les clés d'accès (WebAuthn) : Touch ID, Windows Hello, la clé du
   trousseau. Une par appareil, enregistrée depuis une session ouverte,
   utilisée sur la porte à la place du code. Le serveur (cles.js) tire le
   défi, vérifie la signature, et relit l'accès du compte : la clé prouve
   l'appareil, pas plus.

   Deux visages : sur la porte, « tenterConnexion(email) » ; dans l'espace,
   la feuille « ouvrirClesAcces() » qui liste, ajoute et retire.
   ========================================================================== */

import { auth, surEmulateur, FONCTIONS_EMULATEUR, echapper } from './noyau.js';

const PORTE = surEmulateur
  ? `${FONCTIONS_EMULATEUR}/capmedia-1f90d/europe-west1/suiviConnexion`
  : 'https://europe-west1-capmedia-1f90d.cloudfunctions.net/suiviConnexion';

/* Le navigateur sait-il faire ? Sans WebAuthn, rien n'est proposé. */
export const cleDisponible = () => typeof window !== 'undefined' && Boolean(window.PublicKeyCredential) && Boolean(navigator.credentials);

/* Base64url vers octets, et retour : le serveur parle en texte, le
   navigateur en tampons. */
const versOctets = (s) => {
  const b = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i);
  return u.buffer;
};
const versTexte = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const optionsCreation = (o) => ({
  ...o,
  challenge: versOctets(o.challenge),
  user: { ...o.user, id: versOctets(o.user.id) },
  excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: versOctets(c.id) })),
});
const optionsDemande = (o) => ({
  ...o,
  challenge: versOctets(o.challenge),
  allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: versOctets(c.id) })),
});
const reponseCreation = (c) => ({
  id: c.id, rawId: versTexte(c.rawId), type: c.type,
  response: {
    clientDataJSON: versTexte(c.response.clientDataJSON),
    attestationObject: versTexte(c.response.attestationObject),
    transports: typeof c.response.getTransports === 'function' ? c.response.getTransports() : [],
  },
  clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {},
  authenticatorAttachment: c.authenticatorAttachment || undefined,
});
const reponseDemande = (c) => ({
  id: c.id, rawId: versTexte(c.rawId), type: c.type,
  response: {
    clientDataJSON: versTexte(c.response.clientDataJSON),
    authenticatorData: versTexte(c.response.authenticatorData),
    signature: versTexte(c.response.signature),
    userHandle: c.response.userHandle ? versTexte(c.response.userHandle) : undefined,
  },
  clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {},
  authenticatorAttachment: c.authenticatorAttachment || undefined,
});

const appeler = async (action, corps, { jeton = '' } = {}) => {
  const r = await fetch(PORTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: JSON.stringify({ action, ...corps }),
  });
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { code: r.status, ...(json || {}) };
};

/* Le nom de l'appareil, pour que la liste dise « Mac », « iPhone »,
   « Windows » : relevé par la machine, jamais tapé. */
export const nomAppareil = () => {
  const n = navigator || {};
  const ua = String(n.userAgent || '');
  const p = String((n.userAgentData && n.userAgentData.platform) || n.platform || '');
  let os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(p) ? 'Mac' : /Win/.test(p) ? 'Windows' : /Linux/.test(p) ? 'Linux' : 'Appareil';
  if (window.capmediaBureau) os = `${os} · application`;
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) os = `${os} · Chrome`;
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) os = `${os} · Safari`;
  else if (/Firefox\//.test(ua)) os = `${os} · Firefox`;
  else if (/Edg\//.test(ua)) os = `${os} · Edge`;
  return os;
};

/* --------------------------------------------------------------------------
   Sur la porte
   -------------------------------------------------------------------------- */

/**
 * Tente la clé pour cette adresse. Rend :
 *   { lien, espace }   la session s'ouvre (comme après un code) ;
 *   null               pas de clé pour cette adresse, ou geste annulé : la
 *                      porte demande un code, sans bruit.
 * Ne lève que si le serveur refuse une clé présentée (message à montrer).
 */
export const tenterConnexion = async (email) => {
  if (!cleDisponible()) return null;
  let r;
  try { r = await appeler('cleOptionsConnexion', { email }); } catch (e) { return null; }
  if (!r.ok || !r.options) return null;
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: optionsDemande(r.options) });
  } catch (e) {
    /* Annulé, refusé, ou pas de clé sur cet appareil : le code prend le
       relais. Rien à dire. */
    return null;
  }
  if (!cred) return null;
  const v = await appeler('cleVerifier', { email, reponse: reponseDemande(cred), bureau: Boolean(window.capmediaBureau) });
  if (!v.ok || !v.lien) throw new Error(v.message || "La clé n'a pas pu être vérifiée.");
  return v;
};

/* --------------------------------------------------------------------------
   Dans l'espace : la feuille des clés
   -------------------------------------------------------------------------- */

const jeton = async () => { const u = auth.currentUser; return u ? u.getIdToken() : ''; };

export const listerCles = async () => {
  const r = await appeler('clesLister', {}, { jeton: await jeton() });
  if (!r.ok) throw new Error(r.message || 'Les clés n\'ont pas pu être lues.');
  return r.cles || [];
};

export const ajouterCle = async () => {
  if (!cleDisponible()) throw new Error('Ce navigateur ne sait pas créer de clé d\'accès.');
  const j = await jeton();
  const r = await appeler('cleOptionsEnregistrement', {}, { jeton: j });
  if (!r.ok || !r.options) throw new Error(r.message || 'La clé n\'a pas pu être préparée.');
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: optionsCreation(r.options) });
  } catch (e) {
    const nom = (e && e.name) || '';
    if (nom === 'NotAllowedError') throw new Error('Ajout annulé.');
    if (nom === 'InvalidStateError') throw new Error('Cet appareil a déjà une clé pour ce compte.');
    throw new Error('L\'appareil n\'a pas pu créer la clé.');
  }
  const v = await appeler('cleEnregistrer', { reponse: reponseCreation(cred), appareil: nomAppareil() }, { jeton: j });
  if (!v.ok) throw new Error(v.message || 'La clé n\'a pas pu être enregistrée.');
  return v.cle;
};

export const retirerCle = async (id) => {
  const r = await appeler('cleRetirer', { id }, { jeton: await jeton() });
  if (!r.ok) throw new Error(r.message || 'La clé n\'a pas pu être retirée.');
  return true;
};

const dateCourte = (ms) => (ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/* La feuille : ce que l'on a, ajouter cet appareil, retirer. */
export const ouvrirClesAcces = async () => {
  const { modale, toast, agir, icone } = await import('./ui.js');
  const m = modale({
    titre: 'Clés d\'accès',
    sousTitre: 'Touch ID, Windows Hello ou la clé de votre trousseau : la porte s\'ouvre sans code.',
    feuille: true,
    corps: '<div id="cles-liste"><p class="aide">Lecture…</p></div>',
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>
      ${cleDisponible() ? `<button class="btn btn-principal" type="button" data-ajouter-cle>${icone('cle')} Ajouter cet appareil</button>` : ''}`,
  });
  const zone = m.el.querySelector('#cles-liste');
  const rendre = async () => {
    let cles = [];
    try { cles = await listerCles(); } catch (e) { zone.innerHTML = `<p class="aide">${echapper(e.message)}</p>`; return; }
    zone.innerHTML = cles.length ? `<div class="liste liste--serree">${cles.map((c) => `
      <div class="rang" style="justify-content:space-between;padding:10px 12px;border-radius:10px;background:var(--fond-2)" data-cle="${echapper(c.id)}">
        <span><b>${echapper(c.appareil || 'Appareil')}</b><br><span class="t-micro t-3">ajoutée le ${echapper(dateCourte(c.cree))}${dateCourte(c.dernier) ? ` · utilisée le ${echapper(dateCourte(c.dernier))}` : ' · jamais utilisée'}${c.sauvegardee ? ' · synchronisée' : ''}</span></span>
        <button class="btn btn-fantome btn-petit" type="button" data-retirer-cle="${echapper(c.id)}">Retirer</button>
      </div>`).join('')}</div>
      <p class="aide" style="margin-top:10px">Une clé retirée ne rouvre plus rien, même depuis l'appareil qui la porte. Le code par e-mail reste toujours possible.</p>`
      : `<p class="t-2">Aucune clé pour l'instant. ${cleDisponible() ? 'Ajoutez cet appareil : la prochaine fois, votre adresse et votre empreinte suffiront.' : 'Ce navigateur ne sait pas en créer.'}</p>`;
  };
  await rendre();
  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-ajouter-cle]');
    const r = e.target.closest('[data-retirer-cle]');
    if (a) {
      await agir(a, async () => {
        try { const c = await ajouterCle(); toast(`Clé ajoutée : ${c.appareil || 'cet appareil'}.`); await rendre(); }
        catch (err) { toast(err.message || 'La clé n\'a pas pu être ajoutée.', 'erreur'); }
      });
    }
    if (r) {
      await agir(r, async () => {
        try { await retirerCle(r.dataset.retirerCle); toast('Clé retirée.'); await rendre(); }
        catch (err) { toast(err.message || 'La clé n\'a pas pu être retirée.', 'erreur'); }
      });
    }
  });
  return m.fin;
};

/* Après une connexion par code, une seule fois par session de navigateur :
   proposer la clé, sans insister. */
/* Une seule fois par personne (03/10) : la proposition revenait à chaque
   connexion par code. Retenue sur cet appareil, au nom de la personne. */
export const proposerCle = async (uid = '') => {
  let marque = '';
  try { marque = sessionStorage.getItem('suivi:proposer-cle') || ''; sessionStorage.removeItem('suivi:proposer-cle'); } catch (e) { return; }
  if (marque !== '1' || !cleDisponible()) return;
  const deja = `suivi:cle-proposee:${uid || 'anonyme'}`;
  try { if (localStorage.getItem(deja)) return; localStorage.setItem(deja, '1'); } catch (e) { /* stockage refusé : on propose, sans retenir */ }
  const { toast } = await import('./ui.js');
  toast('Ouvrir plus vite la prochaine fois, sans code ?', 'ok', { libelle: 'Ajouter une clé d\'accès', action: ouvrirClesAcces, duree: 12000 });
};
