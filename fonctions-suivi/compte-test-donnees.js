/* ==========================================================================
   CAPMEDIA TEST · les données fictives d'un compte ForgeMe de test

   Repris du semis du flux mobile (~/ForgeMe-tests/mobile/outils-tests/semis/
   donnees.mjs), au format que l'application lit : mêmes collections, mêmes
   champs. Ajouts : les notes rapides (users/{uid}/quickNotes) et les listes
   de courses (users/{uid}/shoppingLists) du web ; sur le téléphone, ces deux
   écrans gardent leurs données dans l'appareil, le serveur n'y touche pas.

   Tout est fictif et déterministe : même compte, mêmes documents (les
   identifiants sont fixes, un second « Remplir » réécrit au lieu de
   doubler). Les dates sont relatives au jour du geste.

   Chaque fabrique rend une liste de { chemin, donnees }, chemins TOUJOURS
   sous users/{uid} : compte-test.js le vérifie avant d'écrire.
   ========================================================================== */

/* ---------- Hasard rejouable ---------- */
function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const choisir = (h, liste) => liste[Math.floor(h() * liste.length)];
const jour = (base, decalage, heures = 9, minutes = 0) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + decalage, heures, minutes, 0, 0);
const cleJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const num = (i, n = 4) => String(i).padStart(n, '0');

/* ---------- Profil ---------- */
/** Le profil complet d'un compte rempli : l'accueil passé, le français. */
function profil(c, m) {
  const cree = jour(m, -540);
  return [
    { chemin: `users/${c.uid}`, fusion: true, donnees: {
      uid: c.uid, email: c.email, firstName: c.prenom, lastName: c.nom, displayName: `${c.prenom} ${c.nom}`.trim(),
      emailVerified: true, profileCompleted: true, onboardingCompleted: true, registrationProtected: true,
      updatedAt: m, metadata: { registrationCompleted: true, registrationMethod: 'email', isActive: true },
      onboardingAnswers: { focusAreas: ['daily_tasks', 'rituals'], intents: ['organize'], completedAt: cree.toISOString() },
    } },
    { chemin: `users/${c.uid}/settings/preferences`, donnees: {
      appearance: { theme: 'light', tabBarStyle: 'classic' }, language: { current: 'fr' }, version: 1, createdAt: cree, updatedAt: m,
    } },
  ];
}

/** Le profil minimal d'un compte remis à zéro : le compte et son nom, rien d'autre. */
function profilMinimal(c, m) {
  return { chemin: `users/${c.uid}`, donnees: {
    uid: c.uid, email: c.email, firstName: c.prenom, lastName: c.nom, displayName: `${c.prenom} ${c.nom}`.trim(),
    emailVerified: true, profileCompleted: true, onboardingCompleted: false, registrationProtected: true,
    createdAt: m, updatedAt: m, metadata: { registrationCompleted: true, registrationMethod: 'email', loginCount: 0, isActive: true },
  } };
}

/** Les packs déjà posés : un compte rempli ne reçoit pas les packs de bienvenue en double. */
const PACKS = ['starter-forge', 'organisation-express', 'routine-momentum', 'cap-objectifs', 'esprit-libre', 'deep-week', 'matin-gagnant', 'reset-digital'];
const packsDejaPoses = (c, m) => PACKS.map((packId) => ({ chemin: `users/${c.uid}/packInstallations/${packId}`, donnees: {
  packId, status: 'installed', installedAt: jour(m, -530), lang: 'fr', partial: false,
  itemIds: { tasks: [], rituals: [], goals: [], ideas: [] }, counts: { tasks: 0, rituals: 0, goals: 0, ideas: 0 },
} }));

/* ---------- Tâches ---------- */
const CATEGORIES = ['perso', 'pro', 'sante', 'sport', 'divers'];
const PRIORITES = ['low', 'medium', 'high', 'urgent'];
const ENERGIES = ['low', 'medium', 'high'];
const TITRES = ['Appeler le plombier', 'Préparer la réunion', 'Relire le contrat', 'Courir 5 km', 'Rendez-vous chez le dentiste',
  'Payer la cantine', 'Ranger le garage', 'Envoyer le devis', 'Réserver le train', 'Arroser les plantes',
  'Réviser la présentation', 'Commander les fournitures', 'Faire les courses', 'Répondre aux courriels', 'Méditer dix minutes',
  'Prendre rendez-vous chez le garagiste', 'Trier les papiers', 'Appeler mamie', 'Préparer le repas de dimanche', 'Mettre à jour le budget'];

const tache = (uid, id, champs, m) => {
  const cree = champs.createdAt || m;
  return { chemin: `users/${uid}/tasks/${id}`, donnees: {
    userId: uid, title: 'Tâche', description: '', priority: 'medium', category: 'perso', energy: 'medium',
    isAllDay: true, isRecurring: false, reminders: [], status: 'pending', isArchived: false,
    postponeCount: 0, completionRate: 0, createdAt: cree, updatedAt: cree, ...champs,
  } };
};

function tachesOrdinaires(c, m) {
  const docs = [];
  [
    { title: 'Acheter du pain', d: 0, priority: 'low', category: 'perso' },
    { title: 'Préparer la réunion d\'équipe', d: 0, priority: 'high', category: 'pro', heure: 10 },
    { title: 'Courir 5 km', d: 1, priority: 'medium', category: 'sport' },
    { title: 'Rendez-vous chez le dentiste', d: 2, priority: 'medium', category: 'sante', heure: 15 },
    { title: 'Envoyer le devis', d: -1, priority: 'urgent', category: 'pro', faite: true },
    { title: 'Ranger le garage', d: 3, priority: 'low', category: 'divers' },
    { title: 'Payer la cantine', d: 0, priority: 'medium', category: 'perso', faite: true },
    { title: 'Réserver le train pour Lyon', d: 5, priority: 'medium', category: 'perso' },
    { title: 'Relire le contrat de location', d: -3, priority: 'high', category: 'perso' },
    { title: 'Appeler la mutuelle', d: 7, priority: 'low', category: 'sante' },
    { title: 'Préparer le sac de piscine', d: 1, priority: 'low', category: 'sport', heure: 18 },
    { title: 'Faire le point sur le budget du mois', d: 4, priority: 'medium', category: 'perso' },
  ].forEach((b, i) => {
    const quand = jour(m, b.d, b.heure || 9);
    docs.push(tache(c.uid, `ct-t${i + 1}`, {
      title: b.title, priority: b.priority, category: b.category, scheduledDate: quand, isAllDay: !b.heure,
      ...(b.heure ? { startTime: quand, endTime: new Date(quand.getTime() + 3600e3), estimatedDuration: 60 } : { estimatedDuration: 30 }),
      status: b.faite ? 'completed' : 'pending', ...(b.faite ? { completedAt: quand, completionRate: 100 } : {}),
      createdAt: jour(m, -30 + i),
    }, m));
  });
  const creeRec = jour(m, -14, 7);
  docs.push(tache(c.uid, 'ct-rec', { title: 'Boire un grand verre d\'eau', isRecurring: true, recurrencePattern: { type: 'daily', interval: 1 },
    scheduledDate: creeRec, startTime: creeRec, createdAt: creeRec, category: 'sante' }, m));
  const quand = jour(m, 0, 9);
  docs.push(tache(c.uid, 'ct-sous', { title: 'Préparer le déménagement', scheduledDate: quand, hasSubTasks: true, subTasksCount: 3, createdAt: jour(m, -3) }, m));
  ['Réserver le camion', 'Acheter des cartons', 'Prévenir la banque'].forEach((t, i) => docs.push({
    chemin: `users/${c.uid}/subtasks/ct-sous-${i + 1}`,
    donnees: { userId: c.uid, parentTaskId: 'ct-sous', title: t, status: i === 0 ? 'completed' : 'pending', order: i, isArchived: false, createdAt: jour(m, -3), updatedAt: jour(m, -3) },
  }));
  return docs;
}

/* Les récurrentes du compte chargé : les plus anciennes, celles qu'une
   lecture tronquée perdrait d'abord (le défaut de juillet). */
const RECURRENTES = [
  { id: 'quotidienne', title: 'Relevé des compteurs', recurrencePattern: { type: 'daily', interval: 1 } },
  { id: 'tous-3-jours', title: 'Arroser le potager', recurrencePattern: { type: 'daily', interval: 3 } },
  { id: 'lundi', title: 'Valider le planning', recurrencePattern: { type: 'weekly', interval: 1, daysOfWeek: [1] } },
  { id: 'lmv', title: 'Séance de sport', recurrencePattern: { type: 'weekly', interval: 1, daysOfWeek: [1, 3, 5] } },
  { id: 'quinzaine', title: 'Facture fournisseur A', recurrencePattern: { type: 'weekly', interval: 2, daysOfWeek: [2] } },
  { id: 'le-15', title: 'Tickets repas', recurrencePattern: { type: 'monthly', interval: 1, monthlyType: 'day', monthDay: 15 } },
  { id: 'le-31', title: 'Clôture du mois', recurrencePattern: { type: 'monthly', interval: 1, monthlyType: 'day', monthDay: 31 } },
  { id: '3e-jeudi', title: 'Comité de lecture', recurrencePattern: { type: 'monthly', interval: 1, monthlyType: 'position', weekdayPosition: 3, weekdayType: 4 } },
  { id: 'dernier-jour', title: 'Facture fournisseur B', recurrencePattern: { type: 'monthly', interval: 1, monthlyType: 'last_day' } },
  { id: 'annuelle', title: 'Renouveler l\'assurance', recurrencePattern: { type: 'yearly', interval: 1, yearlyType: 'date', yearMonth: 2, yearDay: 10 } },
];

/** 1 500 tâches sur dix-huit mois, dont 400 archivées et dix récurrentes. */
function tachesChargees(c, m, { total = 1500, archivees = 400 } = {}) {
  const h = hasard(1500);
  const docs = [];
  const debut = -540;
  RECURRENTES.forEach((r, i) => {
    const cree = jour(m, debut - 5 + i);
    const dailyStatus = {};
    for (let d = -20; d < 0; d += 1) if (h() < 0.6) dailyStatus[cleJour(jour(m, d))] = { status: 'completed', completedAt: jour(m, d, 18) };
    docs.push(tache(c.uid, `ct-charge-${r.id}`, { title: r.title, isRecurring: true, recurrencePattern: r.recurrencePattern, category: 'pro',
      scheduledDate: cree, startTime: cree, dailyStatus, createdAt: cree }, m));
  });
  const simples = total - RECURRENTES.length;
  for (let i = 0; i < simples; i += 1) {
    const decalage = debut + Math.floor(((i + 1) / simples) * (540 + 30));
    const quand = jour(m, decalage, 8 + Math.floor(h() * 10), h() < 0.5 ? 0 : 30);
    const archivee = i < archivees;
    const faite = archivee || (decalage < 0 && h() < 0.85);
    const avecHeure = h() < 0.4;
    docs.push(tache(c.uid, `ct-charge-t${num(i + 1)}`, {
      title: `${choisir(h, TITRES)} (${i + 1})`,
      priority: choisir(h, PRIORITES), category: choisir(h, CATEGORIES), energy: choisir(h, ENERGIES),
      estimatedDuration: choisir(h, [15, 30, 45, 60, 90]), scheduledDate: quand, isAllDay: !avecHeure,
      ...(avecHeure ? { startTime: quand, endTime: new Date(quand.getTime() + 3600e3) } : {}),
      status: faite ? 'completed' : 'pending',
      ...(faite ? { completedAt: new Date(quand.getTime() + 2 * 3600e3), completionRate: 100 } : {}),
      isArchived: archivee, ...(archivee ? { archivedAt: jour(m, decalage + 120) } : {}),
      createdAt: jour(m, decalage - 2),
    }, m));
  }
  return docs;
}

/* ---------- Objectifs ---------- */
const MODELES_OBJECTIFS = [
  { title: 'Courir un semi-marathon', category: 'sport', importance: 'haute', type: 'quantity', typeConfig: { targetQuantity: 21, currentQuantity: 12, unit: 'km' }, sous: ['Courir 10 km', 'Courir 15 km', 'Courir 21 km'] },
  { title: 'Lire douze livres', category: 'perso', importance: 'normale', type: 'simple', progress: 25, sous: ['Premier trimestre', 'Deuxième trimestre'] },
  { title: 'Économiser pour les vacances', category: 'perso', importance: 'normale', type: 'amount', typeConfig: { targetAmount: 1500, currentAmount: 600, unit: '€' }, sous: [] },
  { title: 'Apprendre l\'espagnol', category: 'perso', importance: 'faible', type: 'simple', progress: 60, sous: ['Niveau A1', 'Niveau A2'] },
  { title: 'Ranger toute la maison', category: 'perso', importance: 'normale', type: 'simple', progress: 40, sous: ['Le garage', 'Le grenier'] },
  { title: 'Passer le permis moto', category: 'perso', importance: 'haute', type: 'simple', progress: 10, sous: ['Le code', 'Le plateau', 'La circulation'] },
];
function objectifs(c, m, n) {
  const docs = [];
  for (let i = 0; i < n; i += 1) {
    const o = MODELES_OBJECTIFS[i % MODELES_OBJECTIFS.length];
    const id = `ct-obj${i + 1}`;
    const cree = jour(m, -60 - i * 7);
    const titre = i < MODELES_OBJECTIFS.length ? o.title : `${o.title} (${Math.floor(i / MODELES_OBJECTIFS.length) + 1})`;
    docs.push({ chemin: `users/${c.uid}/goals/${id}`, donnees: {
      userId: c.uid, title: titre, description: '', category: o.category, importance: o.importance, type: o.type,
      ...(o.typeConfig ? { typeConfig: o.typeConfig } : {}), startDate: cree, targetDate: jour(m, 120 + i * 5),
      hasSubGoals: o.sous.length > 0, subGoalsCount: o.sous.length, activitiesCount: 0, status: 'active',
      progress: o.progress || 0, isArchived: false, viewCount: 0, completionRate: 0, tags: [], searchKeywords: [],
      createdAt: cree, updatedAt: jour(m, -i),
    } });
    o.sous.forEach((t, j) => docs.push({ chemin: `users/${c.uid}/subgoals/${id}-s${j + 1}`, donnees: {
      userId: c.uid, goalId: id, title: t, description: '', type: 'simple', startDate: cree, order: j, dependencies: [],
      status: j === 0 ? 'completed' : 'active', progress: j === 0 ? 100 : 0, activitiesCount: 0, isArchived: false,
      completionRate: j === 0 ? 100 : 0, createdAt: cree, updatedAt: cree,
    } }));
  }
  return docs;
}

/* ---------- Rituels et leurs séries ---------- */
const MODELES_RITUELS = [
  { title: 'Méditation du matin', category: 'spiritual', weekDays: [0, 1, 2, 3, 4, 5, 6], startTime: '07:00', endTime: '07:15' },
  { title: 'Lecture du soir', category: 'learning', weekDays: [1, 2, 3, 4, 5], startTime: '21:00', endTime: '21:30' },
  { title: 'Étirements', category: 'health', weekDays: [1, 3, 5], startTime: '18:00' },
  { title: 'Marche après le déjeuner', category: 'health', weekDays: [1, 2, 3, 4, 5], startTime: '13:30', endTime: '13:50' },
  { title: 'Gratitude du soir', category: 'spiritual', weekDays: [0, 1, 2, 3, 4, 5, 6], startTime: '22:00' },
  { title: 'Revue de la semaine', category: 'learning', weekDays: [0], startTime: '18:00', endTime: '18:30' },
];
function rituels(c, m, n, joursDeSerie) {
  const docs = [];
  for (let i = 0; i < n; i += 1) {
    const r = MODELES_RITUELS[i % MODELES_RITUELS.length];
    const id = `ct-rit${i + 1}`;
    const cree = jour(m, -90 - i * 10);
    docs.push({ chemin: `users/${c.uid}/rituals/${id}`, donnees: {
      userId: c.uid, title: i < MODELES_RITUELS.length ? r.title : `${r.title} (${i + 1})`, description: '', category: r.category,
      recurrence: { type: 'weekly', interval: 1, weekDays: r.weekDays },
      timeConfig: { startTime: r.startTime, ...(r.endTime ? { endTime: r.endTime } : {}) },
      startDate: cree, status: 'active', isActive: true,
      stats: { totalOccurrences: 0, completedOccurrences: 0, currentStreak: 0, longestStreak: 0, completionRate: 0 },
      isArchived: false, createdAt: cree, updatedAt: cree,
    } });
    /* Une série : joursDeSerie jours de suite, un trou, puis hier. */
    if (i < 2) {
      const jours = [];
      for (let d = joursDeSerie + 2; d > 2; d -= 1) jours.push(-d);
      jours.push(-1);
      jours.forEach((d) => {
        const quand = jour(m, d, 7, 10);
        docs.push({ chemin: `users/${c.uid}/ritual_completions/${id}_${cleJour(quand)}`, donnees: { ritualId: id, userId: c.uid, completedDate: cleJour(quand), completedAt: quand } });
      });
    }
  }
  return docs;
}

/* ---------- Journal ---------- */
const TEXTES_JOURNAL = [
  'Belle journée au parc, le soleil est revenu. Les enfants ont couru partout.',
  'Réunion difficile mais constructive.\n\nDemain, je reprends le dossier avec les idées de Camille.',
  'Première séance de course depuis longtemps. Les jambes s\'en souviennent, mais quel bien fou.',
  'Dîner chez Paul et Sarah. On a parlé du voyage de l\'été, l\'Écosse semble faire l\'unanimité.',
  'Journée calme. J\'ai enfin rangé le bureau et trié les vieux papiers.',
  'Un peu fatigué ce soir. Coucher tôt, et pas d\'écran après 22 h.',
];
const HUMEURS = ['peaceful', 'happy', 'grateful', 'tired', 'motivated'];
const journal = (c, m, n) => Array.from({ length: n }, (_, i) => {
  const quand = jour(m, -i * 2, 20);
  const texte = TEXTES_JOURNAL[i % TEXTES_JOURNAL.length];
  return { chemin: `users/${c.uid}/journals/ct-j${num(i + 1, 3)}`, donnees: {
    userId: c.uid, title: `Journal du ${quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    encryptedContent: texte, iv: 'temp-iv', salt: 'temp-salt', authTag: 'temp-auth', isArchived: false, tags: [],
    wordCount: texte.split(/\s+/).length, writingTime: 0, mood: HUMEURS[i % HUMEURS.length], entryDate: quand, createdAt: quand, updatedAt: quand,
  } };
});

/* ---------- Dates importantes ---------- */
const MODELES_DATES = [
  { title: 'Anniversaire de Léa', type: 'birthday', mois: 5, jour: 12, isRecurring: true, referenceYear: 1990, color: '#FF6B6B' },
  { title: 'Anniversaire de mariage', type: 'anniversary', mois: 8, jour: 20, isRecurring: true, referenceYear: 2018, color: '#A78BFA' },
  { title: 'Salon du livre', type: 'event', decalage: 20, isRecurring: false, color: '#4ECDC4' },
  { title: 'Renouveler le passeport', type: 'reminder', decalage: 45, isRecurring: false, color: '#FFD93D' },
  { title: 'Anniversaire de Tom', type: 'birthday', mois: 1, jour: 28, isRecurring: true, referenceYear: 2004, color: '#FF6B6B' },
  { title: 'Contrôle technique de la voiture', type: 'reminder', decalage: 75, isRecurring: false, color: '#FFD93D' },
];
const datesImportantes = (c, m, n) => Array.from({ length: n }, (_, i) => {
  const d = MODELES_DATES[i % MODELES_DATES.length];
  const tour = Math.floor(i / MODELES_DATES.length);
  const date = d.decalage !== undefined ? jour(m, d.decalage + tour * 9, 0) : new Date(m.getFullYear(), d.mois, d.jour + tour, 0, 0, 0);
  return { chemin: `users/${c.uid}/importantDates/ct-d${num(i + 1, 3)}`, donnees: {
    userId: c.uid, title: tour ? `${d.title} (${tour + 1})` : d.title, fullDate: date, time: '', type: d.type, color: d.color,
    description: '', isRecurring: d.isRecurring, ...(d.referenceYear ? { referenceYear: d.referenceYear } : {}),
    reminders: [], isArchived: false, createdAt: jour(m, -100), updatedAt: jour(m, -100),
  } };
});

/* ---------- Voyages ---------- */
const MODELES_VOYAGES = [
  { title: 'Week-end à Lisbonne', country: 'Portugal', city: 'Lisbonne', lat: 38.7223, lng: -9.1393, debut: -120, duree: 3 },
  { title: 'Randonnée dans les Vosges', country: 'France', city: 'Gérardmer', lat: 48.0708, lng: 6.8779, debut: -40, duree: 2 },
  { title: 'Séjour à Rome', country: 'Italie', city: 'Rome', lat: 41.9028, lng: 12.4964, debut: -300, duree: 5 },
  { title: 'Vacances en Bretagne', country: 'France', city: 'Saint-Malo', lat: 48.6493, lng: -2.0257, debut: -200, duree: 7 },
];
const voyages = (c, m, n, plan) => Array.from({ length: n }, (_, i) => {
  const v = MODELES_VOYAGES[i % MODELES_VOYAGES.length];
  const id = `ct-v${num(i + 1, 2)}`;
  const debut = v.debut - Math.floor(i / MODELES_VOYAGES.length) * 365;
  return { chemin: `users/${c.uid}/trips/${id}`, donnees: {
    id, userId: c.uid, userEmail: c.email, title: i < MODELES_VOYAGES.length ? v.title : `${v.title} (${Math.floor(i / MODELES_VOYAGES.length) + 1})`, description: '',
    country: v.country, city: v.city, location: { lat: v.lat, lng: v.lng },
    date: { start: jour(m, debut, 0), end: jour(m, debut + v.duree, 0) }, photos: [],
    isFavorite: i === 0, isArchived: false, createdAt: jour(m, debut + v.duree + 1), updatedAt: jour(m, debut + v.duree + 1),
    source: 'mobile', deviceInfo: { os: 'ios', model: 'compte-test' }, locale: 'fr', userPlan: plan,
    adminStats: { hasPhotos: false, wordCount: 0, durationDays: v.duree },
  } };
});

/* ---------- Idées ---------- */
const TEXTES_IDEES = ['Une application pour échanger des plantes entre voisins', 'Cuisiner un plat d\'un pays différent chaque semaine',
  'Écrire une nouvelle policière', 'Organiser une chasse au trésor pour l\'anniversaire', 'Apprendre à jouer du ukulélé',
  'Monter un club de lecture au bureau', 'Repeindre la chambre en vert sauge', 'Faire un album photo de l\'année'];
const COULEURS_IDEES = [null, '#FFE08A', '#B5EAD7', '#C7CEEA', '#FFB7B2'];
const idees = (c, m, n) => Array.from({ length: n }, (_, i) => ({ chemin: `users/${c.uid}/ideas/ct-i${num(i + 1, 3)}`, donnees: {
  userId: c.uid, text: i < TEXTES_IDEES.length ? TEXTES_IDEES[i] : `${TEXTES_IDEES[i % TEXTES_IDEES.length]} (${Math.floor(i / TEXTES_IDEES.length) + 1})`,
  highlighted: i % 7 === 1, pinned: i % 9 === 2, color: COULEURS_IDEES[i % COULEURS_IDEES.length], isArchived: false,
  createdAt: jour(m, -i), updatedAt: jour(m, -i),
} }));

/* ---------- Notes rapides (web) ---------- */
const TEXTES_NOTES = ['Code du portail : demander à la voisine', 'Penser à racheter des piles AAA', 'Idée cadeau pour Léa : un carnet de voyage',
  'Numéro du plombier : sur le frigo', 'Film à voir : Le Comte de Monte-Cristo', 'Rendre le livre à la médiathèque avant le 20'];
const COULEURS_NOTES = ['#FFF59D', '#C5E1A5', '#FFCCBC', '#B3E5FC'];
const notes = (c, m, n) => Array.from({ length: n }, (_, i) => ({ chemin: `users/${c.uid}/quickNotes/ct-n${num(i + 1, 3)}`, donnees: {
  content: i < TEXTES_NOTES.length ? TEXTES_NOTES[i] : `${TEXTES_NOTES[i % TEXTES_NOTES.length]} (${Math.floor(i / TEXTES_NOTES.length) + 1})`,
  color: COULEURS_NOTES[i % COULEURS_NOTES.length], x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 200, width: 200, height: 180,
  rotation: [-2, 1, 0, 2][i % 4], createdAt: jour(m, -i, 12), updatedAt: jour(m, -i, 12),
} }));

/* ---------- Listes de courses (web) ---------- */
const MODELES_COURSES = [
  { name: 'Courses de la semaine', items: [['Lait', '2 L'], ['Œufs', '12'], ['Pain complet', '1'], ['Pommes', '1 kg'], ['Café', '1 paquet'], ['Yaourts nature', '8']] },
  { name: 'Apéritif de samedi', items: [['Olives', '1 pot'], ['Chips', '2 sachets'], ['Jus de pomme', '1 L'], ['Fromage', '300 g']] },
  { name: 'Bricolage', items: [['Vis de 4 mm', '1 boîte'], ['Ruban de masquage', '2'], ['Peinture blanche', '2,5 L']] },
];
const courses = (c, m, n) => Array.from({ length: n }, (_, i) => {
  const l = MODELES_COURSES[i % MODELES_COURSES.length];
  return { chemin: `users/${c.uid}/shoppingLists/ct-l${num(i + 1, 2)}`, donnees: {
    name: i < MODELES_COURSES.length ? l.name : `${l.name} (${Math.floor(i / MODELES_COURSES.length) + 1})`,
    items: l.items.map(([nom, quantite], j) => ({ id: `ct-l${i + 1}-a${j + 1}`, name: nom, quantity: quantite, checked: j % 3 === 0 })),
    createdAt: jour(m, -i * 3), updatedAt: jour(m, -i * 3),
  } };
});

/* ---------- Données suivies (écran Statistiques) ---------- */
const MODELES_DONNEES = [
  { nom: 'Poids', unite: 'kg', couleur: '#4ECDC4', icone: 'scale', depart: 75, pas: -0.03 },
  { nom: 'Sommeil', unite: 'h', couleur: '#5E5CE6', icone: 'sleep', depart: 6.5, pas: 0.004 },
  { nom: 'Pas', unite: 'pas', couleur: '#FF9500', icone: 'walk', depart: 6000, pas: 12 },
  { nom: 'Verres d\'eau', unite: 'verres', couleur: '#22C3E6', icone: 'cup-water', depart: 5, pas: 0.01 },
];
function donneesSuivies(c, m, series, valeursParSerie) {
  const docs = [];
  for (let s = 0; s < series; s += 1) {
    const d = MODELES_DONNEES[s % MODELES_DONNEES.length];
    const id = `ct-don${s + 1}`;
    docs.push({ chemin: `users/${c.uid}/user_data/${id}`, donnees: { userId: c.uid, name: d.nom, description: '', type: 'data', recurrence: 'day',
      unit: d.unite, color: d.couleur, icon: d.icone, isActive: true, createdAt: jour(m, -valeursParSerie * 2 - 5), updatedAt: jour(m, -1) } });
    for (let v = 0; v < valeursParSerie; v += 1) {
      const quand = jour(m, -(valeursParSerie - v) * 2, 8);
      const valeur = Math.round((d.depart + d.pas * v * 2) * 10) / 10;
      docs.push({ chemin: `users/${c.uid}/data_values/${id}-v${num(v + 1, 3)}`, donnees: { dataId: id, userId: c.uid, value: valeur, date: cleJour(quand), createdAt: quand, updatedAt: quand } });
    }
  }
  return docs;
}

/* ---------- Ce que reçoit un compte ---------- */
/** « Remplir mon compte » : un compte de tous les jours. */
const remplir = (c, m, plan) => [
  ...profil(c, m), ...packsDejaPoses(c, m), ...tachesOrdinaires(c, m), ...objectifs(c, m, 3), ...rituels(c, m, 3, 5),
  ...journal(c, m, 4), ...datesImportantes(c, m, 5), ...voyages(c, m, 2, plan), ...idees(c, m, 6), ...notes(c, m, 4),
  ...courses(c, m, 2), ...donneesSuivies(c, m, 1, 8),
];

/** « Remplir à fond » : 1 500 tâches et le reste en proportion, pour la rapidité. */
const remplirAFond = (c, m, plan) => [
  ...profil(c, m), ...packsDejaPoses(c, m), ...tachesChargees(c, m), ...objectifs(c, m, 12), ...rituels(c, m, 8, 12),
  ...journal(c, m, 120), ...datesImportantes(c, m, 40), ...voyages(c, m, 12, plan), ...idees(c, m, 80), ...notes(c, m, 30),
  ...courses(c, m, 8), ...donneesSuivies(c, m, 4, 60),
];

module.exports = { remplir, remplirAFond, profilMinimal, hasard, jour, cleJour, RECURRENTES };
