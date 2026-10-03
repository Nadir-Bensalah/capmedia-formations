/* ==========================================================================
   CAPMEDIA · le service des notifications push de l'espace de suivi

   Un seul rôle : recevoir un push du serveur (fonctions-suivi/push.js) et
   le montrer, même quand le Hub ou le Cockpit est fermé ; au clic, ouvrir
   la bonne conversation. Il n'intercepte aucune requête (pas de « fetch ») :
   le site se charge exactement comme sans lui.

   Il n'est enregistré que lorsqu'une personne active les notifications
   (assets/js/notifications-push.js), jamais à l'ouverture d'une page.
   Portée : /suivi/ (il vit à la racine de l'espace pour la couvrir).

   Ce que porte un push : { titre, corps, lien, tag }. « lien » est relatif
   à l'espace (« hub#/messages/<projet> », « cockpit#/messages/<projet> ») ;
   un lien qui sortirait de l'espace est ignoré.
   ========================================================================== */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const PORTEE = () => new URL(self.registration.scope);

/* Un lien de l'espace, ou rien : même origine, sous la portée. */
const lienSur = (lien) => {
  try {
    const u = new URL(String(lien || 'hub'), self.registration.scope);
    if (u.origin !== self.location.origin || !u.pathname.startsWith(PORTEE().pathname)) return null;
    return u;
  } catch (e) { return null; }
};

/* Safari (iPhone en application, Mac) retire l'abonnement d'un site qui
   reçoit des push sans rien montrer : là, on montre toujours. */
const ua = String((self.navigator && self.navigator.userAgent) || '');
const exigeToujours = /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { corps: e.data ? e.data.text() : '' }; }
  const titre = String(d.titre || 'Capmedia').slice(0, 120);
  const options = {
    body: String(d.corps || '').slice(0, 240),
    tag: String(d.tag || 'capmedia').slice(0, 120),
    renotify: true,
    lang: 'fr',
    icon: new URL('assets/img/app-hub.png', self.registration.scope).href,
    data: { lien: String(d.lien || '') },
  };
  e.waitUntil((async () => {
    /* Une fenêtre de l'espace au premier plan montre déjà le message (son,
       aperçu, pastille) : pas de doublon, sauf sous Safari. */
    if (!exigeToujours) {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (fenetres.some((c) => c.focused && c.visibilityState === 'visible' && lienSur(c.url))) return;
    }
    await self.registration.showNotification(titre, options);
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = lienSur((e.notification.data || {}).lien);
  if (!cible) return;
  e.waitUntil((async () => {
    const page = cible.pathname.split('/').pop(); // « hub » ou « cockpit »
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    /* Une fenêtre déjà ouverte sur le même espace : elle va à la conversation
       (la page suit le message, voir notifications-push.js), et passe devant. */
    const memeEspace = fenetres.find((c) => {
      const u = lienSur(c.url);
      return u && u.pathname.replace(/\.html$/, '').split('/').pop() === page;
    });
    if (memeEspace) {
      memeEspace.postMessage({ type: 'suivi:ouvrir', lien: cible.hash });
      try { await memeEspace.focus(); } catch (err) { /* le navigateur garde la main */ }
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(cible.href);
  })());
});
