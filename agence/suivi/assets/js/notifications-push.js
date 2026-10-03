/* ==========================================================================
   Les notifications push : être prévenu d'un nouveau message, Hub fermé.

   Rien ne s'ouvre tout seul. La demande d'autorisation du navigateur ne
   part que d'un geste : le bouton « Activer les notifications » des
   Paramètres, ou la proposition faite une seule fois, après le premier
   message envoyé depuis cet appareil. Là où le push n'existe pas (iPhone
   hors application installée sur l'écran d'accueil, application de bureau
   Capmedia qui a ses propres notifications, navigateur trop ancien), rien
   n'est proposé.

   Activer : l'autorisation, le service (../../sw.js, portée /suivi/),
   l'abonnement du navigateur, puis sa copie dans le profil :
   profils/{uid}/pushs/{id}, id = empreinte de l'adresse d'envoi. Le
   serveur (fonctions-suivi/push.js) y lit où envoyer. Un abonnement ne
   sert qu'à la personne qui l'a créé : si quelqu'un d'autre se connecte
   dans ce navigateur, l'abonnement est rendu, et le serveur efface la
   copie de l'ancien titulaire au prochain envoi (410).
   ========================================================================== */

import { bdd, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from './noyau.js';
import { toast } from './ui.js';

const CLE_PUBLIQUE = String((window.AZ_SUIVI || {}).vapid || '');
const SERVICE = new URL('../../sw.js', import.meta.url).href;
const PORTEE = new URL('../../', import.meta.url).href;
const CLE_TITULAIRE = 'suivi:push:titulaire';
const CLE_PROPOSE = 'suivi:push:propose';

const lireCle = (cle) => { try { return localStorage.getItem(cle); } catch (e) { return null; } };
const ecrireCle = (cle, v) => { try { if (v === null) localStorage.removeItem(cle); else localStorage.setItem(cle, v); } catch (e) { /* stockage refusé */ } };

/** Le push existe-t-il ici ? Sur iPhone, seulement dans l'application installée. */
export const pushPossible = () => {
  try {
    return !window.capmediaBureau
      && window.isSecureContext === true
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window
      && typeof ServiceWorkerRegistration !== 'undefined'
      && 'showNotification' in ServiceWorkerRegistration.prototype
      && CLE_PUBLIQUE.length > 40;
  } catch (e) { return false; }
};

const octets = (b64) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(s);
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
};
const memesOctets = (a, b) => Boolean(a && b) && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

/* L'identifiant de l'abonnement : l'empreinte de son adresse d'envoi. Le
   même appareil réabonné réécrit le même document, sans doublon. */
const empreinte = async (endpoint) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 40);
};

const nomAppareil = () => {
  const ua = navigator.userAgent || '';
  const systeme = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux|CrOS/.test(ua) ? 'Linux' : 'Appareil';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /(Chrome|CriOS)\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  return `${nav} sur ${systeme}`;
};

const refDe = (uid, id) => doc(bdd, 'profils', uid, 'pushs', id);

const enregistrement = async () => {
  if (!pushPossible()) return null;
  try { return (await navigator.serviceWorker.getRegistration(PORTEE)) || null; } catch (e) { return null; }
};

const copier = async (uid, abonnement) => {
  const j = abonnement.toJSON();
  const id = await empreinte(j.endpoint);
  await setDoc(refDe(uid, id), {
    endpoint: String(j.endpoint),
    cles: { p256dh: String((j.keys || {}).p256dh || ''), auth: String((j.keys || {}).auth || '') },
    appareil: nomAppareil(),
    maj: serverTimestamp(),
  });
  ecrireCle(CLE_TITULAIRE, uid);
  return id;
};

/** L'état sur cet appareil : indisponible, refuse, actif, inactif. */
export const etatPush = async (uid) => {
  if (!pushPossible()) return 'indisponible';
  if (Notification.permission === 'denied') return 'refuse';
  const reg = await enregistrement();
  const ab = reg && reg.pushManager ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (ab && Notification.permission === 'granted' && lireCle(CLE_TITULAIRE) === uid) return 'actif';
  return 'inactif';
};

/**
 * Activer, depuis un geste (un clic) : l'autorisation est demandée en
 * premier, avant toute attente, pour que le navigateur reconnaisse le geste.
 */
export const activerPush = async (uid) => {
  if (!pushPossible()) return 'indisponible';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'refuse' : 'inactif';
  await navigator.serviceWorker.register(SERVICE, { scope: PORTEE });
  const reg = await navigator.serviceWorker.ready;
  let ab = await reg.pushManager.getSubscription();
  /* Un abonnement fait avec une autre clé (clé changée) ne sert plus. */
  const cle = octets(CLE_PUBLIQUE);
  if (ab && ab.options && ab.options.applicationServerKey && !memesOctets(ab.options.applicationServerKey, cle)) {
    await ab.unsubscribe().catch(() => {});
    ab = null;
  }
  if (!ab) ab = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle });
  await copier(uid, ab);
  return 'actif';
};

/** Désactiver sur cet appareil : l'abonnement rendu, sa copie effacée. */
export const desactiverPush = async (uid) => {
  const reg = await enregistrement();
  const ab = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (ab) {
    const id = await empreinte(ab.endpoint);
    await deleteDoc(refDe(uid, id)).catch(() => {});
    await ab.unsubscribe().catch(() => {});
  }
  ecrireCle(CLE_TITULAIRE, null);
  return pushPossible() ? 'inactif' : 'indisponible';
};

/* Au démarrage, sans rien demander : si ce navigateur est abonné, la copie
   du profil est tenue à jour (le navigateur peut changer d'adresse d'envoi),
   ou l'abonnement est rendu s'il appartient à quelqu'un d'autre. */
const resynchroniser = async (uid) => {
  const reg = await enregistrement();
  const ab = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (!ab) return;
  let titulaire = lireCle(CLE_TITULAIRE);
  if (!titulaire) {
    const existe = await getDoc(refDe(uid, await empreinte(ab.endpoint))).then((d) => d.exists()).catch(() => false);
    if (existe) titulaire = uid;
  }
  if (titulaire !== uid || Notification.permission !== 'granted') {
    await ab.unsubscribe().catch(() => {});
    ecrireCle(CLE_TITULAIRE, null);
    return;
  }
  await copier(uid, ab).catch(() => {});
};

const PHRASES = {
  actif: 'Activées sur cet appareil : un nouveau message vous arrive même quand l\'espace est fermé.',
  inactif: 'Une notification sur cet appareil à chaque nouveau message, même quand l\'espace est fermé.',
  refuse: 'Bloquées par le navigateur. Autorisez les notifications pour ce site dans les réglages du navigateur, puis revenez ici.',
};

/**
 * Le réglage des Paramètres. `section` reste masquée là où le push
 * n'existe pas ; `boite` reçoit la ligne et son bouton.
 */
export const monterReglage = async (section, boite, env) => {
  if (!section || !boite || !pushPossible()) return;
  const uid = env.session.utilisateur.uid;
  const rendre = (etat) => {
    if (etat === 'indisponible') { section.hidden = true; return; }
    section.hidden = false;
    boite.innerHTML = `<div class="rang-espace" data-push-etat="${etat}"><div><p class="t-corps-fort">Nouveaux messages</p><p class="t-petit t-2" id="push-phrase"></p></div>${etat === 'refuse' ? '' : `<button class="btn btn-secondaire" type="button" id="push-basculer">${etat === 'actif' ? 'Désactiver' : 'Activer les notifications'}</button>`}</div>`;
    boite.querySelector('#push-phrase').textContent = PHRASES[etat] || '';
    const bouton = boite.querySelector('#push-basculer');
    if (bouton) {
      bouton.addEventListener('click', async () => {
        bouton.disabled = true;
        try {
          const suivant = etat === 'actif' ? await desactiverPush(uid) : await activerPush(uid);
          if (suivant === 'actif') toast('Notifications activées sur cet appareil.');
          rendre(suivant);
        } catch (e) {
          console.error('[push]', e);
          toast('Les notifications n\'ont pas pu être activées sur cet appareil.', 'erreur');
          rendre(await etatPush(uid));
        }
      });
    }
  };
  rendre(await etatPush(uid));
};

let demarre = false;

/**
 * Le branchement, une fois par page (app.js, admin.js) : la copie tenue à
 * jour, la conversation ouverte au clic sur une notification, et la
 * proposition après le premier message envoyé.
 */
export const demarrerPush = (env) => {
  if (demarre || !env || !env.session) return;
  demarre = true;
  const uid = env.session.utilisateur.uid;
  const equipe = env.role === 'equipe';

  /* Le clic sur une notification, fenêtre déjà ouverte : le service dit où aller. */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.type === 'suivi:ouvrir' && /^#\/messages\/[^\s#?]+$/.test(String(d.lien || ''))) location.hash = d.lien;
    });
  }
  if (!pushPossible()) return;
  resynchroniser(uid).catch(() => {});

  /* La proposition : une fois par appareil, juste après un message envoyé
     (page Messages ou bulle d'un projet), et seulement si rien n'est
     encore décidé. Le bouton du toast est le geste qui autorise la demande. */
  document.addEventListener('submit', (e) => {
    const forme = e.target;
    if (!forme || !['forme-message', 'bulle-forme'].includes(forme.id)) return;
    const champ = forme.querySelector('textarea');
    if (!champ || !champ.value.trim()) return;
    if (lireCle(CLE_PROPOSE) || Notification.permission !== 'default') return;
    ecrireCle(CLE_PROPOSE, '1');
    setTimeout(async () => {
      if (await etatPush(uid) !== 'inactif') return;
      toast(equipe ? 'Être prévenu sur cet appareil quand le client répond, même le Cockpit fermé ?' : 'Être prévenu sur cet appareil quand Capmedia vous répond, même le Hub fermé ?', 'info', {
        libelle: 'Activer',
        duree: 15000,
        action: async () => {
          try {
            const etat = await activerPush(uid);
            if (etat === 'actif') toast('Notifications activées. Vous pourrez les couper dans Paramètres.');
          } catch (err) {
            console.error('[push]', err);
            toast('Les notifications n\'ont pas pu être activées sur cet appareil.', 'erreur');
          }
        },
      });
    }, 1200);
  });
};
