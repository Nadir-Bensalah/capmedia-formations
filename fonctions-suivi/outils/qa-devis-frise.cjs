/* ==========================================================================
   CAPMEDIA CLIENT HUB · les lignes d'un devis, cochées et vues

   Ce que l équipe coche, le client le voit. La suite joue les deux rôles :
   l'équipe coche une ligne et la base change ; le client voit la frise,
   la même, sans la case.

     (émulateurs, semis, puis semer-etapes-devis.mjs atelier d-qa --vrai)
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=100');const p=((j&&j.documents)||[]).filter(d=>{const a=((((d.fields||{}).a||{}).arrayValue)||{}).values||[];return a.some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e);});if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
/* Les courriels de code ne sont jamais purgés et la lecture rend les cent
   premiers par identifiant : on vide avant d'en demander un neuf. */
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
const statutEnBase=async(id)=>((((await lire(`projets/atelier/jalons/${id}`))||{}).fields||{}).statut||{}).stringValue||'';

(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,160)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,160));});

  await connecter(page,'agent.essai@exemple.test');
  await page.evaluate(()=>{try{localStorage.setItem('suivi:cle-admin','cle-essai-locale');}catch(e){}});
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.lat a',{timeout:60000}).catch(()=>{}); await pause(1200);

  console.log('\n== Le devis en tête de la page Tests');
  await aller(page,'/tests?projet=atelier','#etage-devis .frise');
  const f=await page.evaluate(()=>{const fr=document.querySelector('#etage-devis .frise');return{
    frise:!!fr, etapes:fr?fr.querySelectorAll('.frise-etape').length:0,
    cases:fr?fr.querySelectorAll('[data-cocher-etape]').length:0,
    montants:fr?[...fr.querySelectorAll('.frise-montant')].length:0,
    tete:fr?(fr.querySelector('.frise-sous')||{}).innerText||'':'',
    premier:document.querySelector('.etage-sur')?document.querySelector('.etage-sur').innerText.trim():'',
    ordre:fr?[...fr.querySelectorAll('.frise-num')].map(n=>n.innerText).join(','):''};});
  verifier(f.frise,'la frise du devis est là');
  verifier(f.premier.toLowerCase().includes('devis'),'et c est le premier étage',f.premier);
  verifier(f.etapes===5,'cinq lignes',`${f.etapes}`);
  verifier(f.cases===5,'l équipe a une case par ligne');
  verifier(f.montants===5,'chacune avec son montant');
  /* Le séparateur de milliers est une espace fine insécable, pas une
     espace : chercher « 5 750 » avec une espace ordinaire ne trouve rien. */
  verifier(/5[\s\u202f\u00a0]?750/.test(f.tete),'le total du devis est rappelé',f.tete);
  verifier(f.ordre==='01,02,03,04,05','dans l ordre du devis',f.ordre);

  console.log('\n== Cocher, c est livrer');
  const cible='devis-01-testeurs';
  verifier((await statutEnBase(cible))!=='termine','la première ligne n est pas livrée au départ');
  await page.check(`[data-cocher-etape="${cible}"]`); await pause(2200);
  verifier((await statutEnBase(cible))==='termine','la case cochée passe l étape à « terminé » en base');
  const t2=await page.evaluate(()=>(document.querySelector('#etage-devis .frise-sous')||{}).innerText||'');
  verifier(/^1 \/ 5/.test(t2.trim()),'la frise annonce 1 / 5 sans recharger',t2);
  await page.uncheck(`[data-cocher-etape="${cible}"]`); await pause(2200);
  verifier((await statutEnBase(cible))==='en-cours','décocher la rouvre');

  console.log('\n== Changer le statut sans ouvrir la fiche');
  const deux='devis-02-environnement';
  await page.click(`[data-statut-etape="${deux}"]`); await pause(700);
  const choix=await page.evaluate(()=>[...document.querySelectorAll('.menu [data-cle]')].map(b=>b.dataset.cle));
  verifier(choix.length===5,'la pastille ouvre les cinq statuts',choix.join('/'));
  await page.click('.menu [data-cle="bloque"]'); await pause(2200);
  verifier((await statutEnBase(deux))==='bloque','choisir « bloqué » l écrit en base');
  const pb=await page.evaluate(()=>{const b=document.querySelector('[data-statut-etape="devis-02-environnement"]');return b?b.innerText.trim():'';});
  verifier(/Bloqué/.test(pb),'et la pastille le montre sans recharger',pb);
  await page.click(`[data-statut-etape="${deux}"]`); await pause(700);
  await page.click('.menu [data-cle="a-venir"]'); await pause(2200);
  verifier((await statutEnBase(deux))==='a-venir','et on peut revenir en arrière');

  console.log('\n== Le crayon ouvre la fiche complète');
  await page.click(`[data-editer-etape="${deux}"]`); await pause(1200);
  const fiche=await page.evaluate(()=>({feuille:!!document.querySelector('.feuille'), titre:(document.querySelector('#ed-titre')||{}).value||'', devis:(document.querySelector('#ed-devis')||{}).value||'', montant:(document.querySelector('#ed-montant')||{}).value||''}));
  verifier(fiche.feuille&&fiche.titre==='Environnement de test dédié','la fiche s ouvre sur la bonne étape',fiche.titre);
  verifier(fiche.devis==='d-qa','avec son devis de rattachement',fiche.devis);
  verifier(fiche.montant==='760','et son montant',fiche.montant);
  await page.keyboard.press('Escape'); await pause(700);

  console.log('\n== La feuille de route la porte aussi');
  await aller(page,'/projets/atelier/etapes','.frise');
  verifier(await page.evaluate(()=>document.querySelectorAll('.frise').length)>=1,'la frise est en tête de la feuille de route');

  console.log('\n== Le client la voit, sans la case');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests?projet=atelier','#etage-devis .frise');
  const c=await cl.evaluate(()=>{const fr=document.querySelector('#etage-devis .frise');return{
    frise:!!fr, etapes:fr?fr.querySelectorAll('.frise-etape').length:0,
    cases:fr?fr.querySelectorAll('input').length:0, coches:fr?fr.querySelectorAll('.frise-coche').length:0};});
  verifier(c.frise,'il voit la frise');
  verifier(c.etapes===5,'les cinq lignes');
  verifier(c.cases===0,'sans aucune case à cocher');
  verifier(await cl.evaluate(()=>document.querySelectorAll('#etage-devis [data-statut-etape], #etage-devis [data-editer-etape]').length)===0,'ni statut à changer, ni crayon');
  verifier(c.coches===5,'avec une coche par ligne');
  await aller(cl,'/projets/atelier/etapes','.frise');
  verifier(await cl.evaluate(()=>document.querySelectorAll('.frise').length)>=1 && await cl.evaluate(()=>document.querySelectorAll('.frise input').length)===0,'et sur sa feuille de route, sans case non plus');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,3).join(' | '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
