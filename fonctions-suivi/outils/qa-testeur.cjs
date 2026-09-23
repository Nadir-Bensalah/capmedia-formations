/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'espace testeur à l'épreuve

   Le cloisonnement d'abord : un testeur qui verrait les réponses des
   autres cocherait comme eux. Ça s'appelle l'ancrage, et ça ruine une
   campagne entière sans que rien ne le signale. On vérifie donc qu'il ne
   voit AUCUN autre testeur, et qu'il ne peut atteindre ni les passages
   d'autrui, ni les demandes, ni les devis, ni le vivier.

   Puis ce qui fait la valeur d'un rapport : un échec sans preuve n'est pas
   un rapport, c'est une opinion. Le refus est côté serveur, mais il doit
   se dire AVANT que le testeur ait tout tapé.

   Cette suite attend une campagne EN COURS avec six testeurs inscrits au
   vivier et une affectation. Sans elle, le testeur arrive sur un écran
   vide et tout tombe d'un coup : ce n'est pas une régression.

     firebase emulators:start --config firebase.suivi.json --project capmedia-1f90d
     node fonctions-suivi/outils/semer-suivi.mjs
     node fonctions-suivi/outils/importer-scenarios.mjs atelier <plan.md> --vrai
     (puis semer une campagne en cours avec six testeurs)
     node fonctions-suivi/outils/qa-testeur.cjs
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
  await pause(5000);};
const soucis=[];const ok=m=>console.log('  ok     '+m);
const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));

(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:430,height:900}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,180)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,180));});

  console.log('\n== Le testeur arrive sur son espace');
  await connecter(page,'karim.testeur@essai.test');
  const ou = await page.evaluate(()=>({ url: location.pathname, titre: document.title, h1:(document.querySelector('h1')||{}).innerText||'' }));
  verifier(/tests/.test(ou.url),'il est redirigé vers son espace',ou.url);
  verifier(/Bonjour Karim/.test(ou.h1),'la page le nomme',ou.h1);

  const v = await page.evaluate(()=>({
    scenarios: document.querySelectorAll('.t-scenario').length,
    choix: document.querySelectorAll('.t-choix').length,
    jauge: !!document.querySelector('.testeur-jauge'),
    plateformes: [...document.querySelectorAll('[data-sur]')].map(b=>b.textContent.trim()),
    chapo:(document.querySelector('.chapo')||{}).innerText||'',
    autres: /Sonia|Marc|Ines|Hugo|Leila/.test(document.body.innerText),
  }));
  console.log('    ', v.chapo);
  verifier(v.scenarios===43,'il voit ses 43 scénarios, pas les 173',`${v.scenarios}`);
  verifier(v.choix===v.scenarios*3,'chacun a ses trois boutons',`${v.choix}`);
  verifier(v.jauge,'sa jauge d\'avancement est là');
  verifier(v.plateformes.length===3,'il choisit sur quoi il teste',v.plateformes.join('/'));
  verifier(!v.autres,'il ne voit AUCUN autre testeur');

  console.log('\n== Cocher sans dire sur quoi');
  const premier = await page.$('[data-poser]');
  await premier.click(); await pause(800);
  const t1 = await page.evaluate(()=>((document.querySelector('.toasts')||{}).innerText||'').trim());
  verifier(/sur quoi/i.test(t1),'on lui demande d\'abord sa plateforme',t1||'(rien)');
  await pause(1000);

  console.log('\n== Un OK');
  await page.click('[data-sur="ios"]'); await pause(900);
  const ref = await page.evaluate(()=>(document.querySelector('[data-poser]')||{}).dataset.poser);
  await page.click(`[data-poser="${ref}"][data-resultat="ok"]`); await pause(2200);
  const enBase = await lire(`projets/atelier/campagnes/c-oct/passages?pageSize=100`);
  const docs = ((enBase&&enBase.documents)||[]);
  verifier(docs.length===1,'le passage est enregistré',`${docs.length}`);
  if (docs.length) {
    const f = docs[0].fields;
    verifier((f.resultat||{}).stringValue==='ok','avec le bon résultat');
    verifier((f.plateforme||{}).stringValue==='ios','et la bonne plateforme');
    const ctx = ((f.contexte||{}).mapValue||{}).fields||{};
    verifier(Object.keys(ctx).length>=4,'le contexte de l\'appareil est relevé',Object.keys(ctx).join(','));
    verifier(docs[0].name.includes('__'),'l\'identifiant porte son uid');
  }

  console.log('\n== Un KO sans preuve');
  const ref2 = await page.evaluate(()=>{
    const l=[...document.querySelectorAll('[data-poser][data-resultat="ko"]')];
    return l.length?l[0].dataset.poser:'';
  });
  await page.click(`[data-poser="${ref2}"][data-resultat="ko"]`); await pause(1300);
  verifier(await page.evaluate(()=>!!document.querySelector('.feuille')),'une feuille demande ce qui s\'est passé');
  await page.fill('#t-quoi','Rien ne se passe quand j\'appuie sur Valider.');
  await page.click('[data-valider]'); await pause(900);
  const t2 = await page.evaluate(()=>((document.querySelector('.toasts')||{}).innerText||'').trim());
  verifier(/preuve/i.test(t2),'un échec sans preuve est refusé',t2||'(rien)');
  verifier(await page.evaluate(()=>!!document.querySelector('.feuille')),'et la feuille reste ouverte');
  await page.keyboard.press('Escape'); await pause(700);

  console.log('\n== Ce qu\'il ne peut pas atteindre');
  const interdit = await page.evaluate(async () => {
    const r = {};
    try { const m = await import('/suivi/assets/js/noyau.js');
      try { await m.getDocs(m.collection(m.bdd,'projets','atelier','campagnes','c-oct','passages')); r.tous='LU'; }
      catch(e){ r.tous='refusé'; }
      try { await m.getDocs(m.collection(m.bdd,'tickets')); r.demandes='LU'; } catch(e){ r.demandes='refusé'; }
      try { await m.getDocs(m.collection(m.bdd,'documents')); r.devis='LU'; } catch(e){ r.devis='refusé'; }
      try { await m.getDocs(m.collection(m.bdd,'testeurs')); r.vivier='LU'; } catch(e){ r.vivier='refusé'; }
    } catch(e){ r.erreur=e.message.slice(0,90); }
    return r;
  });
  verifier(interdit.tous==='refusé','il ne lit pas les passages des autres',interdit.tous);
  verifier(interdit.demandes==='refusé','ni les demandes du projet',interdit.demandes);
  verifier(interdit.devis==='refusé','ni les devis',interdit.devis);
  verifier(interdit.vivier==='refusé','ni la liste des testeurs',interdit.vivier);

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close();
  process.exit(soucis.length?1:0);
})();
