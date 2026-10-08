require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · la restitution des avis

   Depuis le 08/10/2026, l'avis est anonyme pour tout le monde : ni nom,
   ni numéro, ni profil à côté d'une réponse, pour l'équipe comme pour le
   client. Les testeurs gardent leur profil dans la liste des testeurs ;
   leurs réponses n'y sont pas reliées.

   Les réponses libres sont rendues mot pour mot, jamais résumées : c'est
   là qu'est la vraie information, et un résumé la tue.

     (émulateurs, semer-suivi.mjs, semer-campagne.mjs)
     node fonctions-suivi/outils/qa-restitution.cjs

   La suite pose elle-même ses avis (deux testeurs de la campagne c-oct,
   avec un profil et des réponses complètes, montants compris) : elle ne
   dépend plus de ce qu'une autre suite a laissé dans la base.
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE=BANC.site;
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`${BANC.firestore}/v1/${d.name}`,{method:'DELETE',headers:prop});};
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

const ouvrirLesAvis=async(page)=>{
  await aller(page,'/tests?projet=atelier','#onglets-tests','Tests');
  /* Celle qui porte les avis, pas la premiere venue : le semis en laisse
     plusieurs, et ouvrir la mauvaise donne une feuille vide. */
  const l=await page.$('[data-action="ouvrir-campagne"][data-id="c-oct"]') || await page.$('[data-action="ouvrir-campagne"]');
  if(!l) return false;
  await l.click(); await pause(1400);
  const b=await page.$('[data-voir-avis]');
  if(!b) return false;
  await b.click(); await pause(2200);
  return true;
};

/* Le jeu d'avis : deux testeurs de c-oct avec un profil (qui ne doit plus
   apparaître sous une citation), et trois réponses anonymes, comme les
   range hubAvisTesteur : le seuil est atteint. */
const S=(v)=>({stringValue:String(v)}), N=(v)=>({integerValue:String(v)});
const poser=(chemin,champs,masque)=>fetch(bdd(chemin)+(masque?`?${masque.map(m=>`updateMask.fieldPaths=${m}`).join('&')}`:''),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields:champs})});
const PROFILS=[{age:'25-34',fonction:'Infirmier',sexe:'homme'},{age:'45-54',fonction:'Comptable',sexe:'femme'}];
const REPONSES=[
  {'impression.sert-a-quoi':S('À gérer mes tâches et mes récurrences'),'impression.compris':N(5),'impression.oeil':S('Le calendrier'),'esthetique.belle':N(4),'esthetique.moderne':N(4),'esthetique.couleurs':S('Oui'),'facilite.trouve':N(4),'facilite.recommande':N(8),'utilite.probleme':N(4),'utilite.vraie-vie':S('Oui, tous les jours'),'argent.paierait':S('Oui'),'argent.suspect':N(2),'argent.cher':N(9),'performance.rapide':N(5),'performance.plantages':S('Jamais'),'libre.garder':S('Les récurrences, le calendrier, les objectifs')},
  {'impression.sert-a-quoi':S('Un agenda avec des objectifs'),'impression.compris':N(4),'esthetique.belle':N(3),'esthetique.lisible':N(4),'facilite.trouve':N(3),'facilite.recommande':N(7),'utilite.probleme':N(3),'utilite.vraie-vie':S('Oui, de temps en temps'),'argent.paierait':S('Peut-être'),'argent.suspect':N(3),'argent.cher':N(12),'performance.rapide':N(4),'libre.garder':S('Le calendrier, la simplicité, les couleurs')},
  {'esthetique.belle':N(5),'facilite.recommande':N(9),'argent.suspect':N(2),'argent.cher':N(10),'libre.garder':S('Le mode sombre')},
];
const poserLesAvis=async()=>{
  const camp=await lire('projets/atelier/campagnes/c-oct');
  const uids=((((camp||{}).fields||{}).testeurs||{}).arrayValue||{}).values?.map(v=>v.stringValue).slice(0,2)||[];
  if(uids.length<2) throw new Error('la campagne c-oct du semis doit avoir deux testeurs (semer-campagne.mjs)');
  await vider('projets/atelier/campagnes/c-oct/appreciations');
  for(const m of ['avant','apres']) await vider(`projets/atelier/campagnes/c-oct/avisAnonymes/${m}/reponses`);
  for(const [i,uid] of uids.entries()){
    const p=PROFILS[i];
    await poser(`testeurs/${uid}`,{profil:{mapValue:{fields:{age:S(p.age),fonction:S(p.fonction),sexe:S(p.sexe),aisance:S('Moyenne')}}}},['profil']);
  }
  /* Une réponse par moment et par personne, comme le serveur la range :
     le moment, les réponses, rien d'autre. */
  for(const [i,r] of REPONSES.entries()){
    const avant=Object.fromEntries(Object.entries(r).filter(([k])=>k.startsWith('impression.')));
    const apres=Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith('impression.')));
    if(Object.keys(avant).length) await poser(`projets/atelier/campagnes/c-oct/avisAnonymes/avant/reponses/x${i}`,{moment:S('avant'),reponses:{mapValue:{fields:avant}}});
    await poser(`projets/atelier/campagnes/c-oct/avisAnonymes/apres/reponses/y${i}`,{moment:S('apres'),reponses:{mapValue:{fields:apres}}});
  }
  await poser('projets/atelier/campagnes/c-oct/avisAnonymes/avant',{recus:N(2)});
  await poser('projets/atelier/campagnes/c-oct/avisAnonymes/apres',{recus:N(3)});
  /* Le serveur recopie le profil sous le projet : on attend qu'il l'ait fait. */
  for(let i=0;i<40;i++){const l=await Promise.all(uids.map(u=>lire(`projets/atelier/profilsTesteurs/${u}`)));if(l.every(x=>x&&x.fields&&x.fields.age&&PROFILS.some(p=>p.age===x.fields.age.stringValue)))return;await pause(500);}
  throw new Error('les profils des testeurs ne sont pas recopiés sous le projet');
};

(async()=>{
  await poserLesAvis();
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,180)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,180));});

  await connecter(page,'agent.essai@exemple.test');
  console.log('\n== La restitution, côté équipe');
  verifier(await ouvrirLesAvis(page),'les avis s\'ouvrent depuis la campagne');
  const v = await page.evaluate(()=>{
    const voiles=[...document.querySelectorAll('.voile')];
    const d=voiles[voiles.length-1];
    return d?{
      chiffres:[...d.querySelectorAll('.chiffre')].map(c=>c.innerText.replace(/\n/g,' ')),
      familles:[...d.querySelectorAll('.avis-famille .bloc-tete')].map(h=>h.innerText.trim()),
      mesures:d.querySelectorAll('.avis-mesure').length,
      verbatims:d.querySelectorAll('.avis-verbatim').length,
      cites:[...d.querySelectorAll('.avis-verbatim cite')].map(c=>c.innerText.trim()),
      texte:d.innerText,
    }:{};
  });
  console.log('    ', (v.chiffres||[]).join(' | '));
  verifier((v.familles||[]).length===8,'les huit familles (le test lui-même compris)',(v.familles||[]).join('/'));
  verifier((v.verbatims||0)>0,`les réponses libres sont rendues (${v.verbatims})`);
  verifier(/récurrences/.test(v.texte||''),'mot pour mot, sans résumé');
  verifier(/recommandation sur 10/.test((v.chiffres||[]).join(' ')),'le score de recommandation est calculé');
  verifier(/fourchette acceptable/.test((v.chiffres||[]).join(' ')),'et la fourchette de prix');
  verifier(!(v.cites||[]).length && !/Karim|Sonia|Marc|Ines|Hugo|Leila|Infirmier|Comptable/.test(v.texte||''),'l\'équipe ne voit ni nom ni profil à côté des réponses',(v.cites||[])[0]||'');
  verifier(/3 testeurs ont répondu/.test((v.chiffres||[]).join(' ')),'trois réponses comptées',(v.chiffres||[]).join(' | '));
  verifier(/sans nom ni profil/.test(v.texte||''),'la feuille dit l anonymat');
  verifier(!/Un agenda avec des objectifs/.test(v.texte||''),'les premières impressions, deux seulement, restent cachées');

  console.log('\n== Chez le client');
  const nav2=await chromium.launch();
  const cl=await (await nav2.newContext({viewport:{width:1500,height:1100}})).newPage();
  await connecter(cl,'camille.essai@exemple.test');
  verifier(await ouvrirLesAvis(cl),'le client ouvre aussi les avis');
  const c = await cl.evaluate(()=>{
    const voiles=[...document.querySelectorAll('.voile')];
    const d=voiles[voiles.length-1];
    return d?{
      cites:[...d.querySelectorAll('.avis-verbatim cite')].map(x=>x.innerText.trim()),
      verbatims:d.querySelectorAll('.avis-verbatim').length,
      texte:d.innerText,
    }:{};
  });
  verifier((c.verbatims||0)>0,'il voit les réponses libres');
  verifier(/récurrences/.test(c.texte||''),'intégrales, comme l\'équipe');
  verifier(!(c.cites||[]).some(x=>/Karim|Sonia|Marc|Ines|Hugo|Leila/.test(x)),'mais AUCUN nom de testeur',(c.cites||[])[0]||'');
  verifier(!(c.cites||[]).length && !/Testeur \d/.test(c.texte||''),'ni numéro de testeur sous une citation',(c.cites||[])[0]||'');
  verifier(!/Infirmier|Comptable|25-34|45-54/.test(c.texte||''),'ni profil (âge, métier) à côté des réponses');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
