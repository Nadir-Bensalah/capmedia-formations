require('./lib/garde-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la mesure du rebond

   Nadir voit chaque écran « se rendre deux fois de suite » à chaque
   changement d'onglet, dans le Hub comme dans le Cockpit. Cette suite
   compte, pour chaque changement d'adresse ou de filtre, combien de fois
   la zone de travail est REMPLACÉE (innerHTML de #vue ou de
   #onglet-corps), si un squelette a été peint entre deux, et si le
   défilement a sauté. Elle se fait passer pour un humain
   (navigator.webdriver à faux) pour que les animations d'arrivée jouent
   comme en vrai.

     node fonctions-suivi/outils/qa-rebond.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
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

/* La sonde : elle vit dans la page, d'une adresse à l'autre. */
const sonder=(page)=>page.evaluate(()=>{
  if(window.__sonde)return;
  const s={ev:[],image:0};window.__sonde=s;
  /* Le compteur d'images : deux remplacements dans la même image n'ont
     jamais été vus par l'œil, seul le second a été peint. */
  const tourner=()=>{s.image+=1;requestAnimationFrame(tourner);};requestAnimationFrame(tourner);
  const obs=new MutationObserver((ms)=>{for(const m of ms){if(m.type!=='childList')continue;
    for(const n of m.addedNodes){if(n.nodeType!==1)continue;
      const cible=m.target;const genre=cible.id==='vue'?'page':(cible.id==='onglet-corps'||n.id==='onglet-corps'?'onglet':null);
      if(!genre)continue;
      const squelette=n.classList.contains('squelette')||!!(n.querySelector&&n.querySelector('.squelette'));
      s.ev.push({t:Math.round(performance.now()),image:s.image,genre,squelette,taille:(n.innerHTML||'').length,scroll:Math.round(scrollY)});}}});
  obs.observe(document.querySelector('#vue'),{childList:true,subtree:true});
});
const relever=async(page,geste)=>{
  await page.evaluate(()=>{window.__sonde.ev=[];window.__sonde.t0=performance.now();});
  await geste();
  await pause(1400);
  const r=await page.evaluate(()=>{const s=window.__sonde;const pages=s.ev.filter(e=>e.genre==='page');const onglets=s.ev.filter(e=>e.genre==='onglet');
    const tous=[...pages,...onglets].sort((a,b)=>a.t-b.t);
    /* Ce qui a été PEINT : un remplacement par image affichée. */
    const peints=new Set(tous.map(e=>e.image)).size;
    const squelettePeint=s.ev.some(e=>e.squelette&&!s.ev.some(f=>!f.squelette&&f.image===e.image));
    return {pages:pages.length,onglets:onglets.length,peints,squelette:s.ev.some(e=>e.squelette),squelettePeint,
      temps:tous.map(e=>e.t-Math.round(s.t0)),arrivee:document.querySelector('#vue').classList.contains('arrivee'),
      scroll:Math.round(scrollY),h1:((document.querySelector('.page h1')||{}).innerText||'').trim().slice(0,30)};});
  return r;
};
const ligne=(nom,r)=>console.log(`  ${nom.padEnd(40)} peints=${r.peints} (remplacements ${r.pages}+${r.onglets}) squelette peint=${r.squelettePeint?'OUI':'non'} temps=[${r.temps.join(',')}] scroll=${r.scroll} ${r.h1}`);

(async()=>{
  const nav=await chromium.launch();
  const err=[];

  for(const [role,email] of [['équipe','agent.essai@exemple.test'],['client','camille.essai@exemple.test']]){
    console.log(`\n== ${role} (${email})`);
    /* Un contexte neuf par rôle : la session d'avant ne doit pas rester. */
    const ctx=await nav.newContext({viewport:{width:1500,height:1100}});
    /* Un humain, pas un robot : sinon le routeur coupe les animations d'arrivée. */
    await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>false});});
    const page=await ctx.newPage();
    page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,180)));
    await connecter(page,email);
    await sonder(page);
    const aller=(h)=>()=>page.evaluate(x=>{location.hash=x;},h);
    const releves={};
    const mesurer=async(nom,geste)=>{const r=await relever(page,geste);releves[nom]=r;ligne(nom,r);return r;};

    await mesurer('projet (arrivée)',aller('/projets/atelier'));
    for(const o of ['taches','demandes','fichiers','tests','activite']) await mesurer(`onglet ${o}`,aller(`/projets/atelier/${o}`));
    await mesurer('onglet apercu',aller('/projets/atelier'));
    await mesurer('page Tests',aller('/tests'));
    if(role==='équipe'){await mesurer('page Tâches',aller('/taches'));await mesurer('page Planning',aller('/planning'));await mesurer('page Projets',aller('/projets'));}
    else{await mesurer('page Accueil',aller('/'));await mesurer('page Demandes',aller('/demandes'));}
    await mesurer('page Tests (retour)',aller('/tests?projet=atelier'));
    for(const p of ['ios','android','web','']) await mesurer(`filtre ${p||'toutes'} (clic)`,()=>page.click(`[data-plateforme="${p}"]`));

    console.log('\n  -- ce qui compte');
    const onglets=Object.entries(releves).filter(([n])=>n.startsWith('onglet '));
    verifier(onglets.every(([,r])=>r.peints===1),'un onglet de projet n\'est peint qu\'une fois',onglets.filter(([,r])=>r.peints!==1).map(([n,r])=>`${n}:${r.peints}`).join(' '));
    verifier(onglets.every(([,r])=>!r.squelettePeint),'sans squelette entre deux');
    verifier(onglets.every(([,r])=>r.scroll===0),'sans saut de défilement quand la barre est visible',onglets.filter(([,r])=>r.scroll!==0).map(([n,r])=>`${n}:${r.scroll}`).join(' '));
    const filtres=Object.entries(releves).filter(([n])=>n.startsWith('filtre '));
    verifier(filtres.every(([,r])=>r.peints===1),'un filtre de plateforme ne peint la page qu\'une fois',filtres.map(([n,r])=>`${n}:${r.peints}`).join(' '));
    verifier(filtres.every(([,r])=>!r.squelettePeint),'et ne repeint pas de squelette');
    const pages=Object.entries(releves).filter(([n])=>n.startsWith('page '));
    verifier(pages.every(([,r])=>r.peints===1),'un changement de page n\'est peint qu\'une fois',pages.filter(([,r])=>r.peints!==1).map(([n,r])=>`${n}:${r.peints}`).join(' '));
    verifier(pages.every(([,r])=>!r.squelettePeint),'sans squelette peint quand la donnée est déjà là',pages.filter(([,r])=>r.squelettePeint).map(([n])=>n).join(' '));
    await ctx.close();
  }
  if(err.length)console.log('\n  erreurs :',err.slice(0,5).join('\n    '));
  await nav.close();
  console.log(`\n${soucis.length} ÉCART(S)`);
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
