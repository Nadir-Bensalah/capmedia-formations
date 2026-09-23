/* ==========================================================================
   CAPMEDIA CLIENT HUB · le tableau des tests, dans les trois espaces

   Ce que Nadir a demandé le 23/09/2026 : une carte par famille, une case
   par test, en temps réel, pour les tests humains ET automatisés ; lui seul
   voit qui est connecté, quand, combien de temps, sur quoi ; le client ne
   voit que les résultats.

   Chaque ligne de la règle des couleurs a sa case dans le semis, et on lit
   la couleur case par case. Le temps réel se prouve sans recharger : un
   passage posé ailleurs doit changer la case sous nos yeux.

     (émulateurs avec les fonctions, semis, serveur local sur 8787)
     node fonctions-suivi/outils/qa-tableau.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const CLE=process.env.ADMIN_CLE_ESSAI||'cle-essai-locale';
const ROBOT=`http://127.0.0.1:5001/${PROJET}/europe-west1/suiviRobot`;
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const effacer=async(c)=>fetch(bdd(c),{method:'DELETE',headers:prop});
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const poser=async(chemin,fields,masque)=>fetch(bdd(chemin)+(masque?`?${masque.map(m=>`updateMask.fieldPaths=${m}`).join('&')}`:''),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields})});
const S=(v)=>({stringValue:String(v)}), N=(v)=>({integerValue:String(v)}), B=(v)=>({booleanValue:v}), T=(d)=>({timestampValue:d.toISOString()});
const L=(xs)=>({arrayValue:{values:xs}});
const champ=(d,k)=>(((d||{}).fields||{})[k]||{});
const str=(d,k)=>champ(d,k).stringValue||'';
const soucis=[];const ok=m=>console.log('  ok     '+m);const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const attendre=async(fn,n=30,ms=600)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(ms);}return null;};
const serveur=async(action,corps)=>{
  const r=await fetch(`http://127.0.0.1:5001/${PROJET}/europe-west1/suiviAdmin`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cle:CLE,action,...corps})});
  return { code:r.status, texte:await r.text() };
};
const robot=async(jeton,corps)=>{
  const r=await fetch(ROBOT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jeton}`},body:JSON.stringify(corps)});
  const texte=await r.text(); let json={}; try{json=JSON.parse(texte);}catch(e){}
  return { code:r.status, texte, json };
};
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=200');const p=((j&&j.documents)||[]).filter(d=>str(d,'modele')==='code'&&((((d.fields||{}).a||{}).arrayValue||{}).values||[]).some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e));if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
const connecter=async(page,email)=>{
  await vider('connexions');await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
  await page.fill('#email',email);await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
  await page.fill('#code',await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/,{timeout:40000}).catch(()=>{});
  await pause(2500);
};
/* Juste après la connexion, l'accueil finit parfois de se dessiner après
   qu'on a changé d'adresse : on repose l'adresse tant que le tableau n'est
   pas là, comme le ferait quelqu'un qui clique une seconde fois. */
const allerTableau=async(page,requete)=>{
  for (let i=0;i<6;i++){
    await page.evaluate(h=>{location.hash=h;window.dispatchEvent(new HashChangeEvent('hashchange'));},`#/tests/tableau${requete?`?${requete}`:''}`);
    if (await page.waitForSelector('.tb-case',{timeout:5000}).then(()=>true).catch(()=>false)) break;
  }
  await pause(1200);
};
const etats=(page)=>page.$$eval('.tb-case',els=>Object.fromEntries(els.map(e=>[e.dataset.case,e.dataset.e+(e.hasAttribute('data-revoir')?'+revoir':'')])));
const etatDe=async(page,ref)=>(await etats(page))[ref];
const attendreEtat=(page,ref,voulu,n=30)=>attendre(async()=>((await etatDe(page,ref))===voulu),n,500);

const PID='atelier', CID='qa-tableau';
const SCENARIOS=[
  ['TB-01','taches','socle','Créer une tâche récurrente'],
  ['TB-02','taches','socle','Cocher une tâche hors ligne'],
  ['TB-03','taches','reparti','Supprimer une tâche'],
  ['TB-04','dates-importantes','socle','Anniversaire sans année'],
  ['TB-05','dates-importantes','reparti','Rappel la veille'],
  ['TB-06','dates-importantes','reparti','Personne ne le reçoit'],
  ['TB-07','objectifs','reparti','Objectif sans échéance'],
  ['TB-08','objectifs','reparti','Désarchiver un objectif'],
];

(async()=>{
  console.log('\n== Semis');
  /* Ce qu'une passe précédente a laissé. */
  const vivier=await lire('testeurs?pageSize=100');
  for (const d of ((vivier&&vivier.documents)||[])) if (/tableau@exemple\.test$/.test(str(d,'email'))) await serveur('retirerTesteur',{testeur:d.name.split('/').pop(),definitif:true});
  await vider(`projets/${PID}/campagnes/${CID}/passages`); await effacer(`projets/${PID}/campagnes/${CID}`);
  for (const [r] of SCENARIOS) await effacer(`projets/${PID}/anomalies/ko-${r}`);
  for (const r of ['P-01','P-02','P-03']) await effacer(`projets/${PID}/parcours/${r}`);
  await vider(`projets/${PID}/executions`); await vider('robots'); await vider('presences');

  const inscrire=async(email,prenom,plateformes)=>{
    const r=await serveur('inscrireTesteur',{email,prenom,plateformes,projets:[PID]});
    let uid=''; try{uid=JSON.parse(r.texte).uid;}catch(e){}
    return uid;
  };
  const u1=await inscrire('nina.tableau@exemple.test','Nina',['ios']);
  const u2=await inscrire('omar.tableau@exemple.test','Omar',['android']);
  const u3=await inscrire('paul.tableau@exemple.test','Paul',['web']);
  verifier(u1&&u2&&u3,'trois testeurs inscrits');

  for (const [i,[ref,bloc,niveau,titre]] of SCENARIOS.entries()) {
    await poser(`projets/${PID}/scenarios/${ref}`,{ref:S(ref),titre:S(titre),bloc:S(bloc),niveau:S(niveau),ordre:N(900+i),actif:B(true),attendu:S('Ça marche.')});
  }
  const affect={ [u1]:['TB-01','TB-02','TB-03','TB-04'], [u2]:['TB-01','TB-02','TB-04','TB-07'], [u3]:['TB-05','TB-08'] };
  await poser(`projets/${PID}/campagnes/${CID}`,{
    titre:S('Passe du tableau'),statut:S('en-cours'),testeurs:L([S(u1),S(u2),S(u3)]),
    scenarios:L(SCENARIOS.map(([r])=>S(r))),
    affectation:{mapValue:{fields:Object.fromEntries(Object.entries(affect).map(([u,refs])=>[u,L(refs.map(S))]))}},
    debut:T(new Date(Date.now()-2*86400000)),fin:T(new Date(Date.now()+10*86400000)),cree:T(new Date()),
  });
  const passage=async(uid,ref,resultat,plateforme)=>poser(`projets/${PID}/campagnes/${CID}/passages/${uid}__${ref}`,{
    scenario:S(ref),testeur:S(uid),plateforme:S(plateforme),resultat:S(resultat),commentaire:S(resultat==='ko'?'Rien ne se passe':''),
    preuves:L(resultat==='ko'?[S(`campagnes/${PID}/${CID}/${uid}/preuve.png`)]:[]),contexte:{mapValue:{fields:{appareil:S('iPhone 15')}}},le:T(new Date()),
  });
  await passage(u1,'TB-01','ok','ios'); await passage(u2,'TB-01','ok','android');
  await passage(u1,'TB-02','ko','ios'); await passage(u2,'TB-02','ko','android');
  await passage(u1,'TB-03','ko','ios');
  await passage(u1,'TB-04','ok','ios');
  await passage(u2,'TB-07','na','android');
  await passage(u3,'TB-08','ko','web');
  const ano=await attendre(async()=>(await lire(`projets/${PID}/anomalies/ko-TB-08`)));
  verifier(!!ano,'un KO fait naître son anomalie');
  await attendre(async()=>(await lire(`projets/${PID}/anomalies/ko-TB-02`)));
  await attendre(async()=>(await lire(`projets/${PID}/anomalies/ko-TB-03`)));

  console.log('\n== Corriger une anomalie la fait rejouer, sans la rouvrir');
  await poser(`projets/${PID}/anomalies/ko-TB-08`,{statut:S('corrigee')},['statut']);
  const marque=await attendre(async()=>{const p=await lire(`projets/${PID}/campagnes/${CID}/passages/${u3}__TB-08`);return champ(p,'aRevoir').booleanValue===true;});
  verifier(marque,'le KO du testeur est marqué « à rejouer »');
  await pause(2500);
  let a8=await lire(`projets/${PID}/anomalies/ko-TB-08`);
  verifier(str(a8,'statut')==='corrigee','et l anomalie reste corrigée : la marque ne passe pas pour une régression',str(a8,'statut'));
  verifier(!champ(a8,'retours').integerValue,'aucun retour compté',JSON.stringify(champ(a8,'retours')));
  /* Le rattachement par l'équipe, lui aussi, ne fait pas un témoin. */
  await poser(`projets/${PID}/campagnes/${CID}/passages/${u3}__TB-08`,{anomalie:S('ko-TB-08')},['anomalie']);
  await pause(2500);
  a8=await lire(`projets/${PID}/anomalies/ko-TB-08`);
  verifier(str(a8,'statut')==='corrigee','rattacher le passage à l anomalie ne la rouvre pas non plus',str(a8,'statut'));

  const nav=await chromium.launch();
  const ctxEquipe=await nav.newContext({viewport:{width:1440,height:900}});
  const equipe=await ctxEquipe.newPage();
  const erreursPage=[]; equipe.on('pageerror',e=>erreursPage.push(e.message));

  console.log('\n== Cockpit : chaque ligne de la règle a sa couleur');
  await connecter(equipe,'agent.essai@exemple.test');
  await allerTableau(equipe,`projet=${PID}&campagne=${CID}`);
  const e0=await etats(equipe);
  const voulu={ 'TB-01':'ok','TB-02':'casse','TB-03':'fragile','TB-04':'cours','TB-05':'vide','TB-06':'trou','TB-07':'na','TB-08':'cours+revoir' };
  for (const [ref,v] of Object.entries(voulu)) verifier(e0[ref]===v,`${ref} : ${v}`,`vu ${e0[ref]}`);
  const pourcent=await equipe.$eval('.tb-pourcent b',b=>b.textContent.replace(/\s/g,'')).catch(()=>'');
  verifier(pourcent.startsWith('70'),'l avancement se compte en passages : 7 sur 10',pourcent);
  verifier(await equipe.$$eval('.tb-personne',x=>x.length).catch(()=>0)===3,'les trois testeurs ont leur carte');
  verifier(erreursPage.length===0,'aucune erreur dans la page',erreursPage.join(' | ').slice(0,200));

  await equipe.click('[data-case="TB-02"]'); await pause(600);
  const feuille=await equipe.textContent('.feuille').catch(()=>'');
  verifier(/2 testeurs sur 2 en échec/.test(feuille),'la feuille dit pourquoi : 2 testeurs sur 2 en échec',feuille.slice(0,120));
  verifier(/Nina/.test(feuille)&&/Omar/.test(feuille),'et nomme les testeurs, côté équipe');
  await equipe.keyboard.press('Escape'); await equipe.click('.feuille [data-fermer]').catch(()=>{}); await pause(300);

  console.log('\n== Le tableau vit DANS Tests');
  {
    const entrees=await equipe.$$eval('.lat-lien',as=>as.map(a=>a.textContent.trim()));
    verifier(!entrees.some(t=>/Tableau des tests/.test(t)),'plus d entrée séparée « Tableau des tests » dans le menu');
    verifier(!!(await equipe.$('.lat-lien[href="#/tests/tableau"]')),'l entrée « Tests » ouvre le tableau');
    verifier(await equipe.$eval('.lat-lien[href="#/tests/tableau"]',a=>a.classList.contains('actif')).catch(()=>false),'et reste allumée sur le tableau');
    verifier(!!(await equipe.$('.onglets-tests a[href^="#/tests/tableau"].actif')),'l onglet Tableau est actif');
    await equipe.click('.onglets-tests a[href^="#/tests?"], .onglets-tests a[href="#/tests"]');
    await equipe.waitForSelector('#campagnes, .section-tete',{timeout:20000}).catch(()=>{});
    verifier(/#\/tests(\?|$)/.test(await equipe.evaluate(()=>location.hash)),'l onglet Détail ouvre la console',await equipe.evaluate(()=>location.hash));
    verifier(await equipe.$eval('.lat-lien[href="#/tests/tableau"]',a=>a.classList.contains('actif')).catch(()=>false),'et « Tests » reste allumé sur le détail');
    verifier(/projet=atelier/.test(await equipe.evaluate(()=>location.hash)),'le projet choisi suit d un onglet à l autre',await equipe.evaluate(()=>location.hash));
    await equipe.evaluate(()=>{location.hash='#/tableau?projet=atelier';});
    const redirige=await attendre(async()=>/^#\/tests\/tableau/.test(await equipe.evaluate(()=>location.hash)),20,300);
    verifier(redirige,'l ancienne adresse #/tableau mène au tableau dans Tests');
    await allerTableau(equipe,`projet=${PID}&campagne=${CID}`);
  }

  console.log('\n== Une campagne ne finit pas avant de commencer');
  {
    await equipe.evaluate(()=>{location.hash='#/tests?projet=atelier';});
    await equipe.waitForSelector(`[data-editer-campagne="${CID}"]`,{timeout:20000}).catch(()=>{});
    await equipe.click(`[data-editer-campagne="${CID}"]`);
    await equipe.waitForSelector('#ed-debut',{timeout:10000});
    await equipe.fill('#ed-debut','2026-10-01'); await equipe.fill('#ed-fin','2026-09-30');
    await equipe.click('.feuille [type="submit"], .feuille .btn-principal');
    const refus=await attendre(async()=>{const t=await equipe.textContent('.toasts').catch(()=>'');return /avant le début/.test(t);},15,300);
    verifier(refus,'des dates inversées sont refusées, avec la raison');
    const c=await lire(`projets/${PID}/campagnes/${CID}`);
    verifier(!/2026-10-01/.test(champ(c,'debut').timestampValue||''),'et rien n est enregistré',champ(c,'debut').timestampValue);
    await equipe.click('.feuille [data-fermer]').catch(()=>{});
    await allerTableau(equipe,`projet=${PID}&campagne=${CID}`);
  }

  console.log('\n== Temps réel : un passage posé ailleurs change la case sans recharger');
  await passage(u2,'TB-04','ok','android');
  verifier(await attendreEtat(equipe,'TB-04','ok'),'TB-04 passe au vert sous nos yeux');

  console.log('\n== Plateforme : le filtre recalcule');
  await equipe.click('[data-plateforme="android"]'); await pause(800);
  const eAnd=await etats(equipe);
  verifier(eAnd['TB-03']==='vide','sur Android, le KO iOS de TB-03 ne compte pas',`vu ${eAnd['TB-03']}`);
  await equipe.click('[data-plateforme=""]'); await pause(800);

  console.log('\n== Le testeur : ses cases, son sens');
  const ctxT=await nav.newContext({viewport:{width:390,height:844}});
  const testeur=await ctxT.newPage();
  await connecter(testeur,'paul.tableau@exemple.test');
  verifier(/\/suivi\/testeur/.test(testeur.url()),'Paul arrive dans son espace',testeur.url());
  await testeur.waitForSelector('.tb-case',{timeout:30000}).catch(()=>{});
  const eT=await etats(testeur);
  verifier(Object.keys(eT).length===2,'il ne voit que ses deux scénarios',Object.keys(eT).join(','));
  verifier(eT['TB-05']==='vide','TB-05 à faire',eT['TB-05']);
  verifier(eT['TB-08']==='revoir','TB-08 corrigé par l équipe : à rejouer, en orange',eT['TB-08']);
  const taille=await testeur.$eval('.tb-case',b=>b.getBoundingClientRect().width).catch(()=>0);
  verifier(taille>=28,'au téléphone, une case se touche du doigt (28 px)',`${taille}px`);
  const texteT=await testeur.textContent('body');
  verifier(!/Nina|Omar/.test(texteT),'il ne voit jamais les autres testeurs');

  /* La capture de Nadir du 23/09 : « Aucune campagne en cours », et il
     fallait recharger. La page doit suivre le statut de la campagne. */
  await poser(`projets/${PID}/campagnes/${CID}`,{statut:S('preparation')},['statut']);
  const eteinte=await attendre(async()=>/Aucune campagne en cours/.test(await testeur.textContent('body')),30,500);
  verifier(eteinte,'campagne repassée en préparation : sa page le dit sans recharger');
  verifier(/Capmedia Tests/i.test(await testeur.textContent('body')),'et même vide, elle dit où il est');
  await poser(`projets/${PID}/campagnes/${CID}`,{statut:S('en-cours')},['statut']);
  verifier(await attendreEtat(testeur,'TB-08','revoir'),'la campagne passe En cours : ses cases apparaissent toutes seules');

  console.log('\n== Présence : lui seul voit qui est là, sur quoi');
  await testeur.click('[data-sur="web"]'); await pause(500);
  await testeur.click('[data-case="TB-05"]');
  await testeur.waitForSelector('.feuille',{timeout:10000}).catch(()=>{});
  const vu=await attendre(async()=>{const t=await equipe.textContent('.tb-direct').catch(()=>'');return /Paul/.test(t)&&/TB-05/.test(t);},40,500);
  verifier(vu,'le cockpit voit Paul en ligne, sur TB-05');
  const pulse=await attendre(async()=>equipe.$eval('[data-case="TB-05"]',b=>b.classList.contains('tb-case--vivante')).catch(()=>false),20,500);
  verifier(pulse,'et la case TB-05 pulse');
  const carte=await equipe.textContent('.tb-personne[data-personne="'+u3+'"]').catch(()=>'');
  verifier(/en ligne/.test(carte),'sa carte dit « en ligne »',carte.slice(0,80));
  const pres=await lire(`presences/${u3}`);
  verifier(!!champ(pres,'debut').timestampValue&&!!champ(pres,'vu').timestampValue,'la présence porte les dates du serveur');
  const sess=await lire(`presences/${u3}/sessions?pageSize=10`);
  verifier(((sess&&sess.documents)||[]).length>=1,'une session est ouverte, datée, pour mesurer le temps passé');

  await testeur.click('[data-feuille-poser="ok"]');
  verifier(await attendreEtat(equipe,'TB-05','ok'),'Paul pose OK depuis sa feuille : le cockpit passe TB-05 au vert en direct');
  verifier(await attendreEtat(testeur,'TB-05','ok'),'et sa propre case aussi');
  await testeur.click('[data-case="TB-08"]'); await testeur.waitForSelector('.feuille',{timeout:10000}).catch(()=>{});
  const fT=await testeur.textContent('.feuille').catch(()=>'');
  verifier(/À rejouer/.test(fT),'la feuille de TB-08 lui dit de rejouer');
  await testeur.click('[data-feuille-poser="ok"]');
  verifier(await attendreEtat(equipe,'TB-08','ok'),'rejoué OK : TB-08 passe au vert chez l équipe');
  const a8b=await lire(`projets/${PID}/anomalies/ko-TB-08`);
  verifier(str(a8b,'statut')==='corrigee','un OK ne rouvre rien',str(a8b,'statut'));

  console.log('\n== Le client : les résultats en direct, rien d autre');
  const ctxC=await nav.newContext({viewport:{width:1440,height:900}});
  const client=await ctxC.newPage();
  const erreursClient=[]; client.on('pageerror',e=>erreursClient.push(e.message)); client.on('console',m=>{if(m.type()==='error'||m.type()==='warning')erreursClient.push('console '+m.text().slice(0,300));});
  await connecter(client,'camille.essai@exemple.test');
  const lien=await client.$('.lat-lien[href="#/tests/tableau"]');
  verifier(!!lien,'chez le client aussi, « Tests » ouvre le tableau');
  await allerTableau(client,`projet=${PID}&campagne=${CID}`);
  const eC=await etats(client);
  verifier(eC['TB-02']==='casse'&&eC['TB-05']==='ok','il voit les mêmes verdicts',JSON.stringify(eC)+' '+(await client.textContent('body')).replace(/\s+/g,' ').slice(0,400)+' '+erreursClient.join('|'));
  verifier(!('TB-06' in eC),'mais pas les trous d affectation, affaire interne');
  const texteC=await client.textContent('main, #contenu, body');
  verifier(!/Nina|Omar|Paul/.test(texteC),'aucun prénom de testeur dans sa page');
  verifier(!/en ligne|Les testeurs|Les robots/.test(texteC),'ni présence, ni cartes de testeurs, ni robots');
  await client.click('[data-case="TB-02"]'); await pause(600);
  const fC=await client.textContent('.feuille').catch(()=>'');
  verifier(/Testeur \d/.test(fC)&&!/Nina|Omar/.test(fC),'dans le détail, des testeurs numérotés',fC.slice(0,100));
  await client.click('.feuille [data-fermer]').catch(()=>{});
  /* Le même passage qui change de résultat : même identifiant, rien
     d'autre que « le » et « resultat » ne bouge. Le client n'a pas
     d'horloge qui redessine : seul le temps réel peut le montrer. */
  await passage(u2,'TB-07','ok','android');
  verifier(await attendreEtat(client,'TB-07','ok'),'un NA corrigé en OK sous le même passage change la case du client en direct');
  await passage(u1,'TB-03','ok','ios');
  verifier(await attendreEtat(client,'TB-03','fragile'),'un KO corrigé par le testeur lui-même laisse l anomalie ouverte : toujours fragile, jusqu à ce que l équipe tranche');
  await poser(`projets/${PID}/anomalies/ko-TB-03`,{statut:S('sans-suite')},['statut']);
  verifier(await attendreEtat(client,'TB-03','ok'),'l équipe classe sans suite : le client le voit passer au vert en direct');
  verifier(erreursClient.length===0,'aucune erreur dans la page du client',erreursClient.join(' | ').slice(0,200));

  console.log('\n== Tests automatisés : un robot rend ses verdicts en direct');
  const S2=(ref,titre,outil,scen,etat)=>poser(`projets/${PID}/parcours/${ref}`,{ref:S(ref),titre:S(titre),outil:S(outil),plateformes:L([S('ios')]),scenarios:L(scen.map(S)),etat:S(etat),actif:B(true),ordre:N(1),mutation:B(false)});
  await S2('P-01','Créer une tâche récurrente','maestro',['TB-01'],'ecrit');
  await S2('P-02','Règle des rappels','jest',[],'ecrit');
  await S2('P-03','Cocher hors ligne','playwright',['TB-02'],'a-ecrire');
  const j=await serveur('creerJetonRobot',{projet:PID,nom:'Maestro iOS'});
  let jeton=''; try{jeton=JSON.parse(j.texte).jeton;}catch(e){}
  verifier(/^cmr_[0-9a-f]{48}$/.test(jeton),'le cockpit crée un jeton de robot');
  const robots=await lire('robots?pageSize=10');
  const brut=JSON.stringify(robots||{});
  verifier(!brut.includes(jeton),'le jeton lui-même n est gardé nulle part, seulement son empreinte');

  verifier((await robot('cmr_'+'0'.repeat(48),{evenement:'debut',execution:'x'})).code===401,'un jeton inconnu est refusé');
  verifier((await robot('',{evenement:'debut',execution:'x'})).code===401,'sans jeton : refusé');

  await allerTableau(equipe,`projet=${PID}&voie=machine`);
  await equipe.click('[data-voie="machine"]').catch(()=>{}); await pause(800);
  await allerTableau(client,`projet=${PID}&voie=machine`);
  await client.click('[data-voie="machine"]').catch(()=>{}); await pause(800);
  const d0=await robot(jeton,{evenement:'debut',execution:'ci-42',outil:'maestro',plateforme:'ios',branche:'branche-secrete',commit:'deadbeef1234',parcours:['P-01','P-02','P-99']});
  verifier(d0.code===200,'le robot annonce son exécution',d0.texte.slice(0,80));
  verifier((d0.json.inconnus||[]).includes('P-99'),'et apprend qu un parcours lui est inconnu');
  verifier(await attendreEtat(equipe,'P-01','tourne'),'les cases passent au bleu : en exécution');
  verifier(await attendreEtat(client,'P-01','tourne'),'le client le voit aussi');
  const direct=await equipe.textContent('.tb-direct').catch(()=>'');
  verifier(/branche-secrete/.test(direct),'l équipe lit la branche en cours',direct.slice(0,120));

  await robot(jeton,{evenement:'resultat',execution:'ci-42',ref:'P-01',resultat:'vert',essais:2,duree:12.5});
  verifier(await attendreEtat(equipe,'P-01','fragile'),'vert au deuxième essai : instable, en orange');
  await robot(jeton,{evenement:'resultats',execution:'ci-42',resultats:[{ref:'P-02',resultat:'rouge',message:'Trace interne : attendu 3, reçu 2',duree:0.4}]});
  verifier(await attendreEtat(client,'P-02','casse'),'un rouge arrive chez le client en direct');
  const fin=await robot(jeton,{evenement:'fin',execution:'ci-42'});
  verifier(fin.code===200,'le robot termine');
  const texteCM=await client.textContent('body');
  verifier(!/branche-secrete|deadbeef|Trace interne/.test(texteCM),'le client ne lit ni la branche, ni le commit, ni le message d erreur');
  await client.click('[data-case="P-02"]'); await pause(800);
  const fCM=await client.textContent('.feuille').catch(()=>'');
  verifier(!/Trace interne/.test(fCM),'même dans le détail du parcours');
  await client.click('.feuille [data-fermer]').catch(()=>{});
  await equipe.click('[data-case="P-02"]'); await pause(1200);
  const fEM=await equipe.textContent('.feuille').catch(()=>'');
  verifier(/Trace interne/.test(fEM),'l équipe, elle, lit ce que la machine a dit');
  await equipe.click('.feuille [data-fermer]').catch(()=>{});
  verifier((await robot(jeton,{evenement:'resultat',execution:'ci-42',ref:'P-01',resultat:'vert'})).code===409,'une exécution finie ne reçoit plus rien');

  console.log('\n== Le rapporteur JUnit');
  const j2=await serveur('creerJetonRobot',{projet:PID,nom:'CI'});
  let jeton2=''; try{jeton2=JSON.parse(j2.texte).jeton;}catch(e){}
  const xml=`<?xml version="1.0"?><testsuites><testsuite name="maestro">
    <testcase name="P-01 Créer une tâche récurrente" time="3.2"/>
    <testcase name="P-03 Cocher hors ligne" time="2.0"><failure message="délai dépassé">Timeout</failure></testcase>
    <testcase name="P-03 Cocher hors ligne" time="2.1"/>
    <testcase name="Un test sans référence" time="1"/>
  </testsuite></testsuites>`;
  const fichier=path.join(require('os').tmpdir(),'qa-tableau-junit.xml'); fs.writeFileSync(fichier,xml);
  let sortieScript='';
  try { sortieScript=execFileSync('node',[path.join(__dirname,'robot','robot-rapport.mjs'),'--url',ROBOT,'--outil','maestro','--plateforme','ios','--execution','junit-1',fichier],{env:{...process.env,CAPMEDIA_ROBOT:jeton2},encoding:'utf8',stdio:['ignore','pipe','pipe']}); }
  catch (e) { sortieScript=String(e.stdout||'')+String(e.stderr||''); }
  verifier(/2 parcours · 1 verts · 1 instables · 0 rouges/.test(sortieScript),'le script lit le rapport : un vert, un instable',sortieScript.trim().slice(0,160));
  verifier(await attendreEtat(equipe,'P-01','ok'),'P-01 au vert');
  verifier(await attendreEtat(equipe,'P-03','fragile'),'P-03, échoué puis réussi : instable');

  console.log('\n== Révoquer un jeton');
  const liste=await lire('robots?pageSize=10');
  const cible=((liste&&liste.documents)||[]).find(d=>str(d,'nom')==='CI');
  const rv=await serveur('revoquerJetonRobot',{id:cible?cible.name.split('/').pop():''});
  verifier(rv.code===200,'le cockpit révoque le jeton');
  verifier((await robot(jeton2,{evenement:'debut',execution:'apres'})).code===401,'le robot ne peut plus rien envoyer');

  console.log('\n== Une vraie campagne tient sur un écran');
  {
    const COMPTES=[['taches',42],['dates-importantes',36],['objectifs',21],['rituels',17],['transversal',15],['voyages',15],['idees',12],['journal',9],['compte-charge',6]];
    const refs=[];
    for (const [k,[bloc,n]] of COMPTES.entries()) for (let i=1;i<=n;i++){ const ref=`G${k}-${i}`; refs.push(ref); await poser(`projets/boutique/scenarios/${ref}`,{ref:S(ref),titre:S(`Scénario ${ref}`),bloc:S(bloc),niveau:S('reparti'),ordre:N(refs.length),actif:B(true)}); }
    await poser('projets/boutique/campagnes/qa-grande',{titre:S('Campagne de 173'),statut:S('en-cours'),testeurs:L([S(u1)]),scenarios:L(refs.map(S)),affectation:{mapValue:{fields:{[u1]:L(refs.map(S))}}},cree:T(new Date())});
    await allerTableau(equipe,'projet=boutique&campagne=qa-grande&voie=humains');
    await equipe.click('[data-voie="humains"]').catch(()=>{});
    await attendre(async()=>(await equipe.$$eval('.tb-case',x=>x.length))===refs.length,30,500);
    const n=await equipe.$$eval('.tb-case',x=>x.length);
    verifier(n===173,'173 cases',String(n));
    const bas=await equipe.$eval('.tb-familles',el=>el.getBoundingClientRect().bottom+window.scrollY);
    verifier(bas<=1000,'les 9 familles tiennent en un écran de 1440 × 900, à un souffle près',`bas des cartes à ${Math.round(bas)} px`);
    await equipe.screenshot({path:path.join(require('os').tmpdir(),'qa-tableau-173.png')});
    for (const ref of refs) await effacer(`projets/boutique/scenarios/${ref}`);
    await effacer('projets/boutique/campagnes/qa-grande');
  }

  await nav.close();
  /* Ce qu'on laisse : rien. */
  for (const uid of [u1,u2,u3]) if (uid) await serveur('retirerTesteur',{testeur:uid,definitif:true});
  await vider('robots'); await vider('presences');
  await vider(`projets/${PID}/campagnes/${CID}/passages`); await effacer(`projets/${PID}/campagnes/${CID}`);
  for (const [r] of SCENARIOS) { await effacer(`projets/${PID}/scenarios/${r}`); await effacer(`projets/${PID}/anomalies/ko-${r}`); }
  for (const r of ['P-01','P-02','P-03']) await effacer(`projets/${PID}/parcours/${r}`);
  for (const e of ['ci-42','junit-1']) await vider(`projets/${PID}/executions/${e}/resultats`);
  await vider(`projets/${PID}/executions`);

  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-tableau : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
