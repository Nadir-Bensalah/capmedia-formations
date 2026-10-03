require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA TEST · « Répartir » à l'épreuve, dans la vraie page

   La règle elle-même est éprouvée sans navigateur dans
   repartition.test.mjs, sur le même module. Ici, ce que seule la page et
   le serveur peuvent prouver :
   - la répartition part du plan de tests du projet, scénarios humains seuls ;
   - un aperçu montre la charge de chacun, et RIEN n'est écrit avant qu'on
     l'accepte, surtout quand une répartition existe déjà ;
   - l'affectation enregistrée suit le modèle commun
     { telephone, web, cles, vague } et la règle (2 testeurs pour un
     humain seul, 1 pour humain et robot, son téléphone et le web) ;
   - le serveur inscrit au projet un testeur qui ne l'était pas ;
   - le client regarde sans toucher.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/semer-campagne.mjs <plan.md>
     node fonctions-suivi/outils/qa-affectation.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const admin = require('../node_modules/firebase-admin');
const PROJET='capmedia-1f90d', SITE=BANC.site;
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`${BANC.firestore}/v1/${d.name}`,{method:'DELETE',headers:prop});};
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=100');const p=((j&&j.documents)||[]).filter(d=>{const a=((((d.fields||{}).a||{}).arrayValue)||{}).values||[];return a.some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e);});if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
const connecter=async(page,email)=>{await vider('envois');await vider('connexions');await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
  await page.fill('#email',email);await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
  await page.fill('#code',await dernierCode(email));
  await page.waitForSelector('.page h1',{timeout:30000}).catch(()=>{});await pause(2500);};
const aller=async(page,hash,attendu,titre)=>{for(let i=0;i<6;i++){
  await page.evaluate(h=>{location.hash=h;},hash);
  await page.evaluate(()=>window.dispatchEvent(new HashChangeEvent('hashchange')));
  await pause(1600);
  const bon=await page.evaluate(([sel,t])=>{if(t&&((document.querySelector('.page h1')||{}).innerText||'').trim()!==t)return false;return !sel||!!document.querySelector(sel);},[attendu||null,titre||null]);
  if(bon)return;}};
const soucis=[];const ok=m=>console.log('  ok     '+m);
const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));

/* Un petit plan, posé par la suite : de quoi savoir exactement ce qui est
   attendu. 4 clés « humain seul » (8 affectations), 7 clés « humain et
   robot » (7 affectations), des robots qui ne doivent jamais partir. */
const SECTIONS = {
  'qa-reglages': { titre: 'Réglages', groupe: 'fonctionnalites', ordre: 2, aspects: {
    fonctionnel: [
      { id: 'qr-f-001', titre: 'Changer de langue', qui: 'humain', priorite: 'haute', plateformes: ['ios', 'android'] },
      { id: 'qr-f-002', titre: 'Exporter mes données', qui: 'les-deux', priorite: 'moyenne', plateformes: ['ios', 'android', 'web'] },
      { id: 'qr-f-003', titre: 'Rejouer le tutoriel', qui: 'robot', priorite: 'haute', plateformes: ['ios', 'android', 'web'] },
    ],
    ux: [{ id: 'qr-u-001', titre: 'Le texte se lit en grand', qui: 'humain', priorite: 'basse', plateformes: ['web', 'ios'] }],
  } },
  'qa-taches': { titre: 'Tâches', groupe: 'fonctionnalites', ordre: 1, aspects: {
    fonctionnel: [
      { id: 'qt-f-001', titre: 'Créer une tâche', qui: 'les-deux', priorite: 'haute', plateformes: ['ios', 'android', 'web'] },
      { id: 'qt-f-002', titre: 'Supprimer une tâche', qui: 'robot', priorite: 'moyenne', plateformes: ['ios'] },
      { id: 'qt-f-003', titre: 'Partager une tâche', qui: 'les-deux', priorite: 'basse', plateformes: ['android'] },
    ],
  } },
};
const NB = { humain: 2, 'les-deux': 1 };
const ATTENDU = new Map();
Object.values(SECTIONS).forEach((s) => Object.values(s.aspects).flat().forEach((sc) => {
  if (NB[sc.qui]) sc.plateformes.forEach((p) => ATTENDU.set(`${sc.id}__${p}`, { n: NB[sc.qui], p, vague: sc.priorite === 'haute' ? 1 : 2 }));
}));

(async()=>{
  admin.initializeApp({ projectId: PROJET });
  const db = admin.firestore();
  for (const [id, s] of Object.entries(SECTIONS)) await db.doc(`projets/atelier/planTests/${id}`).set(s);
  /* Leila n'est inscrite à aucun projet : seul le serveur peut l'y mettre. */
  const vivier = (await db.collection('testeurs').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const leila = vivier.find((t) => t.prenom === 'Leila');
  if (leila) await db.doc(`testeurs/${leila.id}`).update({ projets: [] });
  const mobileDe = Object.fromEntries(vivier.map((t) => [t.id, t.mobile]));
  const avantCampagne = (await db.doc('projets/atelier/campagnes/c-oct').get()).data() || {};
  const empreinteAvant = JSON.stringify(avantCampagne.affectation || {});
  await pause(2500);

  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,160)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,160));});

  await connecter(page,'agent.essai@exemple.test');
  await aller(page,'/tests?projet=atelier','#onglets-tests','Tests');

  console.log('\n== Ouvrir une campagne');
  const lien = await page.$('[data-action="ouvrir-campagne"]');
  verifier(!!lien,'la campagne est cliquable');
  if (!lien) { console.log('arret'); await nav.close(); process.exit(1); }
  await lien.click(); await pause(1300);
  const f = await page.evaluate(()=>({
    feuille: !!document.querySelector('.feuille'),
    vivier: document.querySelectorAll('[data-testeur]').length,
    repartir: !!document.querySelector('[data-repartir]'),
  }));
  verifier(f.feuille,'la feuille s\'ouvre');
  verifier(f.vivier===6,'les 6 testeurs du vivier sont proposés',`${f.vivier}`);
  verifier(f.repartir,'le bouton Répartir est là');

  console.log('\n== Répartir sans testeur');
  await page.evaluate(()=>document.querySelectorAll('[data-testeur]').forEach(c=>{c.checked=false;}));
  await page.click('[data-repartir]'); await pause(800);
  verifier(await page.evaluate(()=>!!document.querySelector('.feuille') && !document.querySelector('[data-apercu-charges]')),'sans testeur, ni aperçu ni écriture');

  console.log('\n== L\'aperçu, avant toute écriture');
  await page.evaluate(()=>document.querySelectorAll('[data-testeur]').forEach(c=>{c.checked=true;}));
  await page.click('[data-repartir]');
  await page.waitForSelector('[data-apercu-charges]',{timeout:15000}).catch(()=>{});
  const a = await page.evaluate(()=>({
    lignes: [...document.querySelectorAll('[data-charge]')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.innerText.trim())),
    ecrase: (document.querySelector('[data-apercu-ecrase]')||{}).innerText||'',
    manques: !!document.querySelector('[data-apercu-manques]'),
    bouton: (document.querySelector('[data-enregistrer-repartition]')||{}).innerText||'',
    bloque: !!(document.querySelector('[data-enregistrer-repartition]')||{}).disabled,
  }));
  verifier(a.lignes.length===6,'l\'aperçu montre la charge des six',`${a.lignes.length}`);
  const totalApercu = a.lignes.reduce((n,l)=>n+Number(l[6]||0),0);
  const voulu = [...ATTENDU.values()].reduce((n,x)=>n+x.n,0);
  verifier(totalApercu===voulu,`l'aperçu annonce ${voulu} affectations (plan de la suite)`,`${totalApercu}`);
  verifier(/existe déjà/.test(a.ecrase),'il prévient qu\'une répartition existe déjà',a.ecrase.slice(0,80));
  verifier(/Remplacer/.test(a.bouton) && !a.bloque,'le geste dit « Remplacer la répartition »',a.bouton);
  verifier(!a.manques,'aucun manque avec trois iPhone et trois Android');
  await pause(1200);
  const pendant = (await db.doc('projets/atelier/campagnes/c-oct').get()).data() || {};
  verifier(JSON.stringify(pendant.affectation||{})===empreinteAvant,'rien n\'est écrit tant que l\'aperçu est ouvert');

  console.log('\n== Annuler ne change rien');
  await page.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();v.querySelector('.modale-pied [data-fermer]').click();}); await pause(1200);
  verifier(await page.evaluate(()=>!document.querySelector('[data-apercu-charges]') && !!document.querySelector('.feuille')),'l\'aperçu se ferme, la feuille reste');
  const annule = (await db.doc('projets/atelier/campagnes/c-oct').get()).data() || {};
  verifier(JSON.stringify(annule.affectation||{})===empreinteAvant,'après Annuler, l\'ancienne répartition est intacte');

  console.log('\n== Accepter');
  await page.click('[data-repartir]');
  await page.waitForSelector('[data-enregistrer-repartition]',{timeout:15000}).catch(()=>{});
  await page.click('[data-enregistrer-repartition]'); await pause(3000);
  const c = (await db.doc('projets/atelier/campagnes/c-oct').get()).data() || {};
  const aff = c.affectation || {};
  const uids = Object.keys(aff);
  verifier(uids.length===6,'six testeurs ont leur lot',`${uids.length}`);
  verifier(uids.every((u)=>aff[u] && Object.keys(aff[u]).sort().join()==='cles,telephone,vague,web'),'chaque entrée suit le modèle { telephone, web, cles, vague }',JSON.stringify(aff[uids[0]]||{}).slice(0,120));
  verifier(uids.every((u)=>aff[u].telephone===mobileDe[u]),'le téléphone imposé est celui de sa fiche');
  const qui = new Map(); const horsPlan=[]; const mauvais=[];
  uids.forEach((u)=>(aff[u].cles||[]).forEach((k)=>{
    const x = ATTENDU.get(k);
    if (!x) { horsPlan.push(k); return; }
    if (x.p!=='web' && x.p!==aff[u].telephone) mauvais.push(`${u}:${k}`);
    qui.set(k,[...(qui.get(k)||[]),u]);
  }));
  verifier(!horsPlan.length,'aucune clé en trop (ni robot, ni bibliothèque)',horsPlan.slice(0,3).join(', '));
  verifier([...ATTENDU.keys()].every((k)=>qui.has(k)),'aucune clé oubliée',[...ATTENDU.keys()].filter((k)=>!qui.has(k)).join(', '));
  verifier([...ATTENDU.entries()].every(([k,x])=>new Set(qui.get(k)||[]).size===x.n && (qui.get(k)||[]).length===x.n),'humain seul chez 2 testeurs distincts, humain et robot chez 1');
  verifier(!mauvais.length,'chacun ne reçoit que son téléphone et le web',mauvais.slice(0,3).join(', '));
  const charges = uids.map((u)=>aff[u].cles.length);
  verifier(Math.max(...charges)-Math.min(...charges)<=1,`charge équilibrée (${Math.min(...charges)} à ${Math.max(...charges)})`,charges.join('/'));
  verifier(uids.every((u)=>{const v=aff[u].cles.map((k)=>ATTENDU.get(k).vague);return v.every((x,i)=>!i||v[i-1]<=x);}),'chacun commence par la vague 1');
  verifier(JSON.stringify([...(c.testeurs||[])].sort())===JSON.stringify(uids.slice().sort()),'la liste des testeurs suit l\'affectation');

  console.log('\n== Le serveur inscrit le testeur au projet');
  let inscrite = false;
  for (let i=0;i<30 && leila;i++){ const t=(await db.doc(`testeurs/${leila.id}`).get()).data()||{}; if((t.projets||[]).includes('atelier')){inscrite=true;break;} await pause(1000); }
  verifier(!!leila && inscrite,'Leila, choisie sans être inscrite, l\'est maintenant sur « atelier »');

  console.log('\n== La feuille compte les passages de chacun');
  await pause(1500);
  await (await page.$('[data-action="ouvrir-campagne"]')).click(); await pause(1500);
  const compte = await page.evaluate(()=>(document.querySelector('.feuille')||{}).innerText||'');
  verifier(new RegExp(`${Math.max(...charges)} passages`).test(compte),'chaque testeur affiche son nombre de passages',compte.slice(0,160).replace(/\n/g,' | '));

  console.log('\n== Le client regarde sans toucher');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests?projet=atelier',null,'Campagne de tests');
  await pause(1400);
  const lc = await cl.$('[data-action="ouvrir-campagne"]');
  if (lc) { await lc.click(); await pause(1300);
    const v = await cl.evaluate(()=>({
      feuille: !!document.querySelector('.feuille'),
      repartir: document.querySelectorAll('[data-repartir]').length,
      vivier: document.querySelectorAll('[data-testeur]').length,
      voitCharges: /passages/.test((document.querySelector('.voile')||{}).innerText||''),
    }));
    verifier(v.feuille,'le client ouvre la campagne');
    verifier(v.repartir===0,'il n\'a pas le bouton Répartir');
    verifier(v.vivier===0,'ni le vivier');
    verifier(v.voitCharges,'mais il voit où en sont les testeurs');
  } else dire('le client ne peut pas ouvrir la campagne');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
