require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'espace testeur à l'épreuve

   Le cloisonnement d'abord : un testeur qui verrait les réponses des
   autres cocherait comme eux. Ça s'appelle l'ancrage, et ça ruine une
   campagne entière sans que rien ne le signale. On vérifie donc qu'il ne
   voit AUCUN autre testeur, et qu'il ne peut atteindre ni les passages
   d'autrui, ni les demandes, ni les devis, ni le vivier.

   Puis ce qui fait la valeur d'un rapport : un échec sans preuve n'est pas
   un rapport, c'est une opinion. Le refus est côté serveur, mais il doit
   se dire AVANT que le testeur ait tout tapé.

   Cette suite attend une campagne EN COURS avec six testeurs inscrits au
   vivier et une affectation. Sans elle, le testeur arrive sur un écran
   vide et tout tombe d'un coup : ce n'est pas une régression.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/semer-campagne.mjs <plan.md>
     node fonctions-suivi/outils/qa-testeur.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE=BANC.site;
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`${BANC.firestore}/v1/${d.name}`,{method:'DELETE',headers:prop});};
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=100');const p=((j&&j.documents)||[]).filter(d=>{const a=((((d.fields||{}).a||{}).arrayValue)||{}).values||[];return a.some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e);});if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
/* Les courriels de code ne sont jamais purgés par l'application, et la
   lecture REST rend les cent premiers par identifiant, pas par date :
   passé cent envois, le code le plus récent peut manquer à la page, et la
   suite tape un code périmé. On vide donc AVANT d'en demander un neuf. */
const connecter=async(page,email)=>{await vider('envois');await vider('connexions');await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
  await page.fill('#email',email);await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
  await page.fill('#code',await dernierCode(email));
  await pause(5000);};
const soucis=[];const ok=m=>console.log('  ok     '+m);
const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));

(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:430,height:900}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,180)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,180));});

  /* Ce que l'affectation lui confie (modèle du 03/10/2026) : des clés
     « scénario du plan, plateforme ». Le compte se lit en base, jamais en
     dur : il dépend de la répartition. */
  const vivier = ((await lire('testeurs?pageSize=50'))||{}).documents||[];
  const fK = vivier.find(d=>((d.fields.prenom||{}).stringValue)==='Karim');
  const karim = fK ? fK.name.split('/').pop() : '';
  const oct = await lire('projets/atelier/campagnes/c-oct');
  const aK = (((((oct||{}).fields||{}).affectation||{}).mapValue||{}).fields||{})[karim];
  const sesCles = ((((((aK||{}).mapValue||{}).fields||{}).cles||{}).arrayValue||{}).values||[]).map(v=>v.stringValue);
  const N = sesCles.length;
  const tout = Object.values(((((oct||{}).fields||{}).affectation||{}).mapValue||{}).fields||{}).reduce((n,e)=>n+((((((e.mapValue||{}).fields||{}).cles||{}).arrayValue||{}).values||[]).length),0);
  verifier(N>0&&N<tout,`son affectation lui confie ${N} passages sur ${tout}`);

  console.log('\n== Le testeur arrive sur son espace');
  await connecter(page,'karim.testeur@essai.test');
  /* La première fois, l'accueil passe devant tout : cette suite ne le teste pas (qa-espace-testeur), elle va droit à la campagne. */
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 20000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }); }
  const ou = await page.evaluate(()=>({ url: location.pathname, titre: document.title, h1:(document.querySelector('h1')||{}).innerText||'' }));
  verifier(/\/suivi\/testeur/.test(ou.url),'il est redirigé vers son espace',ou.url);
  verifier(/Bonjour Karim/.test(ou.h1),'la page le nomme',ou.h1);

  /* Depuis le 23/09/2026, il arrive sur son TABLEAU : une case par
     scénario. La liste, elle, reste à un geste. */
  await page.waitForSelector('.tb-case',{timeout:20000}).catch(()=>{});
  const cases = await page.$$eval('.tb-case',x=>x.length);
  verifier(cases===N,`son tableau a ${N} cases, les siennes seulement`,`${cases}`);
  verifier(await page.$$eval('.tb-case',x=>x.every(b=>b.dataset.e==='vide')),'toutes à faire, en contour, aucune orange le premier jour');
  await page.click('[data-vue="liste"]'); await pause(800);

  const v = await page.evaluate(()=>({
    scenarios: document.querySelectorAll('.t-scenario').length,
    ouvrir: document.querySelectorAll('.t-scenario [data-ouvrir]').length,
    choix: document.querySelectorAll('.t-choix, [data-poser]').length,
    jauge: !!document.querySelector('.testeur-tete .tb-barre'),
    suite: (document.querySelector('.t-suite-sur')||{}).innerText||'',
    chapo:(document.querySelector('.chapo')||{}).innerText||'',
    autres: /Sonia|Marc|Ines|Hugo|Leila/.test(document.body.innerText),
  }));
  console.log('    ', v.chapo);
  verifier(v.scenarios===N,`il voit ses ${N} passages, pas toute la campagne`,`${v.scenarios}`);
  /* Depuis le 03/10/2026, une ligne ouvre la feuille : on ne pose pas un
     résultat sans avoir lu ce qui doit se passer. */
  verifier(v.ouvrir===N&&v.choix===0,'chaque ligne ouvre sa feuille, sans bouton de résultat',`${v.ouvrir} / ${v.choix}`);
  verifier(v.jauge,'sa jauge d\'avancement est là');
  verifier(/sur (iPhone|Android|Web)/i.test(v.suite),'le geste suivant dit sur quoi, imposé par son affectation',v.suite);
  verifier(!v.autres,'il ne voit AUCUN autre testeur');

  console.log('\n== La plateforme vient de son affectation');
  /* Il n'a rien choisi (stockage neuf) : le résultat part quand même sur
     la plateforme de sa clé, jamais sur un choix libre. */
  const cle1 = await page.evaluate(()=>(document.querySelector('[data-continuer]')||{}).dataset.continuer||'');
  verifier(sesCles.includes(cle1),'le premier passage proposé est une de ses clés',cle1);
  await page.click('[data-continuer]'); await page.waitForSelector('[data-feuille-poser="ok"]',{timeout:10000}).catch(()=>{});
  await page.click('[data-feuille-poser="ok"]'); await pause(2200);
  const enBase = await lire(`projets/atelier/campagnes/c-oct/passages?pageSize=100`);
  const docs = ((enBase&&enBase.documents)||[]);
  verifier(docs.length===1,'le passage est enregistré',`${docs.length}`);
  if (docs.length) {
    const f = docs[0].fields;
    verifier((f.resultat||{}).stringValue==='reussi','avec le résultat en toutes lettres (reussi)',(f.resultat||{}).stringValue);
    verifier((f.plateforme||{}).stringValue===cle1.split('__')[1],'et la plateforme de sa clé',(f.plateforme||{}).stringValue);
    verifier((f.scenario||{}).stringValue===cle1.split('__')[0],'sur le scénario du plan',(f.scenario||{}).stringValue);
    const ctx = ((f.contexte||{}).mapValue||{}).fields||{};
    verifier(Object.keys(ctx).length>=4,'le contexte de l\'appareil est relevé',Object.keys(ctx).join(','));
    verifier(docs[0].name.endsWith(`/${karim}__${cle1}`),'l\'identifiant est uid__scénario__plateforme',docs[0].name.split('/').pop());
  }

  console.log('\n== Un échec sans preuve');
  /* Un résultat posé ouvre la feuille du suivant. */
  await page.waitForSelector('[data-feuille-poser="ko"]',{timeout:10000}).catch(()=>{});
  await page.click('[data-feuille-poser="ko"]'); await pause(1300);
  verifier(await page.evaluate(()=>!!document.querySelector('#t-quoi')),'une feuille demande ce qui s\'est passé');
  await page.fill('#t-quoi','Rien ne se passe quand j\'appuie sur Valider.');
  await page.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();const b=v&&v.querySelector('[data-valider]');if(b)b.click();}); await pause(900);
  const t2 = await page.evaluate(()=>((document.querySelector('.toasts')||{}).innerText||'').trim());
  verifier(/preuve|capture/i.test(t2),'un échec sans preuve est refusé',t2||'(rien)');
  verifier(await page.evaluate(()=>!!document.querySelector('#t-quoi')),'et la feuille reste ouverte');
  await page.keyboard.press('Escape'); await pause(700);
  verifier(((await lire(`projets/atelier/campagnes/c-oct/passages?pageSize=100`))||{documents:[]}).documents.length===1,'et rien d\'autre n\'est enregistré');

  console.log('\n== Ce qu\'il ne peut pas atteindre');
  const interdit = await page.evaluate(async () => {
    const r = {};
    try { const m = await import('/suivi/assets/js/noyau.js');
      try { await m.getDocs(m.collection(m.bdd,'projets','atelier','campagnes','c-oct','passages')); r.tous='LU'; }
      catch(e){ r.tous='refusé'; }
      try { await m.getDocs(m.collection(m.bdd,'tickets')); r.demandes='LU'; } catch(e){ r.demandes='refusé'; }
      try { await m.getDocs(m.collection(m.bdd,'documents')); r.devis='LU'; } catch(e){ r.devis='refusé'; }
      try { await m.getDocs(m.collection(m.bdd,'testeurs')); r.vivier='LU'; } catch(e){ r.vivier='refusé'; }
    } catch(e){ r.erreur=e.message.slice(0,90); }
    return r;
  });
  verifier(interdit.tous==='refusé','il ne lit pas les passages des autres',interdit.tous);
  verifier(interdit.demandes==='refusé','ni les demandes du projet',interdit.demandes);
  verifier(interdit.devis==='refusé','ni les devis',interdit.devis);
  verifier(interdit.vivier==='refusé','ni la liste des testeurs',interdit.vivier);

  console.log('\n== Deux campagnes en cours (G4)');
  /* Une seconde campagne en cours lui est confiée : il doit voir les deux,
     la plus récente d'abord, et passer de l'une à l'autre. Avant, il ne
     voyait que la première au hasard de l'ordre de la base. */
  const autres = sesCles.filter(k=>k!==cle1).slice(0,2);
  const sv = (x)=>({stringValue:x});
  await fetch(`${bdd('projets/atelier/campagnes/c-nov')}`,{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields:{
    titre:sv('Campagne de novembre'), statut:sv('en-cours'), plan:{booleanValue:true},
    testeurs:{arrayValue:{values:[sv(karim)]}},
    scenarios:{arrayValue:{values:autres.map(k=>sv(k.split('__')[0]))}},
    affectation:{mapValue:{fields:{[karim]:{mapValue:{fields:{telephone:sv(((aK||{}).mapValue||{}).fields.telephone.stringValue), web:{booleanValue:true}, vague:{integerValue:'1'}, cles:{arrayValue:{values:autres.map(sv)}}}}}}}},
    cree:{timestampValue:new Date().toISOString()},
  }})});
  await page.reload(); await page.waitForSelector('.t-campagnes [data-campagne]',{timeout:20000}).catch(()=>{});
  await pause(1500);
  /* Plus haut, la suite est passée en liste : on revient au tableau. */
  if (await page.$('[data-vue="grille"][aria-pressed="false"]')) { await page.click('[data-vue="grille"]'); await pause(800); }
  const deux = await page.evaluate(()=>[...document.querySelectorAll('.t-campagnes [data-campagne]')].map(b=>({t:b.innerText.trim(),cle:b.dataset.campagne,actif:b.getAttribute('aria-pressed')==='true'})));
  verifier(deux.length===2,'il voit ses deux campagnes en cours',JSON.stringify(deux));
  verifier(deux.length===2&&deux[0].cle==='atelier/c-nov'&&deux[0].actif,'la plus récente d\'abord, ouverte',JSON.stringify(deux));
  verifier(await page.$$eval('.tb-case',x=>x.length)===autres.length,`son tableau est celui de la campagne ouverte (${autres.length} cases)`,`${await page.$$eval('.tb-case',x=>x.length)}`);
  verifier(/Campagne de novembre/.test(await page.textContent('.testeur-tete .surtitre')),'l\'en-tête la nomme');
  await page.click('[data-campagne="atelier/c-oct"]'); await pause(2000);
  const casesOct = await page.$$eval('.tb-case',x=>x.length);
  verifier(casesOct===N,`un geste et il passe à l\'autre : ses ${N} cases`,`${casesOct}`);
  verifier(await page.$$eval('.tb-case',x=>x.filter(b=>b.dataset.e==='ok').length)===1,'avec le passage déjà fait, rien de perdu');
  await page.reload(); await page.waitForSelector('.t-campagnes [data-campagne]',{timeout:20000}).catch(()=>{}); await pause(1500);
  verifier(await page.$eval('[data-campagne="atelier/c-oct"]',b=>b.getAttribute('aria-pressed')==='true').catch(()=>false),'son choix se retient à la visite suivante');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close();
  process.exit(soucis.length?1:0);
})();
