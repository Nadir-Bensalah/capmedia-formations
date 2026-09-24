/* ==========================================================================
   CAPMEDIA CLIENT HUB · le questionnaire sur la page, et les résultats

   Le client a accès à tout ce que la campagne produit : les questions
   posées aux testeurs avant même qu'ils répondent, chaque réponse une
   fois donnée, mot pour mot, et chaque passage, scénario par scénario,
   avec sa preuve. Ce qu'il ne voit jamais, c'est un nom : un testeur est
   un numéro, le même partout sur la page.

     (émulateurs avec les fonctions, semis, scénarios importés)
     node fonctions-suivi/outils/qa-avis-page.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const poser=async(chemin,fields)=>fetch(bdd(chemin),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields})});
const S=(v)=>({stringValue:String(v)}), N=(v)=>({integerValue:String(v)}), B=(v)=>({booleanValue:v}), L=(a)=>({arrayValue:{values:a}}), M=(f)=>({mapValue:{fields:f}}), T=(d)=>({timestampValue:d.toISOString()});
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
const texte=(page,sel)=>page.evaluate((s)=>{const e=document.querySelector(s);return e?e.innerText:'';},sel);
const nombre=(page,sel)=>page.evaluate((s)=>document.querySelectorAll(s).length,sel);

(async()=>{
  /* Le jeu : deux testeurs au profil connu, une campagne, trois passages
     dont un KO avec preuve, deux avis. */
  const cid='qa-avis';
  await poser('testeurs/uid-karim',{prenom:S('Karim'),email:S('karim.essai@exemple.test'),mobile:S('android'),plateformes:L([S('android'),S('web')]),actif:B(true),projets:L([S('atelier')]),profil:M({sexe:S('homme'),age:S('25-34'),fonction:S('Infirmier'),aisance:S("À l'aise")})});
  await poser('testeurs/uid-sonia',{prenom:S('Sonia'),email:S('sonia.essai@exemple.test'),mobile:S('ios'),plateformes:L([S('ios'),S('web')]),actif:B(true),projets:L([S('atelier')]),profil:M({sexe:S('femme'),age:S('35-44'),fonction:S('Comptable'),aisance:S('Moyenne')})});
  await poser(`projets/atelier/campagnes/${cid}`,{titre:S('Passe des avis'),statut:S('en-cours'),actif:B(true),
    testeurs:L([S('uid-karim'),S('uid-sonia')]),scenarios:L([S('DI-06'),S('DI-07')]),
    affectation:M({'uid-karim':L([S('DI-06'),S('DI-07')]),'uid-sonia':L([S('DI-06')])}),maj:T(new Date())});
  await vider(`projets/atelier/campagnes/${cid}/passages`); await vider(`projets/atelier/campagnes/${cid}/appreciations`);
  const passage=(uid,scen,plat,res,com,preuves,appareil)=>poser(`projets/atelier/campagnes/${cid}/passages/${uid}__${scen}`,{scenario:S(scen),testeur:S(uid),plateforme:S(plat),resultat:S(res),commentaire:S(com),preuves:L(preuves.map(S)),contexte:M({appareil:S(appareil)}),le:T(new Date())});
  await passage('uid-karim','DI-06','android','ok','Comme prévu, la date sans heure reste sans heure',[],'Pixel 8');
  await passage('uid-sonia','DI-06','ios','ko','La date sans heure affiche 00:00',['projets/atelier/preuves/qa-avis-1.png'],'iPhone 15');
  await passage('uid-karim','DI-07','web','ok','',[],'Chrome');
  await poser(`projets/atelier/campagnes/${cid}/appreciations/uid-karim`,{'impression.sert-a-quoi':S('À gérer mes tâches et mes récurrences'),'impression.compris':N(5),'esthetique.belle':N(4),'facilite.recommande':N(8),'argent.paierait':S('Oui'),'argent.suspect':N(2),'argent.cher':N(9),'utilite.vraie-vie':S('Oui, tous les jours'),'libre.garder':S('Les récurrences, le calendrier, les objectifs')});
  await poser(`projets/atelier/campagnes/${cid}/appreciations/uid-sonia`,{'impression.sert-a-quoi':S('Un agenda avec des objectifs'),'impression.compris':N(4),'esthetique.belle':N(3),'facilite.recommande':N(7),'argent.paierait':S('Peut-être'),'argent.suspect':N(3),'argent.cher':N(12),'utilite.vraie-vie':S('Oui, de temps en temps'),'libre.garder':S('Le calendrier, la simplicité, les couleurs')});
  /* Le profil sans nom, recopié par le serveur sous le projet : c'est lui que le client lit. */
  for(let i=0;i<30;i++){const p=await lire('projets/atelier/profilsTesteurs/uid-sonia');if(p&&p.fields)break;await pause(700);}

  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,160)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,160));});
  await connecter(page,'agent.essai@exemple.test');

  console.log('\n== L équipe : le questionnaire est sur la page');
  await aller(page,'/tests?projet=atelier','#etage-avis');
  await pause(2500);
  verifier(await page.evaluate(()=>!!document.querySelector('#etage-avis')),'l étage « Ce que les testeurs en pensent » existe');
  const resume=await texte(page,'#etage-avis .etage-resume');
  verifier(/2 testeurs ont répondu/.test(resume),'le résumé compte deux réponses',resume);
  verifier(/7[,.]5/.test(resume),'et une recommandation de 7,5',resume);
  verifier(/3.*12 €/.test(resume),'et une fourchette de 3 à 12 €',resume);
  verifier(await nombre(page,'#avis .avis-famille')===7,'les sept familles sont là',String(await nombre(page,'#avis .avis-famille')));
  const nq=await nombre(page,'#avis .avis-question');
  verifier(nq===35,`les 35 questions sont toutes visibles (${nq})`);
  const avisT=await texte(page,'#avis');
  verifier(/Les récurrences, le calendrier, les objectifs/.test(avisT),'une réponse libre est rendue mot pour mot');
  verifier(/Karim/.test(avisT)&&/Infirmier/.test(avisT),'signée du prénom et du profil pour l équipe');
  verifier(/Une note de 1 à 5/.test(avisT),'une question sans réponse dit ce qu elle attend');
  verifier(/Avant de commencer/i.test(avisT)&&/Après avoir tout déroulé/i.test(avisT),'chaque famille dit quand elle est posée');
  verifier(await page.evaluate(()=>[...document.querySelectorAll('.index-page button')].some(b=>/Questionnaire/.test(b.innerText))),'l index de page mène au questionnaire');
  verifier(await page.evaluate(()=>!!document.querySelector('[data-info="avis"]')),'le « i » du questionnaire est là');
  verifier(await page.evaluate(()=>!!document.querySelector('#alertes, .section--alerte, .calme')),'« Ce qui ne va pas » est sur la page du projet');

  console.log('\n== L équipe : les résultats, scénario par scénario');
  await page.click(`[data-action="ouvrir-campagne"][data-id="${cid}"] .ligne-titre, [data-action="ouvrir-campagne"][data-id="${cid}"]`).catch(()=>{}); await pause(1500);
  verifier(await page.evaluate(()=>!!document.querySelector('.voile #resultats')),'la feuille de campagne porte les résultats');
  const res=await texte(page,'.voile #resultats');
  verifier(/2\s+réussis/.test(res)&&/1\s+échoué/.test(res),'deux réussis, un échoué',res.slice(0,120));
  verifier(/3 passages consignés sur 3 attendus/.test(res),'trois passages sur trois attendus',res.slice(0,160));
  verifier(/DI-06/.test(res)&&/DI-07/.test(res),'les deux scénarios sont listés');
  verifier(/Sonia · [^\n]*iPhone 15/.test(res),'Sonia, iPhone, avec son appareil');
  verifier(/affiche 00:00/.test(res),'et son commentaire');
  verifier(await page.evaluate(()=>[...document.querySelectorAll('.voile #resultats [data-piece]')].length===1),'sa preuve est un bouton');
  verifier(await page.evaluate(()=>[...document.querySelectorAll('.voile #resultats .pastille, .voile #resultats .puce')].some(p=>/KO/.test(p.innerText))),'le KO est marqué');
  await page.click('.voile [data-voir-avis]'); await pause(1800);
  const modal=await page.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();return v?v.innerText:'';});
  verifier(/Ce que les testeurs en pensent/.test(modal)&&/recommandation sur 10/.test(modal),'« Leur avis » ouvre toujours la restitution');
  verifier(/Karim/.test(modal),'avec les prénoms pour l équipe');
  await page.keyboard.press('Escape'); await pause(400); await page.keyboard.press('Escape'); await pause(400);

  console.log('\n== Le client : tout, sauf les noms');
  const cl=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  cl.on('pageerror',e=>err.push('CLIENT: '+e.message.slice(0,160)));
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests','#etage-avis'); await pause(3000);
  verifier(await cl.evaluate(()=>!!document.querySelector('#etage-avis')),'l étage du questionnaire est chez le client');
  const resumeC=await texte(cl,'#etage-avis .etage-resume');
  verifier(/2 testeurs ont répondu/.test(resumeC),'avec les deux réponses',resumeC);
  const avisC=await texte(cl,'#avis');
  verifier(/Les récurrences, le calendrier, les objectifs/.test(avisC),'les réponses libres, intégrales');
  verifier(!/Karim|Sonia|karim\.essai|sonia\.essai/.test(avisC),'mais aucun prénom ni adresse');
  verifier(/Testeur \d/.test(avisC),'les testeurs sont numérotés');
  verifier(/Infirmier/.test(avisC)&&/25-34 ans/.test(avisC),'et leur profil reste');
  verifier(await nombre(cl,'#avis .avis-question')===35,'les 35 questions sont là aussi');
  /* Le même numéro partout : celui du vivier et celui de la citation. */
  const coherence=await cl.evaluate(()=>{
    const vivier=[...document.querySelectorAll('#testeurs .ligne')].map(l=>l.innerText);
    const ligneInf=vivier.find(t=>/Infirmier/.test(t))||'';
    const numVivier=(ligneInf.match(/Testeur (\d+)/)||[])[1];
    const cite=[...document.querySelectorAll('#avis .avis-verbatim')].find(b=>/récurrences, le calendrier/.test(b.innerText));
    const numCite=cite?(cite.querySelector('cite').innerText.match(/Testeur (\d+)/)||[])[1]:'';
    return {numVivier,numCite};
  });
  verifier(coherence.numVivier&&coherence.numVivier===coherence.numCite,'le numéro d un testeur est le même au vivier et sous sa citation',JSON.stringify(coherence));
  verifier(await cl.evaluate(()=>!!document.querySelector('.section--alerte, .calme')),'« Ce qui ne va pas » est aussi chez le client');

  await cl.click(`[data-action="ouvrir-campagne"][data-id="${cid}"] .ligne-titre, [data-action="ouvrir-campagne"][data-id="${cid}"]`).catch(()=>{}); await pause(1500);
  const resC=await texte(cl,'.voile #resultats');
  verifier(/2\s+réussis/.test(resC)&&/1\s+échoué/.test(resC),'le client lit les résultats scénario par scénario');
  verifier(!/Karim|Sonia/.test(resC)&&/Testeur \d/.test(resC),'sans nom, avec le numéro');
  verifier(/affiche 00:00/.test(resC),'avec le commentaire du KO');
  verifier(await cl.evaluate(()=>[...document.querySelectorAll('.voile #resultats [data-piece]')].length===1),'et le bouton de la preuve');
  verifier(await cl.evaluate(()=>!document.querySelector('.voile [data-repartir]')),'mais rien à répartir');
  await cl.click('.voile [data-voir-avis]'); await pause(1800);
  const modalC=await cl.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();return v?v.innerText:'';});
  verifier(/recommandation sur 10/.test(modalC)&&!/Karim|Sonia/.test(modalC),'« Leur avis » chez le client, sans nom');

  verifier(!err.length,'aucune erreur de page',err.join(' | '));
  await nav.close();
  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-avis-page : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
