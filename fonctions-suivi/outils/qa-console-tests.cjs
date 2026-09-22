/* ==========================================================================
   CAPMEDIA CLIENT HUB · la console de tests à l'épreuve

   Elle regarde tous les projets d'un coup, ce qui en fait l'endroit du Hub
   où une fuite entre clients coûterait le plus cher : le sélecteur de
   projet ne doit proposer que les siens, et c'est vérifié ici nommément.

   L'ordre des sections est éprouvé lui aussi. « Ce qui ne va pas » vient
   en premier, parce qu'un tableau de bord qui ouvre sur ce qui va bien ne
   sert à personne, et cet ordre est une décision, pas un hasard de mise en
   page.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/importer-scenarios.mjs atelier <plan.md> --vrai
     node fonctions-suivi/outils/qa-console-tests.cjs
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
  await page.waitForSelector('.page h1',{timeout:30000}).catch(()=>{});await pause(1800);};
/* Attendre « .page h1 » ne prouve rien : l'accueil en a un aussi, et le
   test sortait en croyant avoir navigué. On attend donc le TEXTE du titre,
   qui est le seul signe que la bonne vue a pris la main. */
const aller=async(page,hash,attendu,titre)=>{for(let i=0;i<6;i++){
  await page.evaluate(h=>{location.hash=h;},hash);
  await page.evaluate(()=>window.dispatchEvent(new HashChangeEvent('hashchange')));
  await pause(1600);
  const bon = await page.evaluate(([sel,t])=>{
    if (t && ((document.querySelector('.page h1')||{}).innerText||'').trim()!==t) return false;
    return !sel || !!document.querySelector(sel);
  },[attendu||null,titre||null]);
  if(bon)return;}};
const soucis=[];const ok=m=>console.log('  ok     '+m);
const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));

(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,140)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,140));});

  await connecter(page,'agent.essai@exemple.test');
  /* Laisser l'application finir de démarrer : juste après la connexion le
     document vient d'être remplacé, et le routeur peut manquer le premier
     événement. Un humain qui clique n'arrive jamais aussi vite. */
  await pause(2500);

  console.log('\n== La barre latérale');
  const lat = await page.evaluate(()=>[...document.querySelectorAll('.lat a')].map(a=>a.textContent.trim().split('\n')[0]));
  verifier(lat.some(x=>/^Tests/.test(x)), 'l\'entrée Tests est dans la barre latérale', lat.join(' / '));

  console.log('\n== La vue globale');
  await aller(page,'/tests','.section-tete h2','Tests');
  await pause(1500);
  const g = await page.evaluate(()=>({
    titre:(document.querySelector('.page h1')||{}).innerText||'',
    sections:[...document.querySelectorAll('.section-tete h2')].map(h=>h.innerText.trim()),
    selecteur: !!document.querySelector('#f-projet'),
    plateformes:[...document.querySelectorAll('[data-plateforme]')].map(b=>b.textContent.trim()),
    texte: document.body.innerText,
  }));
  verifier(g.titre==='Tests','le titre est « Tests »',g.titre);
  verifier(g.sections[0]==='Ce qui ne va pas','« Ce qui ne va pas » vient en premier',g.sections.join(' / '));
  verifier(g.sections.includes('Avancement'),'la section Avancement est là');
  verifier(g.sections.includes('Activité'),'la section Activité est là');
  verifier(g.selecteur,'le sélecteur de projet est présent');
  verifier(g.plateformes.length===4,'les 4 filtres de plateforme sont là',g.plateformes.join('/'));
  verifier(/rappel fin de mois/i.test(g.texte),'l\'anomalie bloquante remonte en haut');
  verifier(/dépasse sa date de fin/i.test(g.texte),'la campagne en retard est signalée');
  verifier(/sans aucun scénario/i.test(g.texte),'la campagne sans scénario est signalée');

  console.log('\n== Un projet choisi');
  await aller(page,'/tests?projet=atelier','.chiffres-tests');
  await pause(1200);
  const u = await page.evaluate(()=>({
    chiffres:[...document.querySelectorAll('.chiffre')].map(c=>c.innerText.replace(/\n/g,' ')),
    scenarios:document.querySelectorAll('.scenario').length,
    doubles:document.querySelectorAll('.scenario--double').length,
    plier: !!document.querySelector('[data-plier-scenarios]'),
    creer: !!document.querySelector('[data-nouvelle-campagne]'),
  }));
  console.log('    chiffres :', u.chiffres.join(' | '));
  verifier(u.scenarios===173,`les 173 scénarios sont dans la page`,`${u.scenarios} vus`);
  verifier(u.doubles===82,'82 marqués double',`${u.doubles} vus`);
  verifier(u.chiffres.length===4,'les 4 chiffres du haut');
  verifier(u.plier,'la bibliothèque est repliable');
  verifier(u.creer,'le bouton de création de campagne est là');

  console.log('\n== Le filtre par plateforme');
  await page.click('[data-plateforme="web"]'); await pause(1400);
  const w = await page.evaluate(()=>({n:document.querySelectorAll('.scenario').length, hash:location.hash}));
  verifier(w.hash.includes('plateforme=web'),'le filtre passe dans l\'adresse',w.hash);
  verifier(w.n>0 && w.n<=173,`le filtre web restreint la liste (${w.n})`);

  console.log('\n== Le détail d\'un scénario');
  await page.click('[data-plateforme=""]'); await pause(1200);
  /* La bibliothèque est repliée par défaut : sans la déplier, le scénario
     est dans la page mais invisible, et le clic échoue sans rien dire. */
  await page.click('[data-plier-scenarios]'); await pause(900);
  const b = await page.$('[data-scenario]');
  if (b) { await b.click(); await pause(900);
    const m = await page.evaluate(()=>{const v=document.querySelector('.voile');return v?v.innerText.slice(0,200).replace(/\n+/g,' | '):'';});
    verifier(!!m,'la feuille du scénario s\'ouvre');
    console.log('    ', m.slice(0,150));
    await page.keyboard.press('Escape'); await pause(600);
  } else dire('aucun scénario cliquable');

  console.log('\n== L\'onglet du projet, réduit');
  await aller(page,'/projets/atelier/tests','.chiffres-tests');
  await pause(1200);
  const o = await page.evaluate(()=>({
    scenarios:document.querySelectorAll('.scenario').length,
    chiffres:document.querySelectorAll('.chiffre').length,
    console: !!document.querySelector('a[href*="#/tests?projet="]'),
    texte:(document.querySelector('#onglet-corps')||{}).innerText||'',
  }));
  verifier(o.scenarios===0,'la liste complète n\'est plus dans l\'onglet',`${o.scenarios} scénarios encore`);
  verifier(o.chiffres===4,'le résumé affiche les 4 chiffres');
  verifier(o.console,'le bouton « Ouvrir la console » est là');
  verifier(/Passe manuelle 1\.2\.0/.test(o.texte),'la campagne en cours est rappelée');

  console.log('\n== Le client');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  const latC = await cl.evaluate(()=>[...document.querySelectorAll('.lat a')].map(a=>a.textContent.trim().split('\n')[0]));
  verifier(latC.some(x=>/^Tests/.test(x)),'le client a aussi l\'entrée Tests',latC.join(' / '));
  await aller(cl,'/tests',null,'Tests');
  await pause(1800);
  const c = await cl.evaluate(()=>({
    selecteur: !!document.querySelector('#f-projet'),
    options: [...document.querySelectorAll('#f-projet option')].map(o=>o.textContent.trim()),
    sections: [...document.querySelectorAll('.section-tete h2')].map(h=>h.innerText.trim()),
    chapo: (document.querySelector('.chapo')||{}).innerText||'',
    projets: (document.body.innerText.match(/(\d+) projets? actifs?/)||[])[1],
  }));
  /* Un client à projet unique n'a rien à choisir : son projet s'ouvre
     d'office et le sélecteur disparaît. Dès qu'il en a deux, le sélecteur
     revient et ne doit proposer QUE les siens : c'est le vrai contrôle de
     cloisonnement, un client ne voit jamais le nom du projet d'un autre. */
  if (c.selecteur) {
    verifier(c.options.length>=2,`le sélecteur propose ses projets (${c.options.join(', ')})`);
    verifier(!c.options.some(o=>/boutique/i.test(o)),'le projet d\'un autre client n\'y figure pas',c.options.join(', '));
    verifier(c.sections[0]==='Ce qui ne va pas','il voit la vue globale',c.sections.join('/'));
  } else {
    verifier(c.sections.includes('Campagnes'),'son projet unique s\'ouvre d\'office',c.sections.join('/'));
    verifier(c.sections.includes('Scénarios'),'avec sa bibliothèque');
    const fuite = await cl.evaluate(()=>/boutique/i.test(document.body.innerText));
    verifier(!fuite,'et rien du projet d\'un autre client');
  }

  await aller(cl,'/tests?projet=atelier',null,'Tests');
  await pause(1400);
  const cp = await cl.evaluate(()=>({
    scenarios: document.querySelectorAll('.scenario').length,
    chiffres: document.querySelectorAll('.chiffre').length,
  }));
  verifier(cp.scenarios===173,'il voit les 173 scénarios de son projet',`${cp.scenarios} vus`);
  verifier(cp.chiffres===4,'et les quatre chiffres');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
