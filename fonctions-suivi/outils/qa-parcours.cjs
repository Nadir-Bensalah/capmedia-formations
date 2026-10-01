require('./lib/garde-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · les parcours automatisés à l'épreuve

   Un parcours ne remplace pas un testeur, il remplace la partie
   répétitive de son travail : celle qui consiste à revérifier que ce qui
   marchait marche encore.

   Ce que la page doit dire sans qu'on le cherche : combien de parcours ne
   sont PAS encore éprouvés par mutation. Un parcours au vert ne prouve
   rien tant qu'on n'a pas remis le défaut d'origine et vu le parcours
   tomber. Une page qui afficherait seulement « tous verts »
   donnerait exactement la fausse assurance qu'elle prétend retirer.

   Un parcours instable remonte au même niveau qu'un rouge : le rouge dit
   qu'il y a un défaut, l'instable n'apprend rien, et on finit par
   l'ignorer.

   DÉPENDANCE DE DONNÉES (posée par banc-suites.sh) : un passage de robot
   (semer-robot-banc.mjs : R-04 rouge, C-02 instable et sa note), et les
   scénarios du projet réel sur le banc (importer-scenarios.mjs puis
   semer-trous.mjs), pas seulement le
   jeu de démonstration de semer-suivi.mjs, qui n'en pose que quelques
   dizaines. Sans eux, la feuille d'un parcours n'offre qu'une poignée de
   scénarios à couvrir et le contrôle tombe pour une raison qui n'est pas
   un défaut. Et semer-suivi.mjs REMET ce jeu de démonstration : il faut
   donc relancer les semis de tests après lui, pas avant.

   Cette suite attend EXACTEMENT les parcours du semis, dans leur état
   d'origine. Elle ne code pas leur nombre en dur : la liste grandit, et
   une suite qui exige quarante-huit tomberait à chaque ajout pour une
   raison qui n'a rien à voir avec le produit. Elle lit le compte réel en
   base et vérifie que la page annonce le même.

   En revanche il faut VIDER la collection avant le semis : un semis
   « merge » laisse derrière lui ce qu'un précédent a posé, et le compte
   grandit alors d'une exécution à l'autre.

     (émulateurs, semis, campagne, puis semer-parcours.mjs sur une
      collection vidée)
     node fonctions-suivi/outils/qa-parcours.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
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
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,180)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,180));});

  /* Ce que la suite a pu laisser derrière elle : sans ce nettoyage, le
     compte des parcours grandit d'une exécution à l'autre et les contrôles
     tombent pour une raison qui n'a rien à voir avec le produit. */
  await fetch(bdd('projets/atelier/parcours/X-99'),{method:'DELETE',headers:prop}).catch(()=>{});

  await connecter(page,'agent.essai@exemple.test');
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.lat a',{timeout:60000}).catch(()=>{}); await pause(1200);

  /* Le compte réel, lu en base. Coder 48 en dur ferait tomber la suite au
     premier parcours ajouté, pour une raison qui n'est pas un défaut. */
  /* Firestore pagine sa réponse REST quelle que soit la pageSize demandée.
     Compter sur une seule réponse donnait 150 au lieu de 288, et la suite
     accusait la page d'un défaut qui était le sien. On suit le jeton. */
  const toutesPages = async (col) => {
    const out = []; let jeton = '';
    for (let i = 0; i < 20; i += 1) {
      const j = await lire(`${col}?pageSize=300${jeton ? `&pageToken=${jeton}` : ''}`);
      (((j || {}).documents) || []).forEach((d) => out.push(d));
      jeton = (j || {}).nextPageToken || '';
      if (!jeton) break;
    }
    return out;
  };
  const tous = await toutesPages('projets/atelier/parcours');
  const nb = tous.length;
  const refsCouvertes = new Set();
  tous.forEach(d=>{((((d.fields||{}).scenarios||{}).arrayValue||{}).values||[]).forEach(v=>refsCouvertes.add(v.stringValue));});
  console.log(`    (${nb} parcours en base, ${refsCouvertes.size} scénarios couverts)`);

  console.log('\n== Les parcours dans un projet');
  await aller(page,'/tests?projet=atelier&onglet=automatises','#onglets-tests','Tests');
  await pause(1500);
  const v = await page.evaluate(()=>({
    sections:[...document.querySelectorAll('.section-tete h2')].map(h=>h.innerText.trim()),
    texte: document.body.innerText,
    bouton: !!document.querySelector('[data-nouveau-parcours]'),
  }));
  verifier(v.sections.includes('Robots qui utilisent l\'app'),'la section existe',v.sections.join('/'));
  verifier(v.bouton,'le bouton de création est là');
  verifier(new RegExp(`${nb} robots? ouvren?t l'app`).test(v.texte),`les ${nb} sont annoncés`);
  verifier(new RegExp(`Ils font ${refsCouvertes.size} vérifications? de la liste`).test(v.texte),`avec les ${refsCouvertes.size} scénarios couverts`);
  verifier(/\d+ \/ \d+\s+avec contre-épreuve/.test(v.texte),'et le compte des éprouvés (avec contre-épreuve)');
  verifier(/contre-épreuve à faire pour \d+ robots?/.test(v.texte) && /on casse l'app exprès/.test(v.texte),'la page dit pourquoi ça compte');

  /* L'état des parcours est une FORME, pas quatre tuiles : une jauge dont
     les parts sont proportionnelles, et une référence en chasse fixe sur
     chaque ligne. Sans ces deux choses, la section redevient un bloc de
     texte gris que l'œil ne distingue plus de ses voisins. */
  const forme = await page.evaluate(()=>{
    const j=document.querySelector('#parcours .jauge');
    const parts=j?[...j.querySelectorAll('i')]:[];
    const somme=parts.reduce((n,i)=>n+parseFloat(i.style.flexBasis||'0'),0);
    return { jauge:!!j, parts:parts.length, somme:Math.round(somme),
      legende:document.querySelectorAll('#parcours .jauge-legende .puce').length,
      refs:document.querySelectorAll('#parcours .ligne .ref').length,
      etage:!!document.querySelector('#etage-machine .etage-sur') };
  });
  verifier(forme.jauge,'la jauge est là');
  verifier(forme.parts>0 && forme.somme===100,`ses parts font cent pour cent (${forme.somme})`);
  verifier(forme.legende===5,'la légende porte les cinq états',`${forme.legende}`);
  verifier(forme.refs>0,'les références sont en chasse fixe');
  verifier(forme.etage,'dans l étage des tests automatisés');

  /* Le « i » du titre ouvre une explication en langage courant. Elle
     doit dire ce que veut dire « à écrire », parce que c'est la question
     que la page pose à quiconque la découvre. */
  await page.click('#parcours [data-info]'); await pause(900);
  const expl = await page.evaluate(()=>{const v=document.querySelector('.voile');return v?v.innerText:'';});
  verifier(/À écrire/.test(expl) && /robot|programme|machine/i.test(expl),'le « i » explique les parcours et « à écrire »',expl.slice(0,80));
  verifier(!/hasOnly|Firestore|Maestro/.test(expl),'sans jargon');
  await page.keyboard.press('Escape'); await pause(600);
  verifier(await page.evaluate(()=>!document.querySelector('.voile')),'et se referme');
  const m = v.texte.match(/(\d+) robots? ouvren?t l'app[^.]*/);
  if (m) console.log('    ', m[0]);

  console.log('\n== Bugs à corriger d\'urgence : replié, il compte ses lignes');
  const erreursPage=[]; page.on('pageerror',(e)=>erreursPage.push(String(e.message||e)));
  await aller(page,'/tests',null,'Tests');
  await page.waitForSelector('#bugs-urgents, .section .calme',{timeout:15000}).catch(()=>{});
  await pause(800);
  const b0 = await page.evaluate(()=>{
    const l=document.querySelector('#liste-bugs'); const b=document.querySelector('[data-plier-bugs]');
    return { existe:!!l, replie:l?l.hidden:null, lignes:l?l.querySelectorAll('.ligne').length:0, bouton:b?b.innerText:'',
      titre:((document.querySelector('#bugs-urgents h2')||{}).innerText||'').trim() };
  });
  /* Sans aucun bug à signaler, le bloc garde son titre et dit « Rien à signaler » : rien à replier. */
  const calme = await page.evaluate(()=>!!document.querySelector('.section .calme'));
  if(calme && !b0.existe){ console.log('    (aucun bug à signaler sur ce banc : les contrôles du repli sont sautés)'); }
  else {
  verifier(erreursPage.length===0,'aucune erreur dans la page',erreursPage.slice(0,2).join(' | '));
  verifier(b0.existe,'le bloc existe');
  verifier(/^Bugs à corriger d'urgence/.test(b0.titre),'il s appelle « Bugs à corriger d urgence »',b0.titre);
  verifier(b0.replie===true,'il est replié au départ');
  verifier(new RegExp(`Voir les ${b0.lignes} lignes?`).test(b0.bouton) && b0.lignes>0,`replié, il annonce ses ${b0.lignes} lignes`,b0.bouton);
  await page.click('[data-plier-bugs]'); await pause(600);
  verifier(await page.evaluate(()=>!document.querySelector('#liste-bugs').hidden),'un clic le déplie');
  verifier(/Replier/.test(await page.evaluate(()=>document.querySelector('[data-plier-bugs]').innerText)),'le bouton dit Replier');
  await page.reload(); await pause(2500);
  verifier(await page.evaluate(()=>{const l=document.querySelector('#liste-bugs');return !!l&&!l.hidden;}),'le choix tient après un rechargement');
  }

  console.log('\n== Ce qui ne va pas remonte');
  const g = await page.evaluate(()=>({
    haut:(document.querySelector('.section')||{}).innerText||'',
    sections:[...document.querySelectorAll('.section-tete h2')].map(h=>h.innerText.trim()),
  }));
  verifier(/R-04/.test(g.haut),'le parcours rouge est en haut',g.haut.slice(0,80));
  verifier(/C-02/.test(g.haut),'l instable aussi');
  verifier(/une fois sur trois/.test(g.haut),'avec sa note');
  verifier(g.sections.includes('Robots qui utilisent l\'app'),'et la section globale existe');

  console.log('\n== Le catalogue se replie');
  await aller(page,'/tests?projet=atelier&onglet=automatises','#onglets-tests','Tests');
  await pause(1500);
  const r1 = await page.evaluate(()=>{
    const b=document.querySelector('#catalogue-parcours');
    return { existe:!!b, replie: b?b.hidden:null,
      bouton:(document.querySelector('[data-plier-parcours]')||{}).innerText||'',
      dehors: document.querySelectorAll('.section .liste .ligne').length };
  });
  verifier(r1.existe,'le catalogue existe');
  verifier(r1.replie===true,'il est replié au départ','il est déplié : 144 lignes au-dessus du vivier');
  verifier(new RegExp(`Voir les ${nb} robots?`).test(r1.bouton),`le bouton annonce les ${nb}`,r1.bouton);

  await page.click('[data-plier-parcours]'); await pause(900);
  const r2 = await page.evaluate(()=>{
    const b=document.querySelector('#catalogue-parcours');
    return { replie:b.hidden, lignes:b.querySelectorAll('.ligne').length,
      blocs:[...b.querySelectorAll('.bloc-tete')].map(h=>h.innerText.trim().replace(/\s+/g,' ')),
      bouton:(document.querySelector('[data-plier-parcours]')||{}).innerText||'' };
  });
  verifier(r2.replie===false,'un clic le déplie');
  verifier(r2.lignes===nb,`les ${nb} parcours sont là`,`${r2.lignes} lignes`);
  verifier(r2.blocs.length>=3,'groupés par outil',r2.blocs.join(' / '));
  verifier(/Replier/.test(r2.bouton),'le bouton dit Replier',r2.bouton);

  /* Ce qui est rouge ou instable ne doit PAS être enfermé dans le repli :
     c'est justement ce qu'on veut voir sans cliquer. */
  const dehors = await page.evaluate(()=>{
    const b=document.querySelector('#catalogue-parcours');
    return [...document.querySelectorAll('.section .liste .ligne')]
      .filter(l=>!b.contains(l)).map(l=>l.innerText.split('\n')[0].trim());
  });
  verifier(dehors.some(t=>/R-04/.test(t)),'le rouge reste hors du repli',dehors.join(' | ').slice(0,100));
  verifier(dehors.some(t=>/C-02/.test(t)),'l instable aussi');

  await page.click('[data-plier-parcours]'); await pause(800);
  verifier(await page.evaluate(()=>document.querySelector('#catalogue-parcours').hidden)===true,'un second clic le replie');

  console.log('\n== Le filtre de plateforme filtre vraiment');
  const lirePlat = async (plat) => {
    await aller(page,`/tests?projet=atelier&onglet=automatises${plat?`&plateforme=${plat}`:''}`,'#onglets-tests','Tests');
    await pause(1500);
    return page.evaluate(()=>{
      const cat=document.querySelector('#catalogue-parcours');
      const lignes=cat?[...cat.querySelectorAll('.ligne')].map(l=>((l.querySelector('.ligne-sous')||{}).textContent||'').replace(/\s+/g,' ')):[];
      const meta=[...document.querySelectorAll('.tb-ligne-meta')].map(x=>x.innerText);
      return { lignes, machine:(meta[1]||'').match(/réussis? sur (\d+)/)?.[1]||'' };
    });
  };
  const toutes = await lirePlat('');
  const web = await lirePlat('web');
  const ios = await lirePlat('ios');
  /* La ligne sous le titre dit « Outil · iOS, Android · 2 scénarios » : on lit le morceau des plateformes. */
  const plats = (t) => (t.split(' · ').find((x)=>/^(iOS|Android|Web)(, (iOS|Android|Web))*$/.test(x.trim()))||'');
  verifier(web.lignes.length>0 && web.lignes.every(t=>!plats(t)||/Web/.test(plats(t))),'sur Web, aucun parcours seulement iPhone ou Android',web.lignes.filter(t=>plats(t)&&!/Web/.test(plats(t))).slice(0,2).join(' | '));
  verifier(ios.lignes.every(t=>!plats(t)||/iOS/.test(plats(t))),'sur iOS, aucun parcours seulement Web ou Android');
  verifier(web.lignes.length+ios.lignes.length>toutes.lignes.length || web.lignes.length<toutes.lignes.length,'le filtre change bien la liste',`${toutes.lignes.length} / web ${web.lignes.length} / ios ${ios.lignes.length}`);
  verifier(Number(web.machine)<=Number(toutes.machine) && (Number(web.machine)<Number(toutes.machine) || web.lignes.length===toutes.lignes.length),'l avancement des tests automatisés suit le filtre',`${toutes.machine} → web ${web.machine}`);

  console.log('\n== En créer un');
  await aller(page,'/tests?projet=atelier&onglet=automatises','#onglets-tests','Tests');
  await pause(1400);
  const avant = await toutesPages('projets/atelier/parcours');
  await page.click('[data-nouveau-parcours]'); await pause(1200);
  const f = await page.evaluate(()=>({
    feuille:!!document.querySelector('.feuille'),
    outils:[...document.querySelectorAll('#ed-outil option')].map(o=>o.textContent.trim()),
    etats:[...document.querySelectorAll('#ed-etat option')].map(o=>o.textContent.trim()),
    scenarios:document.querySelectorAll('#ed-scenarios option').length,
    mutation:!!document.querySelector('[name="mutation"]'),
  }));
  verifier(f.feuille,'la feuille s ouvre');
  verifier(f.outils.length===4,'les quatre outils',f.outils.join('/'));
  verifier(f.etats.length===6,'les six états',f.etats.join('/'));
  verifier(f.scenarios>=200,`les scénarios à couvrir (${f.scenarios})`);
  verifier(f.mutation,'la case de la contre-épreuve');

  await page.fill('#ed-ref','X-99');
  await page.fill('#ed-titre','Un parcours écrit à la main');
  await page.selectOption('#ed-outil','playwright');
  await page.click('[data-enregistrer],button[type="submit"][form="ed-forme"]'); await pause(2600);
  const apres = await toutesPages('projets/atelier/parcours');
  verifier(apres.length===avant.length+1,`il est créé (${avant.length} puis ${apres.length})`);
  const neuf = await lire('projets/atelier/parcours/X-99');
  verifier(!!neuf,'sous sa référence');
  if (neuf) verifier((neuf.fields.outil||{}).stringValue==='playwright','avec le bon outil');
  verifier(await page.evaluate(()=>/X-99/.test(document.body.innerText)),'et visible sans recharger');

  console.log('\n== Le client les voit, sans y toucher');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests?projet=atelier&onglet=automatises',null,'Tests');
  await pause(1500);
  /* Le catalogue est replié pour lui aussi : chercher une référence dans
     le texte visible ne prouverait rien. On déplie, comme il le ferait. */
  const c = await cl.evaluate(()=>({
    voit:/Robots qui utilisent l'app/.test(document.body.innerText),
    annonce:/\d+ robots? ouvren?t l'app/.test(document.body.innerText),
    replie:(document.querySelector('#catalogue-parcours')||{}).hidden,
    creer:document.querySelectorAll('[data-nouveau-parcours]').length,
    editer:document.querySelectorAll('[data-editer-parcours]').length,
  }));
  verifier(c.voit,'il voit la section');
  /* Le compte annoncé, pas un nombre en dur : la suite vient d'en créer
     un, et le total n'est donc plus celui du semis. */
  verifier(c.annonce,'avec le compte annoncé');
  verifier(c.replie===true,'le catalogue lui est replié aussi');
  await cl.click('[data-plier-parcours]'); await pause(900);
  const c2 = await cl.evaluate(()=>({
    lignes:document.querySelectorAll('#catalogue-parcours .ligne').length,
    refs:/R-01/.test(document.body.innerText),
    editer:document.querySelectorAll('[data-editer-parcours]').length,
  }));
  verifier(c2.refs,'et les parcours quand il déplie');
  verifier(c2.lignes>100,`il les voit tous (${c2.lignes})`);
  verifier(c2.editer===0,'sans bouton de modification dans le catalogue');
  verifier(c.creer===0,'sans pouvoir en créer');
  verifier(c.editer===0,'ni en modifier');

  await fetch(bdd('projets/atelier/parcours/X-99'),{method:'DELETE',headers:prop}).catch(()=>{});

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
