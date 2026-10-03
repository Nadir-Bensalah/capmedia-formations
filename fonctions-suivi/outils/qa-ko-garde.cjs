require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la garde serveur des anomalies (suiviPassageKo)

   Une anomalie part chez le client : activité, courriel, notification. Elle
   ne doit naître que d'un échec sur un scénario qui existe (dans le plan de
   tests, ou dans l'ancienne bibliothèque) et d'un passage dont
   l'identifiant colle au testeur et au scénario. Les passages sont posés
   ici en propriétaire, par REST, sans les règles : c'est le serveur seul
   qu'on éprouve, comme s'il recevait un passage qui aurait franchi les
   règles d'une manière ou d'une autre.

     (émulateurs avec les fonctions ; aucun semis propre)
   ========================================================================== */
const PROJET = 'capmedia-1f90d';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prop = { Authorization: 'Bearer owner' };
const bdd = (c) => `${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire = async (c) => { const r = await fetch(bdd(c), { headers: prop }); return r.ok ? r.json() : null; };
const effacer = (c) => fetch(bdd(c), { method: 'DELETE', headers: prop }).catch(() => {});
const poser = async (chemin, fields) => {
  const r = await fetch(bdd(chemin), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`écriture refusée : ${chemin} (${r.status})`);
};
const S = (v) => ({ stringValue: v });
const T = (d) => ({ timestampValue: d.toISOString() });
const L = (l) => ({ arrayValue: { values: l } });
const soucis = []; const ok = (m) => console.log('  ok     ' + m); const dire = (m) => { soucis.push(m); console.log('  ÉCART  ' + m); };
const verifier = (c, m) => (c ? ok(m) : dire(m));
const attendre = async (chemin, ms = 30000) => { for (let i = 0; i < ms / 500; i++) { const d = await lire(chemin); if (d) return d; await pause(500); } return null; };

const CID = 'qa-ko-garde';
const passage = (scenario, testeur, plateforme, resultat, date) => ({
  scenario: S(scenario), testeur: S(testeur), plateforme: S(plateforme), resultat: S(resultat),
  commentaire: S('Rien ne se passe.'), preuves: L([S(`campagnes/atelier/${CID}/${testeur}/a.png`)]),
  contexte: { mapValue: { fields: { agent: S('Safari') } } }, cree: T(date), maj: T(date),
});

(async () => {
  for (const a of ['ko-connexion-f-001', 'ko-connexion-f-002', 'ko-INVENTE-appelez-le-0600000000', 'ko-QA-LEG-01']) await effacer(`projets/atelier/anomalies/${a}`);
  await poser('projets/atelier/planTests/connexion', {
    id: S('connexion'), groupe: S('socle'), ordre: { integerValue: '1' }, titre: S('Connexion'), resume: S(''), plateformes: L([S('ios'), S('web')]),
    aspects: { mapValue: { fields: {
      fonctionnel: L([
        { mapValue: { fields: { id: S('connexion-f-001'), titre: S('Se connecter avec un code'), qui: S('humain') } } },
        { mapValue: { fields: { id: S('connexion-f-002'), titre: S('Se déconnecter'), qui: S('humain') } } },
      ]),
      technique: L([]), ux: L([]), securite: L([]),
    } } },
  });
  await poser('projets/atelier/scenarios/QA-LEG-01', { ref: S('QA-LEG-01'), bloc: S('idees'), titre: S('Ancien scénario'), actif: { booleanValue: true } });
  await poser(`projets/atelier/campagnes/${CID}`, { titre: S('Garde des KO'), statut: S('en-cours'), testeurs: L([S('uid-karim'), S('uid-sonia')]) });

  console.log('\n== Ce qui ne doit PAS devenir une anomalie');
  const maintenant = new Date();
  /* Un scénario inventé : le texte serait parti chez le client. */
  await poser(`projets/atelier/campagnes/${CID}/passages/uid-karim__INVENTE-appelez-le-0600000000__ios`, passage('INVENTE-appelez-le-0600000000', 'uid-karim', 'ios', 'echec', maintenant));
  /* Un identifiant qui ne colle pas au testeur. */
  await poser(`projets/atelier/campagnes/${CID}/passages/uid-sonia__connexion-f-002__ios`, passage('connexion-f-002', 'uid-karim', 'ios', 'echec', maintenant));

  console.log('\n== Ce qui en devient une');
  await poser(`projets/atelier/campagnes/${CID}/passages/uid-karim__connexion-f-001__ios`, passage('connexion-f-001', 'uid-karim', 'ios', 'echec', maintenant));
  const plan = await attendre('projets/atelier/anomalies/ko-connexion-f-001');
  verifier(Boolean(plan), 'Un échec sur un scénario du plan fait une anomalie');
  const f = (plan && plan.fields) || {};
  verifier((f.titre || {}).stringValue === 'Se connecter avec un code', `elle porte le titre du plan (${(f.titre || {}).stringValue || 'aucun'})`);
  verifier((f.origine || {}).stringValue === 'testeur', 'et vient du testeur');
  /* Ancien passage, ancienne bibliothèque : toujours rangé. */
  await poser(`projets/atelier/campagnes/${CID}/passages/uid-karim__QA-LEG-01`, {
    scenario: S('QA-LEG-01'), testeur: S('uid-karim'), plateforme: S('ios'), resultat: S('ko'), commentaire: S('x'), preuves: L([]), le: T(new Date()),
  });
  const ancien = await attendre('projets/atelier/anomalies/ko-QA-LEG-01');
  verifier(Boolean(ancien) && ((ancien.fields || {}).titre || {}).stringValue === 'Ancien scénario', 'Un « ko » d avant le plan, sur la bibliothèque, fait encore son anomalie');

  /* Les deux premiers passages ont été écrits AVANT ceux qui ont abouti :
     leurs déclencheurs sont passés. Une marge, puis on vérifie. */
  await pause(5000);
  verifier(!(await lire('projets/atelier/anomalies/ko-INVENTE-appelez-le-0600000000')), 'Un scénario inventé ne fait pas d anomalie');
  verifier(!(await lire('projets/atelier/anomalies/ko-connexion-f-002')), 'Un identifiant qui ne colle pas au testeur ne fait pas d anomalie');

  console.log(soucis.length ? `\n${soucis.length} ÉCART(S)` : '\nTout est conforme.');
  process.exit(soucis.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
