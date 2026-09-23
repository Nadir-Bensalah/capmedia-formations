/* ==========================================================================
   CAPMEDIA CLIENT HUB · une ligne qui agit ET qui porte un bouton

   Un <button> dans un <button> est invalide : le navigateur éjecte
   l'intérieur, et le crayon d'édition se retrouve seul sur la ligne du
   dessous. Rien ne le signale, aucune erreur, et on ne le voit qu'à
   l'œil, sur une capture.

   Quand une ligne mène quelque part ET porte un bouton, c'est donc son
   TITRE qui devient le bouton, pas la rangée entière. Cette suite vérifie
   les trois choses qui comptent : le crayon reste dans la ligne et à sa
   droite, le titre ouvre toujours, et le crayon ouvre l'éditeur.

   Quatre vues portent ce motif : les campagnes des tests, les clients,
   les pièces de finances et les jalons d'un projet.

     (émulateurs, semis, campagne)
   ========================================================================== */

const { chromium } = require('@playwright/test');
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/capmedia-1f90d/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=100');const p=((j&&j.documents)||[]).filter(d=>{const a=((((d.fields||{}).a||{}).arrayValue)||{}).values||[];return a.some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e);});if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
const soucis=[];const ok=m=>console.log('  ok     '+m);const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>c?ok(b):dire(m?`${b} · ${m}`:b);
(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  await vider('envois'); await vider('connexions'); await vider('connexionsIp');
  await page.goto('http://127.0.0.1:8787/suivi/?emul',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
  await page.fill('#email','agent.essai@exemple.test'); await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
  await page.fill('#code',await dernierCode('agent.essai@exemple.test'));
  await pause(2500);
  await page.evaluate(()=>{try{localStorage.setItem('suivi:cle-admin','cle-essai-locale');}catch(e){}});
  await page.reload({waitUntil:'domcontentloaded'}); await pause(3500);
  /* Poser l'adresse une fois et attendre trois secondes ne suffit pas :
     sous charge, la page n'a pas fini de se monter et la suite accuse
     l'absence d'un élément qui n'est simplement pas encore là. On repose
     l'adresse jusqu'à ce que la SECTION soit rendue, comme les autres
     suites le font déjà. */
  for (let i=0;i<8;i++){
    await page.evaluate(()=>{location.hash='/tests?projet=atelier';window.dispatchEvent(new HashChangeEvent('hashchange'));});
    await pause(2000);
    if (await page.evaluate(()=>!!document.querySelector('[data-editer-campagne]'))) break;
  }

  console.log('\n== Le crayon reste dans la ligne');
  const g=await page.evaluate(()=>{
    const l=[...document.querySelectorAll('.ligne')].find(x=>x.querySelector('[data-editer-campagne]'));
    if(!l) return {trouve:false};
    const r=l.getBoundingClientRect(), b=l.querySelector('[data-editer-campagne]').getBoundingClientRect();
    return {trouve:true, dansLaLigne: b.top>=r.top-2 && b.bottom<=r.bottom+2, aDroite: b.left > r.left + r.width*0.7, imbrique: !!l.closest('button')&&l.tagName==='BUTTON'};
  });
  verifier(g.trouve,'une ligne de campagne porte un crayon');
  verifier(g.dansLaLigne,'le crayon est DANS la ligne, pas en dessous');
  verifier(g.aDroite,'et sur son bord droit');

  console.log('\n== La ligne reste cliquable');
  await page.click('.ligne-titre--bouton'); await pause(1500);
  verifier(await page.evaluate(()=>!!document.querySelector('.voile, .feuille')),'le titre ouvre bien la campagne');
  await page.keyboard.press('Escape'); await pause(900);

  console.log('\n== Et le crayon ouvre l édition');
  await page.click('[data-editer-campagne]'); await pause(1500);
  verifier(await page.evaluate(()=>!!document.querySelector('#ed-nom, #ed-titre, .feuille')),'le crayon ouvre l éditeur');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  await nav.close();
  process.exit(soucis.length?1:0);
})();
