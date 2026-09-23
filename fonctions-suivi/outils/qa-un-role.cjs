/* ==========================================================================
   CAPMEDIA CLIENT HUB · une adresse, un seul rôle

   Le 23/09/2026, une adresse inscrite au vivier alors qu'elle était déjà
   cliente atterrissait sur le hub au lieu de l'espace de test, puis la
   suppression du testeur a effacé le compte de connexion du client, qui
   était le même. Une adresse est désormais soit de l'équipe, soit testeur,
   soit cliente, et le serveur refuse tout geste qui la ferait changer de
   camp.

     (émulateurs avec les fonctions, semis)
     node fonctions-suivi/outils/qa-un-role.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const CLE=process.env.ADMIN_CLE_ESSAI||'cle-essai-locale';
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
/* Les comptes de l'émulateur d'authentification, lus directement. */
const compte=async(email)=>{
  const r=await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({email:[email]})});
  const j=await r.json().catch(()=>({}));
  const u=(j.users||[])[0];
  return u?{uid:u.localId,claims:JSON.parse(u.customAttributes||'{}')}:null;
};
const testeurParEmail=async(email)=>{
  const j=await lire('testeurs?pageSize=100');
  return ((j&&j.documents)||[]).find(d=>str(d,'email')===email)||null;
};
const refuse=(r)=>r.code===409&&/un seul rôle/.test(r.texte);

(async()=>{
  const CLIENT='camille.essai@exemple.test', EQUIPE='agent.essai@exemple.test';

  console.log('\n== 1 · Une adresse cliente ou d équipe ne devient pas testeur');
  {
    const r=await serveur('inscrireTesteur',{email:CLIENT,prenom:'Camille',plateformes:['web'],projets:['atelier']});
    verifier(refuse(r),`inscrire la cliente comme testeuse est refusé (${r.code})`,r.texte.slice(0,90));
    verifier(/un client/.test(r.texte),'et le refus dit quel rôle elle porte déjà',r.texte.slice(0,90));
    verifier(!(await testeurParEmail(CLIENT)),'aucune fiche de testeur n est créée');
    const c=await compte(CLIENT);
    verifier(c&&!c.claims.testeur,'et son compte ne porte pas la revendication de testeur',JSON.stringify(c&&c.claims));

    const r2=await serveur('inscrireTesteur',{email:EQUIPE,prenom:'Alex',plateformes:['web'],projets:['atelier']});
    verifier(refuse(r2),`inscrire un membre de l équipe comme testeur est refusé (${r2.code})`,r2.texte.slice(0,80));
  }

  console.log('\n== 2 · Une adresse de testeur ne devient ni cliente ni équipe');
  {
    const TESTEUR='role.testeur@exemple.test';
    const t=await testeurParEmail(TESTEUR); if(t) await fetch(`http://127.0.0.1:8080/v1/${t.name}`,{method:'DELETE',headers:prop});
    const r=await serveur('inscrireTesteur',{email:TESTEUR,prenom:'Rachid',plateformes:['web'],projets:['atelier']});
    verifier(r.code===200,'un testeur neuf s inscrit normalement',r.texte.slice(0,60));

    const a=await serveur('inviterClient',{projet:'atelier',email:TESTEUR,nom:'Rachid'});
    verifier(refuse(a),`l inviter comme client sur un projet est refusé (${a.code})`,a.texte.slice(0,80));
    const b=await serveur('creerInvitation',{email:TESTEUR,nom:'Rachid',projet:'atelier'});
    verifier(refuse(b),`lui créer une invitation client est refusé (${b.code})`,b.texte.slice(0,80));
    const c=await serveur('ajouterEquipe',{email:TESTEUR,nom:'Rachid',role:'agent'});
    verifier(refuse(c),`l ajouter à l équipe est refusé (${c.code})`,c.texte.slice(0,80));
    const d=await serveur('creerOrganisation',{nom:'Rachid SA',entreprise:'Rachid SA',email:TESTEUR});
    verifier(refuse(d),`créer une fiche client à son adresse est refusé (${d.code})`,d.texte.slice(0,80));
    /* Le geste qui a trompé : changer l'adresse d'une fiche client pour
       celle d'un testeur. */
    const e=await serveur('majOrganisation',{id:'atelier-nord',email:TESTEUR});
    verifier(refuse(e),`donner son adresse à une fiche client existante est refusé (${e.code})`,e.texte.slice(0,80));
    const org=await lire('organisations/atelier-nord');
    verifier(str(org,'email')!==TESTEUR,'et la fiche client garde son adresse');

    /* Le même rôle, lui, reste libre : réinscrire un testeur n'est pas un
       conflit, réinviter une cliente non plus. */
    const f=await serveur('inscrireTesteur',{email:TESTEUR,prenom:'Rachid',plateformes:['web','android'],projets:['atelier']});
    verifier(f.code===200,'réinscrire le même testeur reste permis',f.texte.slice(0,60));
    const g=await serveur('inviterClient',{projet:'atelier',email:CLIENT,nom:'Camille Martin'});
    verifier(g.code===200,'réinviter la même cliente reste permis',g.texte.slice(0,60));

    const fin=await testeurParEmail(TESTEUR);
    if(fin) await serveur('retirerTesteur',{testeur:fin.name.split('/').pop(),definitif:true});
  }

  console.log('\n== 3 · Supprimer un testeur n emporte jamais le compte d un client');
  {
    /* Des données d'AVANT la règle : un compte à la fois client et testeur.
       On les pose à la main, puisque le serveur refuse désormais de les
       créer. C'est exactement la situation de production du 23/09. */
    const c=await compte(CLIENT);
    verifier(!!c,'la cliente a un compte');
    const uid=c.uid;
    const S=(v)=>({stringValue:String(v)});
    await fetch(bdd(`testeurs/${uid}`),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},
      body:JSON.stringify({fields:{prenom:S('Camille'),email:S(CLIENT),actif:{booleanValue:true},projets:{arrayValue:{values:[S('atelier')]}}}})});
    await pause(800);
    const r=await serveur('retirerTesteur',{testeur:uid,definitif:true});
    verifier(r.code===200,`la suppression du testeur passe (${r.code})`,r.texte.slice(0,80));
    let bilan={}; try{bilan=JSON.parse(r.texte);}catch(e){}
    verifier(bilan.compte==='garde','le serveur dit qu il GARDE le compte, parce qu il sert à un client',JSON.stringify(bilan).slice(0,120));
    const apres=await compte(CLIENT);
    verifier(!!apres,'le compte de la cliente existe toujours');
    verifier(apres&&!apres.claims.testeur,'sans la revendication de testeur');
    const projet=await lire('projets/atelier');
    const membres=(((champ(projet,'membres').arrayValue||{}).values)||[]).map(v=>v.stringValue);
    verifier(membres.includes(uid),'et elle est toujours membre de son projet');
    verifier(!(await lire(`testeurs/${uid}`)),'seule la fiche de testeur est partie');
  }

  console.log('\n== 4 · Un testeur posé sur le hub est renvoyé chez lui');
  {
    const TESTEUR='hub.testeur@exemple.test';
    const t=await testeurParEmail(TESTEUR); if(t) await fetch(`http://127.0.0.1:8080/v1/${t.name}`,{method:'DELETE',headers:prop});
    const r=await serveur('inscrireTesteur',{email:TESTEUR,prenom:'Hugo',plateformes:['web'],projets:['atelier']});
    let tid=''; try{tid=JSON.parse(r.texte).uid;}catch(e){}
    const nav=await chromium.launch();
    const page=await (await nav.newContext({viewport:{width:1200,height:900}})).newPage();
    await vider('envois');await vider('connexions');await vider('connexionsIp');
    await page.goto(`${SITE}/suivi/?emul`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
    await page.fill('#email',TESTEUR);await page.click('#envoyer');
    await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
    const code=await attendre(async()=>{
      const j=await lire('envois?pageSize=50');
      const d=((j&&j.documents)||[]).find(x=>str(x,'modele')==='code');
      return d?((((champ(d,'variables').mapValue||{}).fields)||{}).code||{}).stringValue:null;
    });
    await page.fill('#code',code||'');
    await pause(6000);
    /* Un favori, un lien collé : on force l'adresse du hub. */
    await page.goto(`${SITE}/suivi/hub?emul`,{waitUntil:'domcontentloaded'});
    await pause(6000);
    const ou=await page.evaluate(()=>location.pathname);
    verifier(ou==='/suivi/testeur','un testeur qui ouvre le hub à la main est renvoyé vers son espace',`resté sur ${ou}`);
    await nav.close();
    if(tid) await serveur('retirerTesteur',{testeur:tid,definitif:true});
  }

  console.log('\n== 5 · La porte reçoit toujours les corrections');
  {
    /* Le déploiement numérotait les imports du seul dossier assets/js ; la
       porte vit un cran au-dessus et importait le noyau sans numéro, donc
       depuis un cache de sept jours. */
    const wf=fs.readFileSync(`${__dirname}/../../.github/workflows/agence.yml`,'utf8');
    verifier(/os\.walk\('agence\/suivi\/assets'\)/.test(wf),'le déploiement numérote tout le dossier assets, porte comprise');
  }

  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-un-role : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
