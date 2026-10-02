require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · les cartes des parties suivent leur adresse publique

   L'éditeur d'une partie promet que son « Adresse publique » rend la carte
   cliquable ; la carte ne lisait que le lien du store d'une version. Le
   client voyait un lien sur l'iPhone seulement.

     node fonctions-suivi/outils/qa-liens-cartes.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
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

const soucis=[];const ok=m=>console.log('  ok     '+m);
const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const poserLien=async(cid,lien)=>{const r=await fetch(`${bdd(`projets/atelier/composants/${cid}`)}?updateMask.fieldPaths=lien`,{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields:{lien:{stringValue:lien}}})});return r.ok;};

(async()=>{
  verifier(await poserLien('web','https://app.exemple.test'),'adresse publique posée sur la partie web');
  verifier(await poserLien('admin','javascript:alert(1)'),'adresse piégée posée sur le tableau de bord');
  const nav=await chromium.launch();
  for(const [role,email] of [['équipe','agent.essai@exemple.test'],['client','camille.essai@exemple.test']]){
    console.log(`\n== ${role}`);
    const ctx=await nav.newContext({viewport:{width:1500,height:1100}});
    const page=await ctx.newPage();
    await connecter(page,email);
    await page.evaluate(()=>{location.hash='/projets/atelier';});
    await page.waitForSelector('.carte-plateforme',{timeout:20000}).catch(()=>{});await pause(1500);
    const c=await page.evaluate(()=>{const lire=(p)=>{const el=document.querySelector(`.carte-plateforme[data-plateforme="${p}"]`);return el?[...el.querySelectorAll('a.btn')].map(a=>({t:a.innerText.trim(),h:a.getAttribute('href'),cible:a.target})):null;};return {web:lire('web'),admin:lire('admin')};});
    verifier(c.web&&c.web.some(b=>b.h==='https://app.exemple.test'&&/Ouvrir/.test(b.t)&&b.cible==='_blank'),'la carte Web ouvre son site dans un nouvel onglet',JSON.stringify(c.web));
    verifier(c.admin&&!c.admin.some(b=>/javascript/i.test(b.h||'')),'une adresse qui n est pas https n est jamais suivie',JSON.stringify(c.admin));
    await ctx.close();
  }
  await nav.close();
  console.log(`\n${soucis.length} ÉCART(S)`);
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
