/* ==========================================================================
   CAPMEDIA CLIENT HUB · les huit défauts qui cassaient

   Un banc pour le lot 1 de l'audit du 23 septembre. Chaque contrôle
   correspond à un défaut constaté, et tombe si le défaut revient.

   Les quatre premiers vivent côté serveur et se vérifient en base ; les
   quatre suivants vivent à l'écran et se vérifient dans le navigateur.

     (émulateurs avec les fonctions, semis, scénarios importés)
     node fonctions-suivi/outils/qa-lot1.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const poser=async(chemin,fields)=>fetch(bdd(chemin),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields})});
const S=(v)=>({stringValue:String(v)}), B=(v)=>({booleanValue:v}), L=(a)=>({arrayValue:{values:a}}), M=(f)=>({mapValue:{fields:f}}), T=(d)=>({timestampValue:d.toISOString()});
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
const texte=(page,sel)=>page.evaluate((s)=>{const e=document.querySelector(s);return e?e.innerText:'';},sel);
const existe=(page,sel)=>page.evaluate((s)=>!!document.querySelector(s),sel);
const attendre=async(fn,n=25)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(800);}return null;};

(async()=>{
  const nav=await chromium.launch();
  const err=[];

  console.log('\n== 1 · La date du serveur survit au nettoyage');
  {
    /* Une tâche visible du client fait écrire une ligne d'activité par
       hub.js, qui passe par sansIndefini. C'est là que la date mourait. */
    await vider('activite');
    const tid='lot1-tache';
    await poser(`taches/${tid}`,{projet:S('atelier'),titre:S('Contrôle des dates du serveur'),statut:S('a-faire'),priorite:S('normale'),visibilite:S('client'),archive:B(false),cree:T(new Date()),maj:T(new Date())});
    const ligne=await attendre(async()=>{
      const j=await lire('activite?pageSize=50');
      return ((j&&j.documents)||[]).find(d=>/Contrôle des dates du serveur/.test(str(d,'texte')));
    });
    verifier(!!ligne,"l'activité d'une tâche est écrite");
    const d=champ(ligne,'date');
    verifier(!!d.timestampValue,'et elle porte une vraie date',JSON.stringify(d).slice(0,80));
    /* La notification du client passe par le même nettoyage. */
    await poser(`taches/${tid}`,{projet:S('atelier'),titre:S('Contrôle des dates du serveur'),statut:S('terminee'),priorite:S('normale'),visibilite:S('client'),archive:B(false),cree:T(new Date()),maj:T(new Date())});
    /* Les boîtes sont des documents FANTÔMES : « boites/{uid} » n'existe
       pas, seule la sous-collection « notifications » est écrite, et une
       liste REST ne rend pas les parents fantômes. On interroge donc le
       groupe, comme le fait le hub lui-même. */
    const groupe=async(collection)=>{
      const r=await fetch(`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents:runQuery`,
        {method:'POST',headers:{...prop,'Content-Type':'application/json'},
         body:JSON.stringify({structuredQuery:{from:[{collectionId:collection,allDescendants:true}],limit:200}})});
      if(!r.ok) return [];
      return (await r.json()).filter(x=>x.document).map(x=>x.document);
    };
    const notifs=await attendre(async()=>{const l=await groupe('notifications');return l.length?l:null;});
    verifier(!!notifs,'les notifications du client sont écrites');
    const sansDate=(notifs||[]).filter(d=>!champ(d,'date').timestampValue).length;
    verifier(notifs&&sansDate===0,`toutes portent une vraie date (${(notifs||[]).length} contrôlées)`,`${sansDate} sans date`);
    const envoi=await attendre(async()=>{
      const j=await lire('envois?pageSize=50');
      return ((j&&j.documents)||[]).find(d=>!!champ(d,'cree').timestampValue);
    },8);
    verifier(!!envoi,"et une lettre en file porte sa date de création");
  }

  console.log('\n== 2 · La connexion ne vole plus les droits sur les fichiers');
  {
    /* Camille est cliente : son jeton doit porter « projets » après un
       login, sinon tout dépôt de fichier est refusé par le stockage. */
    const page=await (await nav.newContext({viewport:{width:1400,height:1000}})).newPage();
    page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,160)));
    await connecter(page,'camille.essai@exemple.test');
    const jeton=await page.evaluate(async()=>{
      const m=await import('./assets/js/noyau.js');
      const u=m.auth&&m.auth.currentUser; if(!u) return null;
      const r=await u.getIdTokenResult(true);
      return { projets: r.claims.projets||null, equipe: r.claims.equipe||false, testeur: r.claims.testeur||false };
    }).catch(()=>null);
    verifier(!!jeton,'le jeton du client se relit');
    verifier(jeton&&Array.isArray(jeton.projets)&&jeton.projets.includes('atelier'),'il porte encore ses projets après la connexion',JSON.stringify(jeton));
    verifier(jeton&&jeton.testeur===false,"et pas la revendication d'un testeur");
    await page.context().close();
  }

  console.log('\n== 3 · Le testeur dépose sa preuve');
  {
    /* On ne rejoue pas tout l'écran du testeur : on vérifie que la règle
       de stockage accepte le chemin, et qu'elle refuse celui d'un autre. */
    const regles=require('fs').readFileSync(`${__dirname}/../../suivi/storage.rules`,'utf8');
    verifier(/match \/campagnes\/\{projetId\}\/\{campagneId\}\/\{uid\}/.test(regles),'le dossier des preuves existe dans les règles');
    verifier(/request\.auth\.uid == uid[\s\S]{0,120}token\.testeur == true/.test(regles),'et seul le testeur lui-même y écrit');
    /* Depuis la Release Gate 1, « read » est découpé : « get » pour l'équipe
       et le client du projet, « list » pour l'équipe seule. Le droit
       lui-même est éprouvé dans storage.test.mjs. */
    verifier(/match \/campagnes[\s\S]{0,400}allow get:\s+if estEquipe\(\) \|\| surSonProjet\(projetId\)/.test(regles),"l'équipe et le client du projet les lisent");
    verifier(/match \/campagnes[\s\S]{0,400}allow list:\s+if estEquipe\(\);/.test(regles),"seule l'équipe parcourt le dossier");
  }

  console.log('\n== 4 · Les quatre défauts d\'écran');
  {
    const eq=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
    eq.on('pageerror',e=>err.push('EQUIPE: '+e.message.slice(0,160)));
    eq.on('console',m=>{if(m.type()==='error')err.push('equipe: '+m.text().slice(0,160));});
    await connecter(eq,'agent.essai@exemple.test');
    await eq.evaluate(()=>{try{localStorage.setItem('suivi:cle-admin','cle-essai-locale');}catch(e){}});

    /* Le statut d'un ancien projet : « actif » n'existe plus dans la liste. */
    await poser('projets/ancien',{nom:S('ANCIEN'),ref:S('ANCIEN'),statut:S('actif'),membres:L([]),compteur:{integerValue:'1'},archive:B(false)});
    await pause(1200);
    await aller(eq,'/projets/ancien','.page-tete');
    const boutonModifier=await eq.$('[data-editer-projet], [data-action="editer-projet"]') || await eq.$('button:has-text("Modifier")');
    if(boutonModifier){ await boutonModifier.click(); await pause(1200); }
    const choisi=await eq.evaluate(()=>{const s=document.querySelector('#ed-statut');return s?s.value:'';});
    verifier(choisi==='en-cours',"un projet « actif » ouvre son formulaire sur « En cours », pas « brouillon »",choisi||'formulaire absent');
    await eq.keyboard.press('Escape'); await pause(500);

    /* Le doublon d'une référence de parcours, depuis la console. */
    await aller(eq,'/tests?projet=atelier','#parcours');
    const dejaPris=await eq.evaluate(()=>{
      const l=document.querySelectorAll('#catalogue-parcours .ligne, #parcours .ligne');
      return l.length?null:'aucun parcours à l\'écran';
    });
    void dejaPris;
    if(await existe(eq,'[data-nouveau-parcours]')){
      await eq.click('[data-nouveau-parcours]'); await pause(1100);
      await eq.fill('#ed-ref','A-01');
      await eq.fill('#ed-titre','Doublon volontaire');
      await eq.click('button[type="submit"][form="ed-forme"]'); await pause(1800);
      const feuilleOuverte=await existe(eq,'.feuille');
      verifier(feuilleOuverte,"une référence déjà prise est refusée, la feuille reste ouverte");
      const a01=await lire('projets/atelier/parcours/A-01');
      verifier(str(a01,'titre')!=='Doublon volontaire',"et le parcours existant n'est pas écrasé",str(a01,'titre'));
      await eq.keyboard.press('Escape'); await pause(600);
    } else dire('le bouton « Nouveau parcours » est introuvable');

    await eq.context().close();

    const cl=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
    cl.on('pageerror',e=>err.push('CLIENT: '+e.message.slice(0,160)));
    cl.on('console',m=>{if(m.type()==='error')err.push('client: '+m.text().slice(0,160));});
    await connecter(cl,'camille.essai@exemple.test');

    /* Une conversation sur un projet qui n'est pas le sien. */
    await aller(cl,'/messages/projet-qui-nexiste-pas','.page');
    const page=await texte(cl,'.page');
    verifier(!/n'a pas pu s'ouvrir/.test(page),"une adresse de conversation inconnue ne fait plus tomber la page",page.slice(0,90));
    verifier(/Atelier/.test(page)||/Commencez la conversation/.test(page),'et retombe sur une conversation lisible',page.replace(/\n/g,' ').slice(0,110));

    /* « Confiée à » dans l'historique d'une demande. */
    await aller(cl,'/projets/atelier/demandes/t-veille','.page');
    const fiche=await texte(cl,'.page');
    if(/Confiée à/.test(fiche)){
      verifier(!/Confiée à\s+[A-Za-z0-9]{20,}/.test(fiche),"« Confiée à » ne montre plus d'identifiant",(fiche.match(/Confiée à[^\n]{0,40}/)||[''])[0]);
    } else ok("« Confiée à » ne figure pas sur cette demande, rien à vérifier");

    /* La feuille d'une campagne : le client lit « Testeur N ». */
    await aller(cl,'/tests','#campagnes');
    const lien=await cl.$('[data-action="ouvrir-campagne"] .ligne-titre, [data-action="ouvrir-campagne"]');
    if(lien){
      await lien.click(); await pause(1600);
      const feuille=await cl.evaluate(()=>{const v=document.querySelector('.voile');return v?v.innerText:'';});
      const testeurs=(feuille.match(/Testeur \d/g)||[]).length;
      verifier(testeurs>0,'la feuille de campagne nomme « Testeur N » chez le client',feuille.slice(0,120));
      verifier(!/uid-|[A-Za-z0-9]{24,}/.test(feuille),"et ne montre plus aucun identifiant",(feuille.match(/[A-Za-z0-9]{24,}/)||[''])[0]);
      verifier(!/Karim|Sonia|@exemple\.test/.test(feuille),'ni aucun prénom ou adresse');
      await cl.keyboard.press('Escape'); await pause(500);
    } else dire('aucune campagne à ouvrir chez le client');

    await cl.context().close();
  }

  verifier(!err.length,'aucune erreur de page',[...new Set(err)].slice(0,3).join(' | '));
  await nav.close();
  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-lot1 : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
