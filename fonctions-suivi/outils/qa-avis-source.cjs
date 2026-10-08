require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
/* ==========================================================================
   CAPMEDIA TEST · une seule source pour le questionnaire, et les remarques

   Ce que le testeur se voit demander, ce que l'équipe lit dans le Cockpit
   et ce que le client lit dans le Hub doivent être la MÊME liste. La suite
   charge la source (questionnaire-avis.js) et compare chaque écran à elle,
   question par question, au lieu de compter des familles.

   Puis les remarques libres : le testeur en écrit depuis « Mon avis » et
   depuis la feuille d'un scénario ; l'équipe les lit avec le nom, le client
   sous « Testeur N », sans nom.

     (émulateurs, semer-suivi.mjs, semer-campagne.mjs)
     node fonctions-suivi/outils/qa-avis-source.cjs
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
  await page.fill('#code',await dernierCode(email));await pause(5000);};
const aller=async(page,hash,attendu)=>{for(let i=0;i<8;i++){
  await page.evaluate(h=>{location.hash=h;},hash);
  await page.evaluate(()=>window.dispatchEvent(new HashChangeEvent('hashchange')));
  await pause(1600);
  if(!attendu||await page.$(attendu))return true;}return false;};
const soucis=[];const ok=m=>console.log('  ok     '+m);
const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const memes=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ecartListes=(vu,attendu)=>{const m=attendu.filter(x=>!vu.includes(x)), t=vu.filter(x=>!attendu.includes(x));return `${m.length?`manque : ${m.slice(0,3).join(' | ')}`:''}${t.length?` en trop : ${t.slice(0,3).join(' | ')}`:''}`;};

const S=(v)=>({stringValue:String(v)}), N=(v)=>({integerValue:String(v)}), T=(d)=>({timestampValue:d.toISOString()});
const poser=(chemin,champs)=>fetch(bdd(chemin),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields:champs})});
const NOMS=/Karim|Sonia|Marc|Ines|Hugo|Leila/;
const derniere=()=>{const v=[...document.querySelectorAll('.voile')];return v[v.length-1]||null;};

(async()=>{
  const Q = await import(pathToFileURL(path.join(__dirname,'../../agence/suivi/assets/js/questionnaire-avis.js')).href);
  const libelles=(quand)=>Q.questionsAvis(quand).map(x=>x.q.libelle);
  const TOUTES=libelles(), POUR_CLIENT=Q.questionsAvis().filter(x=>!x.q.equipe&&!x.f.equipe).map(x=>x.q.libelle);

  /* Le jeu : Sonia n'a fait que ses premiers pas (pas un avis), Marc a
     répondu à la facilité et au libre, noté le test, et laissé une remarque
     à l'ancienne dans son appréciation. Deux remarques libres. */
  const camp=await lire('projets/atelier/campagnes/c-oct');
  const uids=((((camp||{}).fields||{}).testeurs||{}).arrayValue||{}).values?.map(v=>v.stringValue)||[];
  if(uids.length<3) throw new Error('la campagne c-oct du semis doit avoir au moins trois testeurs (semer-campagne.mjs)');
  const [KARIM,SONIA,MARC]=uids;
  /* Les clés de Karim (« scénario__plateforme ») au modèle commun ; une
     campagne d'avant le plan donnait une liste de références. */
  const affKarim=((((camp.fields.affectation||{}).mapValue||{}).fields||{})[KARIM])||{};
  const refsKarim=((affKarim.arrayValue||((((affKarim.mapValue||{}).fields||{}).cles||{}).arrayValue)||{}).values||[]).map(v=>v.stringValue);
  const idDe=(cle)=>String(cle||'').split('__')[0];
  const platDe=(cle)=>String(cle||'').split('__')[1]||'ios';
  await vider('projets/atelier/campagnes/c-oct/appreciations');
  await vider('projets/atelier/campagnes/c-oct/remarques');
  await poser(`projets/atelier/campagnes/c-oct/appreciations/${SONIA}`,{accueil:T(new Date()),testeur:S(SONIA)});
  await poser(`projets/atelier/campagnes/c-oct/appreciations/${MARC}`,{avisRendus:{mapValue:{fields:{apres:{booleanValue:true}}}},testeur:S(MARC)});
  /* Les réponses, anonymes depuis le 08/10/2026 : trois (le seuil), comme
     les range hubAvisTesteur, sans nom. */
  await vider('projets/atelier/campagnes/c-oct/avisAnonymes/apres/reponses');
  for(const [i,g] of [[1,'Le calendrier du mois, sans hésiter.'],[2,'Les rappels.'],[3,'La liste de courses.']])
    await poser(`projets/atelier/campagnes/c-oct/avisAnonymes/apres/reponses/r${i}`,{moment:S('apres'),reponses:{mapValue:{fields:{'facilite.recommande':N(7),'facilite.trouve':N(3),'libre.garder':S(g)}}}});
  await poser('projets/atelier/campagnes/c-oct/avisAnonymes/apres',{recus:N(3)});
  /* La note du test et l'ancienne remarque, rangées à part (equipe/retour) :
     l'équipe seule les lit. */
  await poser(`projets/atelier/campagnes/c-oct/appreciations/${MARC}/equipe/retour`,{testeur:S(MARC),
    noteTest:{mapValue:{fields:{note:N(4),commentaire:S('Il manquait le lien TestFlight au début.'),le:T(new Date())}}},
    remarques:{arrayValue:{values:[{mapValue:{fields:{texte:S('Ancienne remarque écrite après la fin.'),le:T(new Date())}}}]}},
  });
  await poser(`projets/atelier/campagnes/c-oct/remarques/r-marc`,{testeur:S(MARC),texte:S('La police du calendrier est trop petite.'),scenario:S(idDe(refsKarim[0])||'DI-01'),plateforme:S(platDe(refsKarim[0])),cree:T(new Date())});
  await poser(`projets/atelier/campagnes/c-oct/remarques/r-sonia`,{testeur:S(SONIA),texte:S('Une application agréable à prendre en main.'),cree:T(new Date(Date.now()-60000))});

  const nav=await chromium.launch();
  const err=[];
  const ouvrir=async(largeur)=>{const p=await (await nav.newContext({viewport:{width:largeur,height:1000}})).newPage();
    p.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,180)));p.on('console',m=>{if(m.type()==='error'&&!/permission|Failed to load resource/i.test(m.text()))err.push(m.text().slice(0,180));});return p;};

  const lirePage=async(page)=>page.evaluate(()=>({
    chapo:((document.querySelector('#avis .chapo')||{}).innerText||''),
    chiffres:[...document.querySelectorAll('#avis .chiffre')].map(c=>c.innerText.replace(/\s+/g,' ')),
    questions:[...document.querySelectorAll('#avis .avis-question')].map(q=>q.innerText.trim()),
    avis:((document.querySelector('#avis')||{}).innerText||''),
    remarques:[...document.querySelectorAll('#remarques .avis-verbatim')].map(b=>({texte:(b.querySelector('p')||{}).innerText||'',cite:(b.querySelector('cite')||{}).innerText||''})),
  }));

  console.log('\n== Le Cockpit restitue exactement les questions de la source');
  const eq=await ouvrir(1500);
  await connecter(eq,'agent.essai@exemple.test');
  await aller(eq,'/tests?projet=atelier','#avis');
  await eq.waitForSelector('#remarques .avis-verbatim',{timeout:20000}).catch(()=>null);
  const e1=await lirePage(eq);
  verifier(memes(e1.questions,TOUTES),`les ${TOUTES.length} questions, dans l'ordre de la source`,ecartListes(e1.questions,TOUTES));
  verifier(e1.chapo.includes(`${Q.resumeQuestionnaire().total} questions`),'le compte annoncé est celui de la source',e1.chapo.slice(0,90));
  verifier(e1.chiffres.some(c=>/^3 testeurs ont répondu/.test(c)),'le compte vient des avis rendus, pas des premiers pas',e1.chiffres.join(' | '));
  verifier(/7\.0 \/ 10/.test(e1.avis),'la note de recommandation se lit');
  verifier(/4\.0 \/ 5/.test(e1.avis),'la note du test se lit aussi, puisqu\'elle est demandée');
  verifier(/lien TestFlight/.test(e1.avis),'l\'équipe lit le commentaire sur le test');
  verifier(e1.remarques.length===3,'trois remarques : deux libres et l\'ancienne',`${e1.remarques.length}`);
  verifier(e1.remarques.some(r=>/police du calendrier/.test(r.texte)&&/Marc/.test(r.cite)&&r.cite.includes(idDe(refsKarim[0])||'DI-01')),'avec le prénom et le scénario',(e1.remarques[0]||{}).cite);
  verifier(e1.remarques.some(r=>/Ancienne remarque/.test(r.texte)&&/après le test/.test(r.cite)),'l\'ancienne reste lisible, marquée comme telle');

  console.log('\n== Le Hub : les mêmes questions, sans nom');
  const cl=await ouvrir(1500);
  await connecter(cl,'camille.essai@exemple.test');
  await aller(cl,'/tests?projet=atelier','#avis');
  await cl.waitForSelector('#remarques .avis-verbatim',{timeout:20000}).catch(()=>null);
  const c1=await lirePage(cl);
  verifier(memes(c1.questions,POUR_CLIENT),`les ${POUR_CLIENT.length} questions de la source, sans celle réservée à l'équipe`,ecartListes(c1.questions,POUR_CLIENT));
  verifier(c1.chiffres.some(c=>/^3 testeurs ont répondu/.test(c)),'le même compte que l\'équipe',c1.chiffres.join(' | '));
  verifier(!/lien TestFlight/.test(c1.avis)&&!/4\.0 \/ 5/.test(c1.avis)&&!/Le test lui-même/.test(c1.avis),'la note du test et ses mots ne sortent pas de l\'équipe (M2)');
  const lu=await cl.evaluate(async(uid)=>{try{const m=await import('/suivi/assets/js/noyau.js');const d=await m.getDoc(m.doc(m.bdd,'projets','atelier','campagnes','c-oct','appreciations',uid,'equipe','retour'));return d.exists()?'lu':'vide';}catch(e){return String(e.code||e.message);}},MARC);
  verifier(/permission/.test(lu),'et le client ne peut pas la lire par la base non plus',lu);
  verifier(c1.remarques.length===2,'les deux remarques libres, pas l\'ancienne écrite pour l\'équipe',`${c1.remarques.length}`);
  verifier(c1.remarques.length>0&&c1.remarques.every(r=>/Testeur \d/.test(r.cite)&&!NOMS.test(r.cite)),'chacune sous « Testeur N », jamais un prénom',c1.remarques.map(r=>r.cite).join(' | '));
  verifier(/police du calendrier/.test(c1.remarques.map(r=>r.texte).join(' ')),'mot pour mot');

  console.log('\n== Le testeur : le même questionnaire, et ses remarques');
  const te=await ouvrir(430);
  await connecter(te,'karim.testeur@essai.test');
  await te.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete',{timeout:20000}).catch(()=>null);
  if(await te.$('.accueil')){await te.click('.accueil [data-accueil="passer"]');await te.waitForSelector('.accueil',{state:'detached'}).catch(()=>null);}
  await aller(te,'/avis','[data-avis-page="avant"]');
  const page=await te.evaluate(()=>(document.querySelector('.page')||{}).innerText||'');
  const q=Q.resumeQuestionnaire();
  verifier(page.includes(`${q.avant} questions`)&&page.includes(`${q.apres} questions`),'« Mon avis » annonce les comptes de la source',page.slice(0,160).replace(/\n/g,' '));
  const etiquettes=async()=>te.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();return v?[...v.querySelectorAll('.avis-famille .etiquette-champ')].map(x=>x.innerText.replace(/\s*\(facultatif\)\s*$/,'').trim()):[];});
  await te.click('[data-avis-page="avant"]');await pause(1300);
  const avant=await etiquettes();
  verifier(memes(avant,libelles('avant')),'la première impression pose les questions « avant » de la source',ecartListes(avant,libelles('avant')));
  await te.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();v&&v.querySelector('[data-fermer]').click();});await pause(900);
  await te.click('[data-avis-page="apres"]');await pause(1500);
  const apres=await etiquettes();
  verifier(memes(apres,libelles('apres')),'l\'avis de fin pose les questions « après » de la source',ecartListes(apres,libelles('apres')));
  await te.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();v&&v.querySelector('[data-fermer]').click();});await pause(900);

  /* Une remarque en général, puis une sur un scénario choisi dans la liste. */
  verifier(!!(await te.$('#remarque-texte')),'« Mon avis » offre d\'écrire une remarque, avant même d\'avoir fini');
  await te.fill('#remarque-texte','Le mode sombre éblouit sur l\'écran des réglages.');
  await te.click('[data-remarque]');await pause(2500);
  verifier(refsKarim.length>=2,'Karim a au moins deux scénarios dans son affectation',`${refsKarim.length}`);
  if(refsKarim[1]){await te.fill('#remarque-texte','Ce scénario parle d\'un bouton que je ne trouve pas.');await te.selectOption('#remarque-scenario',refsKarim[1]);await te.click('[data-remarque]');await pause(2500);}
  const lireMiennes=async()=>{const j=await lire('projets/atelier/campagnes/c-oct/remarques?pageSize=50');return ((j&&j.documents)||[]).map(d=>({id:d.name.split('/').pop(),testeur:((d.fields.testeur||{}).stringValue),texte:((d.fields.texte||{}).stringValue)||'',scenario:((d.fields.scenario||{}).stringValue)||'',plateforme:((d.fields.plateforme||{}).stringValue)||'',cree:((d.fields.cree||{}).timestampValue)||''})).filter(r=>r.testeur===KARIM);};
  let miennes=await lireMiennes();
  verifier(miennes.some(r=>/mode sombre/.test(r.texte)&&!r.scenario&&r.cree),'la remarque en général est enregistrée, datée par le serveur',JSON.stringify(miennes).slice(0,160));
  if(refsKarim[1]) verifier(miennes.some(r=>/bouton que je ne trouve pas/.test(r.texte)&&r.scenario===idDe(refsKarim[1])&&r.plateforme===platDe(refsKarim[1])),'celle sur un scénario porte l identifiant du scénario et sa plateforme');
  const affichees=await te.evaluate(()=>[...document.querySelectorAll('#remarques .remarque')].map(x=>x.innerText));
  verifier(affichees.some(t=>/mode sombre/.test(t)),'elle apparaît aussitôt dans sa liste, sans recharger',`${affichees.length}`);
  verifier(!affichees.some(t=>/police du calendrier|agréable à prendre/.test(t)),'il ne voit pas celles des autres');

  /* Depuis la feuille du premier scénario. */
  await aller(te,'/','.testeur-tete');
  const caseUn=await te.$('.tb--testeur [data-case]');
  const cleUn=caseUn?await caseUn.getAttribute('data-case'):'';
  if(caseUn){await caseUn.click();await pause(1300);}
  const lien=await te.$('[data-remarque-scenario]');
  verifier(!!lien,'la feuille d\'un scénario offre « Une remarque sur ce scénario »');
  if(lien){
    await lien.click();await pause(900);
    await te.fill('#remarque-feuille','Le texte attendu ne dit pas où se trouve le bouton.');
    await te.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();v.querySelector('[data-valider]').click();});await pause(2500);
    miennes=await lireMiennes();
    const r=miennes.find(x=>/où se trouve le bouton/.test(x.texte));
    verifier(!!r&&r.scenario===idDe(cleUn)&&r.plateforme===platDe(cleUn),'elle part avec l identifiant du scénario et sa plateforme, sans rien recopier',r?`${r.scenario} ${r.plateforme}`:'absente');
  }

  console.log('\n== La note du test en terminant : les questions de la source');
  for(const ref of refsKarim){
    await poser(`projets/atelier/campagnes/c-oct/passages/${KARIM}__${ref}`,{scenario:S(idDe(ref)),testeur:S(KARIM),plateforme:S(platDe(ref)),resultat:S('reussi'),commentaire:S(''),preuves:{arrayValue:{values:[]}},contexte:{mapValue:{fields:{}}}});
  }
  await te.reload({waitUntil:'domcontentloaded'});await pause(5000);
  if(await te.$('.accueil')){await te.click('.accueil [data-accueil="passer"]').catch(()=>null);await pause(800);}
  /* L'avis de fin d'abord (obligatoire depuis le 08/10/2026), puis « J'ai terminé ». */
  const avisFin=await te.$('[data-fin-avis] [data-avis="apres"]');
  verifier(!!avisFin,'tout déroulé, l avis de fin est demandé avant « J ai terminé »');
  if(avisFin){
    await avisFin.click();
    await te.waitForSelector('.voile [data-question] button[data-avis]',{timeout:15000});
    await te.evaluate(()=>document.querySelectorAll('.voile [data-question]').forEach(g=>{const b=g.querySelectorAll('button[data-avis]');if(b.length)b[Math.min(3,b.length-1)].click();}));
    await te.click('.voile [data-envoyer]');
    await te.waitForSelector('[data-terminer]',{timeout:20000}).catch(()=>null);
  }
  const terminer=await te.$('[data-terminer]');
  verifier(!!terminer,'« J\'ai terminé » est proposé une fois tout déroulé et l avis envoyé');
  if(terminer){
    await terminer.click();await pause(1200);
    const vu=await te.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();return v?[...v.querySelectorAll('.etiquette-champ')].map(x=>x.innerText.replace(/\s*\(facultatif\)\s*$/,'').trim()):[];});
    verifier(memes(vu,libelles('fin')),'la note du test pose les questions « en terminant » de la source',ecartListes(vu,libelles('fin')));
    await te.evaluate(()=>{const v=[...document.querySelectorAll('.voile')].pop();v&&v.querySelector('[data-fermer]').click();});
  }

  console.log('\n== L\'équipe voit arriver les remarques du testeur, en direct');
  await pause(1500);
  const e2=await lirePage(eq);
  verifier(e2.remarques.length>=e1.remarques.length+2,'les nouvelles remarques sont là sans recharger',`${e1.remarques.length} puis ${e2.remarques.length}`);
  verifier(e2.remarques.some(r=>/mode sombre/.test(r.texte)&&/Karim/.test(r.cite)),'avec le prénom du testeur');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close();
  process.exit(soucis.length?1:0);
})().catch((e)=>{console.error(e);process.exit(1);});
