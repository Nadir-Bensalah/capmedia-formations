/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'invitation d'un testeur

   Inscrire un testeur créait son compte en silence : aucune lettre, donc
   aucun moyen pour lui de savoir qu'il était attendu ni où aller. Le
   vivier de production en portait un depuis la veille, sans rien reçu.

   Ce banc garde les deux chemins : la lettre part à l'inscription, et se
   renvoie depuis la fiche du testeur.

     (émulateurs avec les fonctions, semis)
     node fonctions-suivi/outils/qa-invitation-testeur.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const CLE=process.env.ADMIN_CLE_ESSAI||'cle-essai-locale';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const soucis=[];const ok=m=>console.log('  ok     '+m);const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const champ=(d,k)=>(((d||{}).fields||{})[k]||{});
const str=(d,k)=>champ(d,k).stringValue||'';
const attendre=async(fn,n=25)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(700);}return null;};
const serveur=async(action,corps)=>{
  const r=await fetch(`http://127.0.0.1:5001/${PROJET}/europe-west1/suiviAdmin`,{
    /* La clé voyage dans le corps, pas dans un en-tête : c'est ce que
       « suiviAdmin » lit, et le navigateur fait pareil. */
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({cle:CLE,action,...corps})});
  return { code:r.status, texte:await r.text() };
};
/* La lettre destinée à cette adresse, quel que soit son rang dans la file. */
const lettrePour=(email,modele)=>attendre(async()=>{
  const j=await lire('envois?pageSize=200');
  return ((j&&j.documents)||[]).find(d=>str(d,'modele')===modele
    && (((champ(d,'a').arrayValue||{}).values)||[]).some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===email));
});
const variables=(d)=>(((champ(d,'variables').mapValue||{}).fields)||{});

(async()=>{
  const adresse='testeur.invite@exemple.test';
  await vider('envois');
  /* Un compte d'essai laissé par une passe précédente fausserait tout. */
  const vivier=await lire('testeurs?pageSize=100');
  for (const d of ((vivier&&vivier.documents)||[])) {
    if (str(d,'email')===adresse) await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});
  }

  console.log("\n== 1 · La lettre part à l'inscription");
  const r=await serveur('inscrireTesteur',{
    email:adresse, prenom:'Yasmine', plateformes:['android','web'], projets:['atelier'],
    profil:{ sexe:'femme', age:'25-34', fonction:'Libraire', aisance:'Moyenne' },
  });
  verifier(r.code===200,`le serveur accepte l'inscription (${r.code})`,r.texte.slice(0,90));
  let reponse={}; try{reponse=JSON.parse(r.texte);}catch(e){}
  verifier(reponse.ok===true,'et rend un compte');
  verifier(reponse.invite===true,"il dit que l'invitation est partie",JSON.stringify(reponse));

  const lettre=await lettrePour(adresse,'invitation-testeur');
  verifier(!!lettre,"une lettre « invitation-testeur » est en file");
  const v=variables(lettre);
  verifier((v.prenom||{}).stringValue==='Yasmine','elle porte son prénom');
  verifier((v.projetNom||{}).stringValue==='Atelier','et le nom du projet, pas son identifiant',(v.projetNom||{}).stringValue);
  const plats=(((v.plateformes||{}).arrayValue||{}).values||[]).map(x=>x.stringValue).sort().join(',');
  verifier(plats==='android,web','et ce qu elle teste',plats);
  verifier(/https?:\/\//.test((v.lien||{}).stringValue||''),"et l'adresse de l'espace",(v.lien||{}).stringValue);

  console.log('\n== 2 · Ce que la lettre dit');
  {
    const c=require('../courriels');
    const rendu=c.rendre('invitation-testeur',{prenom:'Yasmine',email:adresse,projetNom:'Atelier',plateformes:['android','web'],lien:'https://capmedia.app/suivi/'});
    const t=`${rendu.objet}\n${rendu.texte}`;
    verifier(/Atelier/.test(rendu.objet),'son objet nomme le projet',rendu.objet);
    verifier(/code à six chiffres/.test(t),'elle annonce un code, pas un lien de connexion');
    verifier(!/lien de connexion/.test(t),"et ne promet plus un lien qui n'existe pas");
    verifier(/capture/.test(t),"elle prévient qu'une preuve est demandée pour un échec");
    verifier(/que les scénarios qui vous sont confiés/.test(t),'et dit ce qu il ne verra pas');
    verifier(!/—/.test(t),'aucun tiret cadratin');
    verifier(!/undefined|null|\[object/.test(t),'aucune valeur brute');
    /* L'invitation du CLIENT promettait elle aussi un lien de connexion. */
    const cl=c.rendre('invitation',{clientNom:'Camille',email:'c@x.test',projetNom:'Atelier',lien:'x'});
    verifier(/code à six chiffres/.test(cl.texte)&&!/un lien de connexion vous est envoyé/.test(cl.texte),
      "l'invitation du client dit aussi la vérité sur la porte");
  }

  console.log("\n== 3 · L'invitation se renvoie");
  {
    const fiche=await attendre(async()=>{
      const j=await lire('testeurs?pageSize=100');
      return ((j&&j.documents)||[]).find(d=>str(d,'email')===adresse);
    });
    verifier(!!fiche,'le testeur est bien au vivier');
    const tid=fiche?fiche.name.split('/').pop():'';
    await vider('envois');
    const r2=await serveur('inviterTesteur',{testeur:tid});
    verifier(r2.code===200,`le renvoi est accepté (${r2.code})`,r2.texte.slice(0,80));
    const l2=await lettrePour(adresse,'invitation-testeur');
    verifier(!!l2,'et une nouvelle lettre part');

    /* Un testeur retiré du vivier ne doit plus être invité. */
    await serveur('majTesteur',{testeur:tid,archive:true});
    await pause(900);
    const r3=await serveur('inviterTesteur',{testeur:tid});
    verifier(r3.code===409,`un testeur retiré n'est plus invité (${r3.code})`,r3.texte.slice(0,60));
    await serveur('majTesteur',{testeur:tid,archive:false});

    const r4=await serveur('inviterTesteur',{testeur:'inconnu-xyz'});
    verifier(r4.code===404,`un testeur inconnu est refusé (${r4.code})`);
  }

  console.log("\n== 4 · Le bouton dans la fiche du testeur");
  {
    const src=require('fs').readFileSync(`${__dirname}/../../agence/suivi/assets/js/vues/tests.js`,'utf8');
    verifier(/data-inviter/.test(src),"la fiche porte un bouton « Renvoyer l'invitation »");
    verifier(/appelServeur\('inviterTesteur'/.test(src),"et il appelle la bonne action");
  }

  /* Ménage : le compte d'essai ne reste pas dans le vivier. */
  {
    const j=await lire('testeurs?pageSize=100');
    for (const d of ((j&&j.documents)||[])) if (str(d,'email')===adresse) await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});
  }

  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-invitation-testeur : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
