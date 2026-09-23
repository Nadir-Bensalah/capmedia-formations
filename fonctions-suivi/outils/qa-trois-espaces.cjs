/* ==========================================================================
   CAPMEDIA CLIENT HUB · les trois espaces, et leurs trois portes

   « app », « admin » et « tests » ne disaient rien de ce qu'on allait
   trouver. Les pages s'appellent désormais hub, cockpit et testeur, et
   chaque espace annonce son nom.

   Ce banc garde la chose la plus fragile du renommage : une redirection
   cassée enferme tout le monde dehors, et personne ne s'en aperçoit avant
   qu'un client appelle. Il vérifie donc que CHAQUE rôle arrive à SA page,
   et qu'aucune adresse morte ne traîne dans le code.

     (émulateurs avec les fonctions, semis, un testeur inscrit)
     node fonctions-suivi/outils/qa-trois-espaces.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const CLE=process.env.ADMIN_CLE_ESSAI||'cle-essai-locale';
const RACINE=`${__dirname}/../../agence/suivi`;
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const champ=(d,k)=>(((d||{}).fields||{})[k]||{});
const str=(d,k)=>champ(d,k).stringValue||'';
const soucis=[];const ok=m=>console.log('  ok     '+m);const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const attendre=async(fn,n=30)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(600);}return null;};
const serveur=async(action,corps)=>{
  const r=await fetch(`http://127.0.0.1:5001/${PROJET}/europe-west1/suiviAdmin`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cle:CLE,action,...corps})});
  return { code:r.status, texte:await r.text() };
};
const codeDe=(email)=>attendre(async()=>{
  const j=await lire('envois?pageSize=100');
  const p=((j&&j.documents)||[]).filter(d=>str(d,'modele')==='code'
    && (((champ(d,'a').arrayValue||{}).values)||[]).some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===email));
  if(!p.length) return null;
  p.sort((x,y)=>new Date(str(y,'cree')||((y.fields.cree||{}).timestampValue)||0)-new Date(str(x,'cree')||((x.fields.cree||{}).timestampValue)||0));
  return ((((champ(p[0],'variables').mapValue||{}).fields)||{}).code||{}).stringValue||null;
});

/* Une porte franchie : on saisit l'adresse, le code, et on regarde OÙ l'on
   atterrit. C'est la seule question qui compte ici. */
const entrer=async(nav,email)=>{
  const page=await (await nav.newContext({viewport:{width:1300,height:1000}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push(e.message.slice(0,140)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,140));});
  await vider('envois');await vider('connexions');await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
  await page.fill('#email',email);await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
  await page.fill('#code',await codeDe(email)||'');
  await pause(7000);
  const vu=await page.evaluate(()=>({
    chemin:location.pathname, titre:document.title,
    marque:(document.querySelector('.lat-marque .service')||document.querySelector('.testeur-tete .surtitre')||{}).innerText||'',
    corps:(document.body.innerText||'').slice(0,160),
  }));
  return { page, err, ...vu };
};

(async()=>{
  console.log('\n== 1 · Les trois pages existent, les anciennes ont disparu');
  {
    for (const f of ['hub.html','cockpit.html','testeur.html','index.html']) {
      verifier(fs.existsSync(`${RACINE}/${f}`), `${f} est là`);
    }
    for (const f of ['app.html','admin.html','tests.html']) {
      verifier(!fs.existsSync(`${RACINE}/${f}`), `${f} n'existe plus`);
    }
    /* Une adresse morte dans le code enferme tout le monde dehors, et cela
       ne se voit qu'au moment où quelqu'un se connecte. */
    const fichiers=[];
    const parcourir=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){
      if(e.name==='node_modules') continue;
      const p=`${d}/${e.name}`;
      if(e.isDirectory()) parcourir(p); else if(/\.(js|html)$/.test(e.name)) fichiers.push(p);
    }};
    parcourir(RACINE);
    const mortes=[];
    for (const f of fichiers) {
      const s=fs.readFileSync(f,'utf8');
      for (const m of s.matchAll(/location\.replace\(\s*[`'"]\.\/(\w+)/g)) {
        if(!['hub','cockpit','testeur','index'].includes(m[1])) mortes.push(`${f.split('/').pop()} -> ./${m[1]}`);
      }
    }
    verifier(mortes.length===0,`aucune redirection vers une page disparue (${fichiers.length} fichiers lus)`,mortes.join(', '));

    /* Les courriels aussi portent des adresses : un lien mort dans une
       lettre envoie le client sur une page d'erreur. */
    const hub=fs.readFileSync(`${__dirname}/../hub.js`,'utf8');
    const suivi=fs.readFileSync(`${__dirname}/../suivi.js`,'utf8');
    verifier(!/BASE\}app\b|BASE\}admin\b/.test(hub+suivi),"les lettres ne pointent plus vers app ni admin");
    verifier(/BASE\}hub#/.test(hub)&&/BASE\}cockpit#/.test(hub),'elles pointent vers hub et cockpit');
  }

  console.log('\n== 2 · Chaque rôle arrive chez lui');
  {
    /* Le testeur doit exister comme COMPTE, pas seulement comme fiche : le
       semis pose la fiche, l'inscription crée le compte. */
    const adresse='karim.essai@exemple.test';
    const j=await lire('testeurs?pageSize=100');
    const deja=((j&&j.documents)||[]).find(d=>str(d,'email')===adresse);
    const r=await serveur('inscrireTesteur',{email:adresse,prenom:'Karim',plateformes:['android','web'],projets:['atelier'],profil:{sexe:'homme',age:'25-34',fonction:'Infirmier'}});
    let tid=''; try{tid=JSON.parse(r.texte).uid;}catch(e){}
    verifier(!!tid,'le testeur a un compte',r.texte.slice(0,70));
    void deja;

    /* Sans campagne, le testeur voit « Aucune campagne en cours » et son
       en-tête complet n'existe pas : on l'affecte, sinon le contrôle
       jugerait un écran vide au lieu de l'écran réel. */
    if (tid) {
      await fetch(bdd(`projets/atelier/campagnes/qa-avis?updateMask.fieldPaths=testeurs&updateMask.fieldPaths=affectation`),{
        method:'PATCH',headers:{...prop,'Content-Type':'application/json'},
        body:JSON.stringify({fields:{
          testeurs:{arrayValue:{values:[{stringValue:tid}]}},
          affectation:{mapValue:{fields:{[tid]:{arrayValue:{values:[{stringValue:'DI-06'},{stringValue:'DI-07'}]}}}}},
        }})});
      await pause(1200);
    }

    const nav=await chromium.launch();
    const cas=[
      ['agent.essai@exemple.test','/suivi/cockpit','Cockpit',"l'équipe"],
      ['camille.essai@exemple.test','/suivi/hub','Hub','le client'],
      [adresse,'/suivi/testeur','Capmedia Tests','le testeur'],
    ];
    for (const [email,chemin,marque,qui] of cas) {
      const v=await entrer(nav,email);
      verifier(v.chemin===chemin,`${qui} arrive sur ${chemin}`,`atterri sur ${v.chemin}`);
      verifier((v.marque||'').toUpperCase().includes(marque.toUpperCase()),`et son espace s'annonce « ${marque} »`,`lu : « ${v.marque} »`);
      verifier((v.err||[]).length===0,`sans erreur de page pour ${qui}`,(v.err||[]).join(' | '));
      await v.page.context().close();
    }
    await nav.close();
  }

  console.log("\n== 3 · Chacun va CHEZ LUI, même en tapant l'adresse d'un autre");
  {
    /* Le parcours qui a échoué en production : taper l'adresse de l'espace
       testeur, se connecter, et se retrouver sur le hub. La page renvoie
       vers la porte avec « retour », et ce retour passait AVANT le contrôle
       du rôle : on atterrissait donc là où on avait tapé, puis la page
       refusait et redirigeait ailleurs. */
    const nav=await chromium.launch();
    const essais=[
      ['camille.essai@exemple.test','/suivi/testeur','/suivi/hub','le client qui tape l adresse du testeur'],
      ['camille.essai@exemple.test','/suivi/cockpit','/suivi/hub','le client qui tape l adresse du cockpit'],
      ['agent.essai@exemple.test','/suivi/hub','/suivi/cockpit',"l équipe qui tape l adresse du client"],
      ['karim.essai@exemple.test','/suivi/hub','/suivi/testeur','le testeur qui tape l adresse du client'],
    ];
    for (const [email,tape,attendu,qui] of essais) {
      const page=await (await nav.newContext({viewport:{width:1200,height:900}})).newPage();
      await vider('envois');await vider('connexions');await vider('connexionsIp');
      /* On passe par la page demandée : elle renvoie vers la porte avec
         « retour », exactement comme dans un navigateur. */
      await page.goto(`${SITE}${tape}?emul`,{waitUntil:'domcontentloaded'});
      await page.waitForSelector('#forme:not(.masque)',{timeout:25000}).catch(()=>{});
      await page.fill('#email',email);await page.click('#envoyer');
      await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
      await page.fill('#code',await codeDe(email)||'');
      await pause(7000);
      const ou=await page.evaluate(()=>location.pathname);
      verifier(ou===attendu,`${qui} atterrit sur ${attendu}`,`atterri sur ${ou}`);
      await page.context().close();
    }
    await nav.close();
  }

  console.log("\n== 4 · Le jeton est relu, pas pris en cache");
  {
    const src=fs.readFileSync(`${RACINE}/assets/js/noyau.js`,'utf8');
    verifier(/getIdTokenResult\(true\)/.test(src),
      "la session force la relecture du jeton : sinon un testeur tout juste inscrit arrive chez le client");
  }

  console.log('\n== 5 · La porte ne dit pas « espace client » à tout le monde');
  {
    const src=fs.readFileSync(`${RACINE}/index.html`,'utf8');
    verifier(!/<p class="surtitre"[^>]*>Espace client</.test(src),
      "la porte n'annonce plus « Espace client » alors qu'elle sert aussi aux testeurs");
    verifier(/id="surtitre-porte"/.test(src),'son surtitre est neutre et nommé');
  }

  /* Ménage : l'inscription d'essai laissait une SECONDE fiche à côté de
     celle du semis, et les suites voisines qui numérotent les testeurs
     comptaient alors trois personnes au lieu de deux. Une passe ne doit
     rien laisser derrière elle. */
  {
    const j=await lire('testeurs?pageSize=100');
    for (const d of ((j&&j.documents)||[])) {
      const id=d.name.split('/').pop();
      if (str(d,'email')==='karim.essai@exemple.test' && !id.startsWith('uid-')) {
        await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});
      }
    }
  }

  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-trois-espaces : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
