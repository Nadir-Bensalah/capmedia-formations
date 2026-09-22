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
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=100');const p=((j&&j.documents)||[]).filter(d=>{const a=((((d.fields||{}).a||{}).arrayValue)||{}).values||[];return a.some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e);});if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
const connecter=async(page,email)=>{await vider('connexions');await vider('connexionsIp');
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
  await page.evaluate(()=>{ try{localStorage.setItem('suivi:cle-admin','cle-essai-locale');}catch(e){} });
  await page.reload({waitUntil:'domcontentloaded'}); await pause(3500);

  /* Le compte réel, lu en base. Coder 48 en dur ferait tomber la suite au
     premier parcours ajouté, pour une raison qui n'est pas un défaut. */
  const tous = ((await lire('projets/atelier/parcours?pageSize=400'))||{}).documents||[];
  const nb = tous.length;
  const refsCouvertes = new Set();
  tous.forEach(d=>{((((d.fields||{}).scenarios||{}).arrayValue||{}).values||[]).forEach(v=>refsCouvertes.add(v.stringValue));});
  console.log(`    (${nb} parcours en base, ${refsCouvertes.size} scénarios couverts)`);

  console.log('\n== Les parcours dans un projet');
  await aller(page,'/tests?projet=atelier','.chiffres-tests','Tests');
  await pause(1500);
  const v = await page.evaluate(()=>({
    sections:[...document.querySelectorAll('.section-tete h2')].map(h=>h.innerText.trim()),
    texte: document.body.innerText,
    bouton: !!document.querySelector('[data-nouveau-parcours]'),
  }));
  verifier(v.sections.includes('Parcours automatisés'),'la section existe',v.sections.join('/'));
  verifier(v.bouton,'le bouton de création est là');
  verifier(new RegExp(`${nb} parcours`).test(v.texte),`les ${nb} sont annoncés`);
  verifier(new RegExp(`${refsCouvertes.size} scénarios`).test(v.texte),`avec les ${refsCouvertes.size} scénarios couverts`);
  verifier(/éprouvés par mutation/.test(v.texte),'et le compte des éprouvés');
  verifier(/remis en défaut/.test(v.texte),'la page dit pourquoi ça compte');
  const m = v.texte.match(/(\d+) parcours rejoués[^.]*/);
  if (m) console.log('    ', m[0]);

  console.log('\n== Ce qui ne va pas remonte');
  await aller(page,'/tests',null,'Tests');
  await pause(1600);
  const g = await page.evaluate(()=>({
    haut:(document.querySelector('.section')||{}).innerText||'',
    sections:[...document.querySelectorAll('.section-tete h2')].map(h=>h.innerText.trim()),
  }));
  verifier(/R-04/.test(g.haut),'le parcours rouge est en haut',g.haut.slice(0,80));
  verifier(/C-02/.test(g.haut),'l instable aussi');
  verifier(/une fois sur trois/.test(g.haut),'avec sa note');
  verifier(g.sections.includes('Parcours automatisés'),'et la section globale existe');

  console.log('\n== Le catalogue se replie');
  await aller(page,'/tests?projet=atelier','.chiffres-tests','Tests');
  await pause(1500);
  const r1 = await page.evaluate(()=>{
    const b=document.querySelector('#catalogue-parcours');
    return { existe:!!b, replie: b?b.hidden:null,
      bouton:(document.querySelector('[data-plier-parcours]')||{}).innerText||'',
      dehors: document.querySelectorAll('.section .liste .ligne').length };
  });
  verifier(r1.existe,'le catalogue existe');
  verifier(r1.replie===true,'il est replié au départ','il est déplié : 144 lignes au-dessus du vivier');
  verifier(new RegExp(`Voir les ${nb} parcours`).test(r1.bouton),`le bouton annonce les ${nb}`,r1.bouton);

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

  console.log('\n== En créer un');
  await aller(page,'/tests?projet=atelier','.chiffres-tests','Tests');
  await pause(1400);
  const avant = ((await lire('projets/atelier/parcours?pageSize=400'))||{}).documents||[];
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
  verifier(f.scenarios>100,`les scénarios à couvrir (${f.scenarios})`);
  verifier(f.mutation,'la case « éprouvé par mutation »');

  await page.fill('#ed-ref','X-99');
  await page.fill('#ed-titre','Un parcours écrit à la main');
  await page.selectOption('#ed-outil','playwright');
  await page.click('[data-enregistrer],button[type="submit"][form="ed-forme"]'); await pause(2600);
  const apres = ((await lire('projets/atelier/parcours?pageSize=400'))||{}).documents||[];
  verifier(apres.length===avant.length+1,`il est créé (${avant.length} puis ${apres.length})`);
  const neuf = await lire('projets/atelier/parcours/X-99');
  verifier(!!neuf,'sous sa référence');
  if (neuf) verifier((neuf.fields.outil||{}).stringValue==='playwright','avec le bon outil');
  verifier(await page.evaluate(()=>/X-99/.test(document.body.innerText)),'et visible sans recharger');

  console.log('\n== Le client les voit, sans y toucher');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests?projet=atelier',null,'Tests');
  await pause(1500);
  /* Le catalogue est replié pour lui aussi : chercher une référence dans
     le texte visible ne prouverait rien. On déplie, comme il le ferait. */
  const c = await cl.evaluate(()=>({
    voit:/Parcours automatisés/.test(document.body.innerText),
    annonce:/\d+ parcours rejoués/.test(document.body.innerText),
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
