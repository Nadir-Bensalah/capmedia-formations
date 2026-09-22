/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'affectation des testeurs à l'épreuve

   Le calcul propose, il ne décide pas. Ce qu'on garde ici est ce qui coûte
   de l'argent : un scénario dont le comportement dépend du système doit
   partir chez un testeur iOS ET un testeur Android, et le reste une seule
   fois. Une répartition qui doublerait tout ferait payer deux campagnes
   pour une, et personne ne s'en apercevrait avant la facture.

   La règle elle-même est éprouvée séparément, sans navigateur, dans
   repartition.test.mjs : elle est sortie de la vue pour cela.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/importer-scenarios.mjs atelier <plan.md> --vrai
     node fonctions-suivi/outils/qa-affectation.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=100');const p=((j&&j.documents)||[]).filter(d=>{const a=((((d.fields||{}).a||{}).arrayValue)||{}).values||[];return a.some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e);});if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
const connecter=async(page,email)=>{await vider('connexions');await vider('connexionsIp');
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

(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,160)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,160));});

  await connecter(page,'agent.essai@exemple.test');
  await aller(page,'/tests?projet=atelier','.chiffres-tests','Tests');

  console.log('\n== Ouvrir une campagne');
  const lien = await page.$('[data-action="ouvrir-campagne"]');
  verifier(!!lien,'la campagne est cliquable');
  if (!lien) { console.log('arret'); await nav.close(); process.exit(1); }
  await lien.click(); await pause(1300);
  const f = await page.evaluate(()=>({
    feuille: !!document.querySelector('.feuille'),
    chiffres: [...document.querySelectorAll('.voile .chiffre')].map(c=>c.innerText.replace(/\n/g,' ')),
    vivier: document.querySelectorAll('[data-testeur]').length,
    repartir: !!document.querySelector('[data-repartir]'),
  }));
  verifier(f.feuille,'la feuille s\'ouvre');
  verifier(f.vivier===6,'les 6 testeurs du vivier sont proposés',`${f.vivier}`);
  verifier(f.repartir,'le bouton Répartir est là');
  console.log('    ', f.chiffres.join(' | '));

  console.log('\n== Répartir sans testeur');
  await page.evaluate(()=>document.querySelectorAll('[data-testeur]').forEach(c=>{c.checked=false;}));
  await page.click('[data-repartir]'); await pause(800);
  verifier(await page.evaluate(()=>!!document.querySelector('.feuille')),'sans testeur, la feuille reste ouverte');

  console.log('\n== Répartir entre les six');
  await page.evaluate(()=>document.querySelectorAll('[data-testeur]').forEach(c=>{c.checked=true;}));
  await page.click('[data-repartir]'); await pause(3000);

  const camps = await lire('projets/atelier/campagnes?pageSize=50');
  const avec = ((camps&&camps.documents)||[]).find(d=>{
    const a=(((d.fields.affectation||{}).mapValue||{}).fields)||{};
    return Object.keys(a).length>0;
  });
  verifier(!!avec,'l\'affectation est enregistrée');
  if (avec) {
    const aff=(((avec.fields.affectation||{}).mapValue||{}).fields)||{};
    const parT=Object.entries(aff).map(([id,v])=>[id,((v.arrayValue||{}).values||[]).length]);
    const total=parT.reduce((n,[,x])=>n+x,0);
    const charges=parT.map(([,x])=>x);
    console.log('    ', parT.map(([id,n])=>`${id}:${n}`).join(' '));
    verifier(parT.length===6,'les six testeurs ont leur lot',`${parT.length}`);
    verifier(Math.min(...charges)>0,'personne n\'est oublié',charges.join('/'));
    verifier(Math.max(...charges)-Math.min(...charges)<=3,`la charge est équilibrée (${Math.min(...charges)} à ${Math.max(...charges)})`);
    const nScen=((((avec.fields.scenarios||{}).arrayValue)||{}).values||[]).length;
    console.log(`     ${total} passages pour ${nScen} scénarios`);
    verifier(total>nScen,'les scénarios du socle sont bien doublés',`${total} vs ${nScen}`);
  }

  console.log('\n== Le client regarde sans toucher');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests?projet=atelier',null,'Tests');
  await pause(1400);
  const lc = await cl.$('[data-action="ouvrir-campagne"]');
  if (lc) { await lc.click(); await pause(1300);
    const c = await cl.evaluate(()=>({
      feuille: !!document.querySelector('.feuille'),
      repartir: document.querySelectorAll('[data-repartir]').length,
      vivier: document.querySelectorAll('[data-testeur]').length,
      voitCharges: /passages/.test((document.querySelector('.voile')||{}).innerText||''),
    }));
    verifier(c.feuille,'le client ouvre la campagne');
    verifier(c.repartir===0,'il n\'a pas le bouton Répartir');
    verifier(c.vivier===0,'ni le vivier');
    verifier(c.voitCharges,'mais il voit où en sont les testeurs');
  } else dire('le client ne peut pas ouvrir la campagne');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
