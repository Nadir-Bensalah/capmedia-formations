/* ==========================================================================
   CAPMEDIA CLIENT HUB · la console de tests à l'épreuve

   Elle regarde tous les projets d'un coup, ce qui en fait l'endroit du Hub
   où une fuite entre clients coûterait le plus cher : le sélecteur de
   projet ne doit proposer que les siens, et c'est vérifié ici nommément.

   L'ordre des sections est éprouvé lui aussi. « Ce qui ne va pas » vient
   en premier, parce qu'un tableau de bord qui ouvre sur ce qui va bien ne
   sert à personne, et cet ordre est une décision, pas un hasard de mise en
   page.

   Cette suite POSE elle-même ce qu'elle vérifie en haut de page : une
   anomalie bloquante, une campagne en retard, une campagne sans scénario.
   Elle ne dépend plus des restes d'une autre suite, parce qu'une suite qui
   attend qu'une voisine ait tourné avant elle signale des écarts qui n'en
   sont pas, et on finit par ne plus la croire.

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
  /* Le titre de page arrive avant la session : ce qui prouve que la
     connexion a pris, c'est la barre latérale, qui ne se dessine qu'avec
     un rôle. Sous charge, une attente aveugle laissait tout le reste de
     la suite courir sur une page encore anonyme. */
  await page.waitForSelector('.lat a',{timeout:60000}).catch(()=>{});await pause(1200);};
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

  /* Ce que la page doit signaler en haut. On le pose ici plutôt que de
     compter sur une autre suite : l'anomalie bloquante, la campagne dont
     la date de fin est passée, et celle qui n'a aucun scénario. */
  const hier = new Date(Date.now() - 86400000).toISOString();
  const poser = async (chemin, corps) => fetch(bdd(chemin), {
    method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: corps }),
  });
  await poser('projets/atelier/anomalies/qa-bloquante', {
    titre: { stringValue: 'Le rappel fin de mois ne part jamais' },
    gravite: { stringValue: 'bloquant' }, statut: { stringValue: 'confirmee' },
    actif: { booleanValue: true },
  });
  await poser('projets/atelier/campagnes/qa-retard', {
    nom: { stringValue: 'Passe en retard' }, statut: { stringValue: 'en-cours' },
    fin: { stringValue: hier.slice(0, 10) }, actif: { booleanValue: true },
    scenarios: { arrayValue: { values: [{ stringValue: 'DI-06' }] } },
  });
  await poser('projets/atelier/campagnes/qa-vide', {
    nom: { stringValue: 'Passe sans scénario' }, statut: { stringValue: 'en-cours' },
    actif: { booleanValue: true }, scenarios: { arrayValue: { values: [] } },
  });

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
  verifier(/sans aucun scénario|aucun scénario retenu/i.test(g.texte),'la campagne sans scénario est signalée');

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
  /* Les comptes réels, lus en base : la bibliothèque grandit, et une
     suite qui exige 173 tombe au premier ajout pour une raison qui n'est
     pas un défaut. */
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
  const nDoubles = actifs.filter((d) => ['socle', 'transversal'].includes(NIV(d))).length;
  console.log(`    (${nScen} scénarios actifs, ${nDoubles} doublés)`);

  verifier(u.scenarios===nScen,`les ${nScen} scénarios sont dans la page`,`${u.scenarios} vus`);
  verifier(u.doubles===nDoubles,`${nDoubles} marqués double`,`${u.doubles} vus`);
  /* Quatre chiffres pour la campagne, quatre pour les parcours : la page
     en porte huit dès qu'un projet a des parcours automatisés. */
  verifier(u.chiffres.length>=4,`les chiffres du haut (${u.chiffres.length})`);
  verifier(u.plier,'la bibliothèque est repliable');
  verifier(u.creer,'le bouton de création de campagne est là');

  console.log('\n== Le filtre par plateforme');
  await page.click('[data-plateforme="web"]'); await pause(1400);
  const w = await page.evaluate(()=>({n:document.querySelectorAll('.scenario').length, hash:location.hash}));
  verifier(w.hash.includes('plateforme=web'),'le filtre passe dans l\'adresse',w.hash);
  verifier(w.n>0 && w.n<=nScen,`le filtre web restreint la liste (${w.n})`);

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
  verifier(o.chiffres===4,'le résumé affiche ses quatre chiffres',`${o.chiffres}`);
  verifier(o.console,'le bouton « Ouvrir la console » est là');
  /* L'onglet du projet ne nomme PAS les campagnes : il en donne le
     nombre, et renvoie vers la console pour le détail. C'est la décision
     prise quand l'onglet a été allégé. Le contrôle d'origine ne passait
     que parce qu'un nom traînait ailleurs dans la page. */
  verifier(/campagnes? en cours/.test(o.texte),'le nombre de campagnes en cours est rappelé',`vu : ${o.texte.slice(0,160).replace(/\n+/g,' | ')}`);

  console.log('\n== Le client');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  const latC = await cl.evaluate(()=>[...document.querySelectorAll('.lat a')].map(a=>a.textContent.trim().split('\n')[0]));
  verifier(latC.some(x=>/^Tests/.test(x)),'le client a aussi l\'entrée Tests',latC.join(' / '));
  await aller(cl,'/tests','.section-tete h2','Tests');
  await pause(1200);
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

  await aller(cl,'/tests?projet=atelier','#parcours','Tests');
  await pause(1000);
  const cp = await cl.evaluate(()=>({
    scenarios: document.querySelectorAll('.scenario').length,
    chiffres: document.querySelectorAll('.chiffre').length,
  }));
  verifier(cp.scenarios===nScen,`il voit les ${nScen} scénarios de son projet`,`${cp.scenarios} vus`);
  verifier(cp.chiffres>=4,`et les chiffres du haut (${cp.chiffres})`);

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
