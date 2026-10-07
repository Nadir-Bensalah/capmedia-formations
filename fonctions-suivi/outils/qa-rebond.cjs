require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
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

/* La sonde : elle vit dans la page, d'une adresse à l'autre. */
const sonder=(page)=>page.evaluate(()=>{
  if(window.__sonde)return;
  const s={ev:[],image:0};window.__sonde=s;
  /* Le compteur d'images : deux remplacements dans la même image n'ont
     jamais été vus par l'œil, seul le second a été peint. */
  const tourner=()=>{s.image+=1;requestAnimationFrame(tourner);};requestAnimationFrame(tourner);
  const obs=new MutationObserver((ms)=>{for(const m of ms){if(m.type!=='childList')continue;
    for(const n of m.addedNodes){if(n.nodeType!==1)continue;
      const cible=m.target;const genre=cible.id==='vue'?'page':(cible.id==='onglet-corps'||n.id==='onglet-corps'?'onglet':(cible.classList&&cible.classList.contains('tb-section')?'tableau':null));
      if(!genre)continue;
      const squelette=n.classList.contains('squelette')||!!(n.querySelector&&n.querySelector('.squelette'));
      s.ev.push({t:Math.round(performance.now()),image:s.image,genre,squelette,taille:(n.innerHTML||'').length,scroll:Math.round(scrollY)});}}});
  obs.observe(document.querySelector('#vue'),{childList:true,subtree:true});
});
const relever=async(page,geste)=>{
  await page.evaluate(()=>{window.__sonde.ev=[];window.__sonde.t0=performance.now();});
  await geste();
  await pause(1400);
  const r=await page.evaluate(()=>{const s=window.__sonde;const pages=s.ev.filter(e=>e.genre==='page');const onglets=s.ev.filter(e=>e.genre==='onglet');const tableaux=s.ev.filter(e=>e.genre==='tableau');
    const tous=[...pages,...onglets,...tableaux].sort((a,b)=>a.t-b.t);
    /* Ce qui a été PEINT : un remplacement par image affichée. Le tableau
       des tests compte : il vit dans la page et se repeignait seul. */
    const peints=new Set(tous.map(e=>e.image)).size;
    /* Les images où du CONTENU (pas un squelette) a été peint : une seule,
       même quand la donnée arrive du serveur. */
    const contenus=new Set(tous.filter(e=>!e.squelette).map(e=>e.image)).size;
    const squelettePeint=s.ev.some(e=>e.squelette&&!s.ev.some(f=>!f.squelette&&f.image===e.image));
    return {pages:pages.length,onglets:onglets.length,tableaux:tableaux.length,peints,contenus,squelette:s.ev.some(e=>e.squelette),squelettePeint,
      temps:tous.map(e=>e.t-Math.round(s.t0)),arrivee:document.querySelector('#vue').classList.contains('arrivee'),
      scroll:Math.round(scrollY),h1:((document.querySelector('.page h1')||{}).innerText||'').trim().slice(0,30)};});
  return r;
};
const ligne=(nom,r)=>console.log(`  ${nom.padEnd(40)} peints=${r.peints} contenu=${r.contenus} (remplacements ${r.pages}+${r.onglets}+${r.tableaux}) squelette peint=${r.squelettePeint?'OUI':'non'} temps=[${r.temps.join(',')}] scroll=${r.scroll} ${r.h1}`);

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
    /* Le magasin dit quand un dessin a cessé d'attendre une clé : c'est un défaut. */
    page.on('console',m=>{const t=m.text();if(t.includes('[magasin]'))err.push(`${role} CONSOLE: `+t.slice(0,300));});
    await connecter(page,email);
    await sonder(page);
    const aller=(h)=>()=>page.evaluate(x=>{location.hash=x;},h);
    const releves={};
    const mesurer=async(nom,geste)=>{const r=await relever(page,geste);releves[nom]=r;ligne(nom,r);return r;};

    await mesurer('projet (arrivée)',aller('/projets/atelier'));
    /* Refonte du Cockpit, lot 2 : côté équipe, Fichiers et Activité ne sont
       plus des onglets du projet mais la page de tous les projets, filtrée
       sur lui (mesurées plus bas comme des pages). */
    /* Lot 3 : côté équipe, Tests n'est plus un onglet du projet mais sa
       console (/tests?projet=), mesurée plus bas comme une page ; Plateformes
       et versions, Ressources et Feuille de route sont des pages du projet
       ouvertes par l'arbre, en place (même clé de route). */
    const ongletsProjet=role==='équipe'?['taches','demandes','composants','liens','etapes']:['taches','demandes','fichiers','tests','activite'];
    for(const o of ongletsProjet) await mesurer(`onglet ${o}`,aller(`/projets/atelier/${o}`));
    await mesurer('onglet apercu',aller('/projets/atelier'));
    /* Première visite de la page Tests : la donnée vient du serveur, le
       squelette a le droit d'être peint, le contenu une seule fois. */
    await mesurer('page Tests',aller(role==='équipe'?'/tests?projet=atelier':'/tests'));
    if(role==='équipe'){await mesurer('page Tâches',aller('/taches'));await mesurer('page Calendrier',aller('/calendrier'));await mesurer('page Projets',aller('/projets'));
      /* Les pages d'un projet qui étaient des onglets (lot 2). */
      await mesurer('page Fichiers du projet',aller('/fichiers?projet=atelier'));
      await mesurer('page Activité du projet',aller('/activite?projet=atelier'));
      await mesurer('page Calendrier du projet',aller('/calendrier?projet=atelier'));
      /* Les filtres dans l'adresse (lot 2) : changer un filtre redessine la
         page une fois, en place, sans squelette ni remontage. */
      const choisir=(sel,v)=>()=>page.selectOption(sel,v);
      const cliquer=(sel)=>()=>page.click(sel);
      await mesurer('adresse calendrier : tous les projets',choisir('#f-projet',''));
      await mesurer('adresse calendrier : un projet',choisir('#f-projet','atelier'));
      await mesurer('page Fichiers',aller('/fichiers'));
      await mesurer('adresse fichiers : projet',choisir('#filtre-projet','atelier'));
      if(await page.$('[data-cat="design"]'))await mesurer('adresse fichiers : catégorie',cliquer('[data-cat="design"]'));
      await mesurer('adresse fichiers : tri',choisir('#tri-doc','nom'));
      await mesurer('page Activité',aller('/activite'));
      await mesurer('adresse activité : nature',cliquer('[data-nature="tache"]'));
      await mesurer('adresse activité : projet',choisir('#f-projet','atelier'));
      await mesurer('page Demandes',aller('/demandes'));
      await mesurer('adresse demandes : colonne',cliquer('[data-colonne="a-traiter"]'));
      await mesurer('adresse demandes : projet',choisir('#f-projet','atelier'));
      await mesurer('adresse demandes : retour',()=>page.goBack());
      await mesurer('page Tâches (filtres)',aller('/taches'));
      await mesurer('adresse tâches : projet',choisir('#f-projet','atelier'));
      await mesurer('adresse tâches : terminées',cliquer('#f-terminees'));
      await mesurer('page Finances',aller('/finances'));
      await mesurer('adresse finances : onglet',cliquer('[data-onglet="devis"]'));
      await mesurer('adresse finances : projet',choisir('#f-projet','atelier'));
      await mesurer('page Axes',aller('/projets/atelier/evolutions'));
      const plateformeAxe=await page.$$eval('[data-axe-filtre]',(bs)=>bs.map((b)=>b.dataset.axeFiltre).filter(Boolean)[0]||'').catch(()=>'');
      if(plateformeAxe)await mesurer('adresse axes : plateforme',cliquer(`[data-axe-filtre="${plateformeAxe}"]`));
    }
    else{await mesurer('page Accueil',aller('/'));await mesurer('page Demandes',aller('/demandes'));}
    await mesurer('page Tests (retour)',aller('/tests?projet=atelier'));
    for(const p of ['ios','android','web','']) await mesurer(`filtre ${p||'toutes'} (clic)`,()=>page.click(`[data-plateforme="${p}"]`));
    /* Les onglets de la page Tests d'un projet : un dessin en place, sans squelette ni saut. */
    for(const o of ['automatises','bibliotheque','avis','devis']){await mesurer(`onglet tests ${o}`,aller(`/tests?projet=atelier&onglet=${o}`));
      if(process.env.CAPTURE_REBOND)await page.screenshot({path:`${process.env.CAPTURE_REBOND}/tests-${role==='équipe'?'equipe':'client'}-${o}.png`,fullPage:true});}
    await mesurer('onglet tests humains',aller('/tests?projet=atelier'));
    if(role==='équipe'){
      /* « Tous les projets » porte le tableau des tests, qui a ses propres clés. */
      await mesurer('page Tests (tous les projets)',aller('/tests'));
      await mesurer('page Tâches (retour)',aller('/taches'));
      await mesurer('page Tests (tous, retour)',aller('/tests'));
    }

    /* Les barres de progression se remplissent à l'arrivée et au changement
       de filtre, et restent en place quand la page se redessine à l'identique. */
    const barres=async()=>page.evaluate(()=>[...document.querySelectorAll('.tb-resume .tb-barre')].map(b=>b.classList.contains('tb-barre--anime')));
    await page.click('[data-plateforme="web"]');await pause(200);
    const apresFiltre=await barres();
    verifier(apresFiltre.length===2&&apresFiltre.every(Boolean),'les deux barres se remplissent au changement de filtre',JSON.stringify(apresFiltre));

    console.log('\n  -- ce qui compte');
    const onglets=Object.entries(releves).filter(([n])=>n.startsWith('onglet '));
    verifier(onglets.every(([,r])=>r.peints===1),'un onglet de projet n\'est peint qu\'une fois',onglets.filter(([,r])=>r.peints!==1).map(([n,r])=>`${n}:${r.peints}`).join(' '));
    verifier(onglets.every(([,r])=>!r.squelettePeint),'sans squelette entre deux');
    verifier(onglets.every(([,r])=>r.scroll===0),'sans saut de défilement quand la barre est visible',onglets.filter(([,r])=>r.scroll!==0).map(([n,r])=>`${n}:${r.scroll}`).join(' '));
    if(role==='équipe'){
      const adresses=Object.entries(releves).filter(([n])=>n.startsWith('adresse '));
      verifier(adresses.length>=12,'les filtres dans l adresse sont mesurés',`${adresses.length}`);
      verifier(adresses.every(([,r])=>r.peints===1&&r.contenus===1),'un filtre dans l adresse ne peint la page qu une fois',adresses.filter(([,r])=>r.peints!==1||r.contenus!==1).map(([n,r])=>`${n}:${r.peints}/${r.contenus}`).join(' '));
      verifier(adresses.every(([,r])=>!r.squelette),'sans squelette (la page n est pas remontée)',adresses.filter(([,r])=>r.squelette).map(([n])=>n).join(' '));
    }
    const filtres=Object.entries(releves).filter(([n])=>n.startsWith('filtre '));
    verifier(filtres.every(([,r])=>r.peints===1),'un filtre de plateforme ne peint la page qu\'une fois',filtres.map(([n,r])=>`${n}:${r.peints}`).join(' '));
    verifier(filtres.every(([,r])=>!r.squelettePeint),'et ne repeint pas de squelette');
    const pages=Object.entries(releves).filter(([n])=>n.startsWith('page '));
    verifier(pages.every(([,r])=>r.contenus===1),'un changement de page n\'est peint qu\'une fois (tableau compris)',pages.filter(([,r])=>r.contenus!==1).map(([n,r])=>`${n}:${r.contenus}`).join(' '));
    /* Première visite : la donnée vient du serveur, le squelette a le droit
       d'être peint, mais le contenu une seule fois. Retour : plus de squelette. */
    const retours=pages.filter(([n])=>!(n.startsWith('page Tests')&&!n.includes('retour')));
    verifier(retours.every(([,r])=>!r.squelettePeint),'sans squelette peint quand la donnée est déjà là',retours.filter(([,r])=>r.squelettePeint).map(([n])=>n).join(' '));
    const arrivee=releves['projet (arrivée)'];
    verifier(arrivee&&arrivee.contenus===1,'la première arrivée sur un projet ne peint son contenu qu\'une fois',arrivee&&`${arrivee.contenus}`);
    await ctx.close();
  }
  verifier(!err.some(e=>e.includes('clés encore en route')),'aucun dessin n\'a cessé d\'attendre une clé',err.filter(e=>e.includes('clés encore en route')).join(' ; ').slice(0,400));
  if(err.length)console.log('\n  erreurs :',err.slice(0,8).join('\n    '));
  await nav.close();
  console.log(`\n${soucis.length} ÉCART(S)`);
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
