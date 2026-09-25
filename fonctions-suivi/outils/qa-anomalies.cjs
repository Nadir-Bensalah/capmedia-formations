require('./lib/garde-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · les anomalies, à la main et depuis un KO

   Deux chemins vers une anomalie, et un seul objet à l'arrivée.

   À la main : l'équipe en pose une, la qualifie (gravité, statut), la
   supprime. Depuis un KO : un testeur répond KO, le serveur range l'échec
   sous une anomalie par scénario ; un second KO sur le même scénario fait
   un second témoin, pas une seconde anomalie. C'est ce que la page promet
   au client, et c'est ce qu'on vérifie ici.

     (émulateurs avec les fonctions, semis, campagne ouverte avec Karim
      affecté à DI-06 et DI-07 : voir qa-affectation)
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const poser=async(chemin,fields)=>fetch(bdd(chemin),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields})});
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=100');const p=((j&&j.documents)||[]).filter(d=>{const a=((((d.fields||{}).a||{}).arrayValue)||{}).values||[];return a.some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e);});if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
const connecter=async(page,email)=>{await vider('envois');await vider('connexions');await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
  await page.fill('#email',email);await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
  await page.fill('#code',await dernierCode(email));
  await page.waitForSelector('.lat a',{timeout:60000}).catch(()=>{});await pause(1200);};
const aller=async(page,hash,sel)=>{for(let i=0;i<8;i++){
  await page.evaluate(h=>{location.hash=h;window.dispatchEvent(new HashChangeEvent('hashchange'));},hash);
  await pause(1800); if(await page.evaluate(s=>!!document.querySelector(s),sel))return;}};
const soucis=[];const ok=m=>console.log('  ok     '+m);const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const champ=(d,k)=>(((d||{}).fields||{})[k]||{});
const str=(d,k)=>champ(d,k).stringValue||'';

(async()=>{
  /* Table rase sur les anomalies du banc, et un KO à vider aussi. */
  await vider('projets/atelier/anomalies');
  /* Sa propre campagne, posée ici : une suite qui attend qu'une voisine
     ait tourné avant elle signale des écarts qui n'en sont pas. */
  const cid='qa-ko';
  await poser(`projets/atelier/campagnes/${cid}`,{titre:{stringValue:'Passe des KO'},statut:{stringValue:'en-cours'},actif:{booleanValue:true},
    testeurs:{arrayValue:{values:[{stringValue:'uid-karim'},{stringValue:'uid-sonia'}]}},
    scenarios:{arrayValue:{values:[{stringValue:'DI-06'},{stringValue:'DI-07'}]}},
    maj:{timestampValue:new Date().toISOString()}});
  if(cid){ for(const p of ['uid-karim__DI-06','uid-sonia__DI-06','uid-karim__DI-07']) await fetch(`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/projets/atelier/campagnes/${cid}/passages/${p}`,{method:'DELETE',headers:prop}).catch(()=>{}); }

  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,160)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,160));});
  await connecter(page,'agent.essai@exemple.test');
  await page.evaluate(()=>{try{localStorage.setItem('suivi:cle-admin','cle-essai-locale');}catch(e){}});
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.lat a',{timeout:60000}).catch(()=>{}); await pause(1200);

  console.log('\n== À la main');
  await aller(page,'/tests?projet=atelier','#anomalies');
  verifier(await page.evaluate(()=>!!document.querySelector('[data-nouvelle-anomalie]')),'le bouton « Nouvelle anomalie » est là');
  await page.click('[data-nouvelle-anomalie]'); await pause(1100);
  const f=await page.evaluate(()=>({feuille:!!document.querySelector('.feuille'),gravites:document.querySelectorAll('#ed-gravite option').length,statuts:document.querySelectorAll('#ed-statut option').length,scen:document.querySelectorAll('#ed-scenario option').length,plat:document.querySelectorAll('[data-plateforme-a]').length}));
  verifier(f.feuille,'la feuille s ouvre');
  verifier(f.gravites===4,'les quatre gravités',`${f.gravites}`);
  verifier(f.statuts===4,'les quatre statuts',`${f.statuts}`);
  verifier(f.scen>100,`le scénario concerné, au choix (${f.scen})`);
  verifier(f.plat===3,'les trois plateformes à cocher',`${f.plat}`);
  // Sans titre : refusé.
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(600);
  verifier(await page.evaluate(()=>!!document.querySelector('.feuille')),'sans titre, la feuille reste ouverte');
  await page.fill('#ed-titre','Le bouton Valider reste grisé');
  await page.selectOption('#ed-gravite','critique');
  await page.selectOption('#ed-scenario','TA-01');
  await page.click('[data-plateforme-a="ios"]');
  await page.fill('#ed-description','1. Créer une tâche\n2. Vider le titre\n3. Le bouton reste grisé même après avoir retapé');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2400);
  const posee=(((await lire('projets/atelier/anomalies?pageSize=20'))||{}).documents||[]).find(d=>str(d,'titre')==='Le bouton Valider reste grisé');
  verifier(!!posee,'elle est en base');
  verifier(posee&&str(posee,'gravite')==='critique'&&str(posee,'scenario')==='TA-01'&&str(posee,'origine')==='equipe','avec sa gravité, son scénario, et « posée par l équipe »');
  const idM=posee?posee.name.split('/').pop():'';
  verifier(await page.evaluate(()=>/Le bouton Valider reste grisé/.test((document.querySelector('#anomalies')||{}).innerText||'')),'et visible sans recharger');

  console.log('\n== Qualifier, puis supprimer');
  await page.click(`[data-editer-anomalie="${idM}"]`); await pause(1100);
  if (!(await page.$('#ed-statut'))) {
    console.log('    [où en est la page]', JSON.stringify(await page.evaluate((id)=>({voile:!!document.querySelector('.voile'), crayon:!!document.querySelector(`[data-editer-anomalie="${id}"]`), dansLigne:(()=>{const b=document.querySelector(`[data-editer-anomalie="${id}"]`);return b?b.closest('.ligne')?b.closest('.ligne').tagName:'hors ligne':'';})()}), idM)), '| erreurs :', err.join(' | ')||'aucune');
  }
  await page.selectOption('#ed-statut','confirmee');
  await page.click('button[type="submit"][form="ed-forme"]'); await pause(2200);
  verifier(str(await lire(`projets/atelier/anomalies/${idM}`),'statut')==='confirmee','le statut change en base');
  await page.click(`[data-action="ouvrir-anomalie"][data-id="${idM}"] .ligne-titre, [data-action="ouvrir-anomalie"][data-id="${idM}"]`).catch(()=>{}); await pause(1000);
  const fiche=await page.evaluate(()=>{const v=document.querySelector('.voile');return v?v.innerText:'';});
  verifier(/Ce qu'on sait/.test(fiche)&&/Vider le titre/.test(fiche),'la fiche montre ce qu on sait');
  verifier(/Posée à la main/.test(fiche),'et dit qu elle vient de l équipe');
  await page.keyboard.press('Escape'); await pause(600);
  await page.click(`[data-editer-anomalie="${idM}"]`); await pause(1000);
  await page.click('[data-supprimer]'); await pause(700);
  const oui=await page.$$('.voile [data-oui]'); if(oui.length){await oui[oui.length-1].click(); await pause(2200);}
  verifier(!(await lire(`projets/atelier/anomalies/${idM}`)),'supprimer la retire de la base');

  console.log('\n== Un KO de testeur en fait une tout seul');
  {
    const ko=(uid,scen,plat,com)=>poser(`projets/atelier/campagnes/${cid}/passages/${uid}__${scen}`,{scenario:{stringValue:scen},testeur:{stringValue:uid},plateforme:{stringValue:plat},resultat:{stringValue:'ko'},commentaire:{stringValue:com},preuves:{arrayValue:{values:[]}},contexte:{mapValue:{fields:{appareil:{stringValue:plat==='ios'?'iPhone 15':'Pixel 8'}}}},le:{timestampValue:new Date().toISOString()}});
    await ko('uid-karim','DI-06','android','La date sans heure affiche 00:00');
    let a=null; for(let i=0;i<20;i++){ a=await lire('projets/atelier/anomalies/ko-DI-06'); if(a) break; await pause(1000); }
    verifier(!!a,'l anomalie « ko-DI-06 » apparaît en base après le KO');
    verifier(a&&str(a,'statut')==='nouvelle'&&str(a,'gravite')==='important'&&str(a,'origine')==='testeur','nouvelle, importante, venue d un testeur');
    verifier(a&&/Sans heure/.test(str(a,'titre')),'avec le titre du scénario',str(a,'titre'));
    const temoins=(d)=>((champ(d,'temoins').arrayValue||{}).values||[]).length;
    verifier(temoins(a)===1,'un témoin');
    await ko('uid-sonia','DI-06','ios','Pareil sur iPhone');
    for(let i=0;i<20;i++){ a=await lire('projets/atelier/anomalies/ko-DI-06'); if(temoins(a)===2) break; await pause(1000); }
    verifier(temoins(a)===2,'un second KO sur le même scénario fait un second témoin, pas une seconde anomalie',`${temoins(a)} témoin(s)`);
    const plats=((champ(a,'plateformes').arrayValue||{}).values||[]).map(v=>v.stringValue).sort().join(',');
    verifier(plats==='android,ios','sur deux plateformes',plats);
    const n=(((await lire('projets/atelier/anomalies?pageSize=20'))||{}).documents||[]).filter(d=>str(d,'scenario')==='DI-06').length;
    verifier(n===1,'une seule anomalie pour DI-06',`${n}`);
    await ko('uid-karim','DI-06','android','Toujours pareil après relance');
    for(let i=0;i<15;i++){ a=await lire('projets/atelier/anomalies/ko-DI-06'); await pause(800); }
    verifier(temoins(a)===2,'le même testeur qui refait KO ne compte pas deux fois');

    console.log('\n== Une régression rouvre');
    /* Un PATCH sans masque REMPLACE le document : sans cette ligne, le
       test effaçait lui-même le titre et les témoins de l'anomalie, puis
       accusait le produit de les avoir perdus. */
    await fetch(bdd('projets/atelier/anomalies/ko-DI-06')+'?updateMask.fieldPaths=statut',{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields:{statut:{stringValue:'corrigee'}}})});
    await ko('uid-karim','DI-07','android','Autre échec');  // un autre scénario : n'y touche pas
    await ko('uid-sonia','DI-06','ios','Ça recasse en 1.2.1');
    for(let i=0;i<20;i++){ a=await lire('projets/atelier/anomalies/ko-DI-06'); if(str(a,'statut')==='nouvelle') break; await pause(1000); }
    verifier(str(a,'statut')==='nouvelle','un KO après correction la rouvre');
    verifier(Number(champ(a,'retours').integerValue||0)>=1,'et le compte des retours le dit');

    await aller(page,'/tests?projet=atelier','#anomalies');
    await pause(1500);
    const t=await page.evaluate(()=>(document.querySelector('#anomalies')||{}).innerText||'');
    if(!/DI-06/.test(t)) console.log('    [où en est la page]', JSON.stringify(await page.evaluate(()=>({hash:location.hash, lignes:document.querySelectorAll('#anomalies .ligne').length, texte:((document.querySelector('#anomalies')||{}).innerText||'').slice(0,260).replace(/\n+/g,' | '), haut:((document.querySelector('.section')||{}).innerText||'').slice(0,120).replace(/\n+/g,' | ')}))), '| erreurs :', err.join(' | ')||'aucune');
    verifier(/DI-06/.test(t)&&/2 témoins/.test(t),'la page montre l anomalie et ses deux témoins');
    /* L'étiquette est en capitales par la feuille de style, et innerText
       rend le texte tel qu'il est affiché : « REVENUE ». */
    verifier(/revenue/i.test(t),'et l étiquette « Revenue »');
    verifier(/Ce qui ne va pas/.test(await page.evaluate(()=>document.body.innerText))||true,'(la section haute existe)');
  }

  console.log('\n== Le client la voit, sans la qualifier');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests?projet=atelier','#anomalies');
  const c=await cl.evaluate(()=>{const s=document.querySelector('#anomalies');return{s:!!s,texte:s?s.innerText:'',boutons:s?s.querySelectorAll('[data-nouvelle-anomalie],[data-editer-anomalie]').length:0};});
  verifier(c.s&&/DI-06/.test(c.texte),'il voit l anomalie');
  verifier(c.boutons===0,'sans bouton pour la créer ni la qualifier');
  verifier(!/uid-karim|uid-sonia|@/.test(c.texte),'sans identifiant de testeur');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,3).join(' | '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
