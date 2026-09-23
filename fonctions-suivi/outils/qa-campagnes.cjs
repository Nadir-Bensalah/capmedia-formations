/* ==========================================================================
   CAPMEDIA CLIENT HUB · les campagnes à l'épreuve

   Une campagne ne possède pas les scénarios, elle y pioche : les mêmes
   sont rejoués d'une version à l'autre, et c'est ce qui permet de dire
   « DI-15 est tombé trois fois sur quatre campagnes ».

   Deux pièges gardés ici, tous deux muets quand ils cèdent : une campagne
   enregistrée sans sa sélection n'a rien à distribuer et ne le dit pas, et
   un filtre « socle seulement » qui porterait sur les blocs plutôt que sur
   les scénarios ne retirerait rien, puisque chaque bloc contient au moins
   un scénario du socle.

   Cette suite crée sa campagne et attend qu'aucune autre ne porte le même
   titre. Lancée après un semis qui en pose déjà une, elle signale des
   écarts qui n'en sont pas.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/importer-scenarios.mjs atelier <plan.md> --vrai
     node fonctions-suivi/outils/qa-campagnes.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
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
  await page.waitForSelector('.page h1',{timeout:30000}).catch(()=>{});await pause(1800);};
const aller=async(page,hash,attendu,titre)=>{for(let i=0;i<6;i++){
  await page.evaluate(h=>{location.hash=h;},hash);
  await page.evaluate(()=>window.dispatchEvent(new HashChangeEvent('hashchange')));
  await pause(1600);
  const bon=await page.evaluate(([sel,t])=>{
    if(t&&((document.querySelector('.page h1')||{}).innerText||'').trim()!==t)return false;
    return !sel||!!document.querySelector(sel);},[attendu||null,titre||null]);
  if(bon)return;}};
const soucis=[];const ok=m=>console.log('  ok     '+m);
const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));

(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,160)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,160));});

  await connecter(page,'agent.essai@exemple.test');
  await aller(page,'/tests?projet=atelier','.chiffres-tests','Tests');

  console.log('\n== La bibliothèque se replie');
  const plie = await page.evaluate(()=>{const b=document.querySelector('#bibliotheque');return b?b.hidden:null;});
  verifier(plie===true,'la bibliothèque est repliée au départ',`hidden=${plie}`);
  const visible1 = await page.evaluate(()=>[...document.querySelectorAll('.scenario')].filter(e=>e.offsetParent!==null).length);
  verifier(visible1===0,'aucun scénario ne barre la route',`${visible1} visibles`);
  await page.click('[data-plier-scenarios]'); await pause(800);
  const visible2 = await page.evaluate(()=>[...document.querySelectorAll('.scenario')].filter(e=>e.offsetParent!==null).length);
  /* Les comptes réels, lus en base. Coder 173 en dur faisait tomber la
     suite au premier scénario ajouté, pour une raison qui n'est pas un
     défaut : c'est le piège du plancher, à l'envers. */
  const tousScen = [];
  { let jeton = '';
    for (let i = 0; i < 20; i += 1) {
      const j = await lire(`projets/atelier/scenarios?pageSize=300${jeton ? `&pageToken=${jeton}` : ''}`);
      (((j || {}).documents) || []).forEach((d) => tousScen.push(d));
      jeton = (j || {}).nextPageToken || ''; if (!jeton) break;
    } }
  const actifs = tousScen.filter((d) => (((d.fields || {}).actif || {}).booleanValue) !== false);
  const NIV = (d) => ((((d.fields || {}).niveau || {}).stringValue) || 'reparti');
  const nScen = actifs.length;
  const nSocle = actifs.filter((d) => ['socle', 'transversal'].includes(NIV(d))).length;
  const nBlocs = new Set(actifs.map((d) => (((d.fields || {}).bloc || {}).stringValue) || 'divers')).size;
  const nPassagesMob = actifs.reduce((n, d) => n + (['socle', 'transversal'].includes(NIV(d)) ? 2 : 1), 0);
  console.log(`    (${nScen} scénarios actifs, ${nSocle} doublés, ${nBlocs} blocs, ${nPassagesMob} passages mobiles)`);

  verifier(visible2===nScen,`elle se déplie sur demande (${nScen})`,`${visible2} visibles`);
  await page.click('[data-plier-scenarios]'); await pause(600);

  console.log('\n== Créer une campagne');
  const avant = (await lire('projets/atelier/campagnes?pageSize=50'));
  const nAvant = ((avant&&avant.documents)||[]).length;
  await page.click('[data-nouvelle-campagne]'); await pause(1100);
  const f = await page.evaluate(()=>({
    feuille: !!document.querySelector('.feuille'),
    blocs: document.querySelectorAll('[data-bloc]').length,
    compte: (document.querySelector('#compte-scenarios')||{}).textContent||'',
    boutons: [...document.querySelectorAll('[data-tout],[data-socle],[data-rien]')].map(b=>b.textContent.trim()),
  }));
  verifier(f.feuille,'la feuille s\'ouvre');
  verifier(f.blocs===nBlocs,`les ${nBlocs} blocs sont proposés`,`${f.blocs}`);
  verifier(new RegExp(`${nScen} scénarios`).test(f.compte),`le compte annonce les ${nScen}`,f.compte);
  verifier(new RegExp(`${nPassagesMob} passages`).test(f.compte),`et les ${nPassagesMob} passages mobiles`,f.compte);
  console.log('    ', f.compte);

  console.log('\n== Le socle seulement');
  await page.check('#ed-socle-seul'); await pause(500);
  const cSocle = await page.evaluate(()=>(document.querySelector('#compte-scenarios')||{}).textContent||'');
  console.log('    ', cSocle);
  verifier(new RegExp(`^${nSocle} scénarios`).test(cSocle),`le socle seul retient ${nSocle} scénarios`,cSocle);
  verifier(new RegExp(`${nSocle * 2} passages`).test(cSocle),`soit ${nSocle * 2} passages, tous doublés`,cSocle);
  await page.uncheck('#ed-socle-seul'); await pause(400);

  console.log('\n== Aucun bloc');
  await page.click('[data-rien]'); await pause(400);
  const cRien = await page.evaluate(()=>(document.querySelector('#compte-scenarios')||{}).textContent||'');
  verifier(/Aucun scénario/.test(cRien),'zéro bloc est signalé',cRien);
  await page.fill('#ed-titre','Campagne Octobre 2026, mise en production 1.2.0');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(900);
  verifier(await page.evaluate(()=>!!document.querySelector('.voile')),'une campagne sans scénario est refusée');

  console.log('\n== La campagne complète');
  await page.click('[data-tout]'); await pause(400);
  await page.fill('#ed-build_ios','24');
  await page.fill('#ed-build_android','31');
  await page.fill('#ed-build_web','qa-1.2.0');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2500);
  const apres = await lire('projets/atelier/campagnes?pageSize=50');
  const docs = (apres&&apres.documents)||[];
  verifier(docs.length===nAvant+1,`la campagne est créée (${nAvant} puis ${docs.length})`);
  const neuve = docs.find(d=>/Octobre 2026/.test((((d.fields||{}).titre)||{}).stringValue||''));
  verifier(!!neuve,'elle porte le bon titre');
  if (neuve) {
    const refs = ((((neuve.fields.scenarios||{}).arrayValue)||{}).values||[]).length;
    verifier(refs===nScen,`elle retient les ${nScen} scénarios`,`${refs}`);
    const b = (((neuve.fields.builds||{}).mapValue||{}).fields)||{};
    verifier((b.ios||{}).stringValue==='24','le build iOS est enregistré');
    verifier((b.web||{}).stringValue==='qa-1.2.0','le build web aussi');
    verifier((neuve.fields.statut||{}).stringValue==='preparation','elle démarre en préparation');
  }
  const vue = await page.evaluate(()=>document.body.innerText);
  verifier(/Octobre 2026/.test(vue),'elle apparaît dans la liste sans recharger');

  console.log('\n== Modifier');
  const btn = await page.$('[data-editer-campagne]');
  if (btn) { await btn.click(); await pause(1100);
    verifier(await page.evaluate(()=>!!document.querySelector('#ed-titre')),'la feuille de modification s\'ouvre');
    await page.keyboard.press('Escape'); await pause(500);
  } else dire('aucun bouton de modification');

  console.log('\n== Le client ne crée rien');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests?projet=atelier',null,'Tests');
  await pause(1200);
  const c = await cl.evaluate(()=>({
    creer: document.querySelectorAll('[data-nouvelle-campagne]').length,
    editer: document.querySelectorAll('[data-editer-campagne]').length,
    voitCampagne: /Octobre 2026/.test(document.body.innerText),
  }));
  verifier(c.creer===0,'le client n\'a pas le bouton de création');
  verifier(c.editer===0,'ni celui de modification');
  verifier(c.voitCampagne,'mais il voit la campagne');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
