require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · le questionnaire d'appréciation, côté testeur

   Les 173 scénarios disent si l'application MARCHE. Ceci dit si elle
   PLAÎT, et c'est la seconde question qui décide du chiffre d'affaires.

   Depuis le 08/10/2026, les réponses partent sans nom (hubAvisTesteur) :
   un document par moment, sans identifiant, et seulement « a répondu »
   sur l'appréciation. Gardé ici : les deux moments arrivent chacun de
   leur côté, rien n'est perdu, rien ne dit qui ; et l'avis de fin est
   demandé AVANT « J'ai terminé ».

   Cette suite attend un testeur qui n'a RIEN coché : le premier bandeau ne
   s'affiche qu'avant le premier passage. Lancée après une autre suite qui
   en a consigné un, elle ne trouve pas le bandeau et tout tombe d'un coup.

     (émulateurs, semis, campagne en cours avec six testeurs, aucun passage)
     node fonctions-suivi/outils/qa-avis.cjs
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
  await page.fill('#code',await dernierCode(email));await pause(5000);};
const soucis=[];const ok=m=>console.log('  ok     '+m);
const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));

(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:430,height:932}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,180)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,180));});

  await connecter(page,'karim.testeur@essai.test');
  /* La première fois, l'accueil passe devant tout : cette suite ne le teste pas (qa-espace-testeur), elle va droit à la campagne. */
  await page.waitForSelector('.accueil [data-accueil="passer"], .testeur-tete', { timeout: 20000 }).catch(() => null);
  if (await page.$('.accueil')) { await page.click('.accueil [data-accueil="passer"]'); await page.waitForSelector('.accueil', { state: 'detached' }); }

  console.log('\n== Avant de commencer');
  /* Depuis le 03/10/2026, la première impression est proposée dans le
     geste suivant, en tête de page, à côté de « Commencer ». */
  const bandeau = await page.evaluate(()=>({
    bouton: !!document.querySelector('.t-suite [data-avis="avant"]'),
  }));
  verifier(bandeau.bouton,'le geste suivant propose la première impression');

  await page.click('[data-avis="avant"]'); await pause(1300);
  verifier(/ne se retrouve pas/.test(await page.evaluate(()=>((document.querySelector('.voile')||{}).innerText||''))),'et dit pourquoi maintenant');
  const f = await page.evaluate(()=>({
    feuille: !!document.querySelector('.feuille'),
    familles: [...document.querySelectorAll('.avis-famille .bloc-tete')].map(h=>h.innerText.trim()),
    questions: document.querySelectorAll('.avis-famille .groupe').length,
  }));
  verifier(f.feuille,'la feuille s\'ouvre');
  verifier(f.familles.length===1,'elle ne montre que la première impression',f.familles.join('/'));
  verifier(f.questions===3,'ses trois questions',`${f.questions}`);
  verifier(/sans votre nom/i.test(await page.evaluate(()=>((document.querySelector('.voile [data-avis-anonyme]')||{}).innerText||''))),'la feuille dit que l avis part sans nom');

  await page.click('[data-avis="compris"][data-valeur="4"]'); await pause(300);
  await page.fill('#av-sert-a-quoi','À ne plus repousser ce que je prévois.');
  await page.click('[data-envoyer]'); await pause(2500);

  const a1 = await lire(`projets/atelier/campagnes/c-oct/appreciations?pageSize=20`);
  const d1 = ((a1&&a1.documents)||[])[0];
  verifier(!!d1,'« a répondu » est posé sur son appréciation');
  if (d1) {
    const ch = Object.keys(d1.fields||{});
    verifier(!ch.some(k=>k.includes('.')),'mais aucune réponse n y est écrite',ch.join(','));
  }
  const r1 = ((await lire('projets/atelier/campagnes/c-oct/avisAnonymes/avant/reponses?pageSize=20'))||{}).documents||[];
  const rf = r1.length ? ((r1[0].fields.reponses||{}).mapValue||{}).fields||{} : {};
  verifier(r1.length===1 && Object.keys(r1[0].fields).sort().join(',')==='moment,reponses','la première impression est rangée à part, sans identifiant');
  verifier((rf['impression.compris']||{}).integerValue==='4' && /repousser/.test((rf['impression.sert-a-quoi']||{}).stringValue||''),'l échelle et le texte y sont');
  const apres = await page.evaluate(()=>!!document.querySelector('[data-avis="avant"]'));
  verifier(!apres,'le bandeau ne redemande plus');

  console.log('\n== Tout dérouler, puis l\'avis complet');
  /* Cocher tous ses passages d'un coup, par la base : l'interface est
     deja eprouvee ailleurs, ici on veut atteindre l'etat « tout fait ».
     Depuis le 03/10/2026, ses passages sont des cles « scenario du plan,
     plateforme » (affectation.{uid}.cles). */
  const camp = await lire('projets/atelier/campagnes/c-oct');
  const uid = d1 ? d1.name.split('/').pop() : '';
  const aff = (((camp.fields.affectation||{}).mapValue||{}).fields||{})[uid];
  const refs = ((((((aff||{}).mapValue||{}).fields||{}).cles||{}).arrayValue||{}).values)||[];
  verifier(refs.length>0,`son affectation lui confie ${refs.length} passages`);
  for (const r of refs) {
    const cle = r.stringValue; const [scen, plat] = cle.split('__');
    await fetch(bdd(`projets/atelier/campagnes/c-oct/passages/${uid}__${cle}`), { method:'PATCH', headers:{...prop,'Content-Type':'application/json'},
      body: JSON.stringify({ fields:{ scenario:{stringValue:scen}, testeur:{stringValue:uid}, plateforme:{stringValue:plat}, resultat:{stringValue:'reussi'}, commentaire:{stringValue:''}, preuves:{arrayValue:{values:[]}}, contexte:{mapValue:{fields:{}}}, cree:{timestampValue:new Date().toISOString()}, maj:{timestampValue:new Date().toISOString()} } }) });
  }
  await page.reload({waitUntil:'domcontentloaded'}); await pause(4500);
  const fin = await page.evaluate(()=>({
    chapo:(document.querySelector('.chapo')||{}).innerText||'',
    bouton:(document.querySelector('.fin-test [data-terminer]')||{}).innerText||'',
    texte:(document.querySelector('.fin-test')||{}).innerText||'',
  }));
  console.log('    ', fin.chapo);
  verifier(/100 %/.test(fin.chapo),'la jauge est pleine',fin.chapo);
  /* L'avis de fin est obligatoire : il passe avant « J'ai terminé ». */
  verifier(!fin.bouton && await page.$('.fin-test [data-avis="apres"]'),'le questionnaire complet est demandé avant « J ai terminé »',fin.bouton);
  verifier(/tout est déroulé/i.test(fin.texte),'et la page le dit',fin.texte.slice(0,50));

  await page.click('.fin-test [data-avis="apres"]'); await page.waitForSelector('[data-avis="belle"]',{timeout:15000}).catch(()=>{}); await pause(800);
  const f2 = await page.evaluate(()=>({
    familles: [...document.querySelectorAll('.avis-famille .bloc-tete')].map(h=>h.innerText.trim()),
    prix: document.querySelectorAll('[data-avis-champ*="cher"],[data-avis-champ*="affaire"],[data-avis-champ*="suspect"]').length,
    note10: document.querySelectorAll('[data-avis="recommande"]').length,
    impression: [...document.querySelectorAll('.avis-famille .bloc-tete')].some(h=>/impression/i.test(h.innerText)),
  }));
  verifier(f2.familles.length===6,'les six familles de la fin',f2.familles.join(' / '));
  verifier(!f2.impression,'la première impression n\'est pas redemandée');
  verifier(f2.prix===4,'les quatre questions de prix sont là',`${f2.prix}`);
  verifier(f2.note10===11,'la note va de 0 à 10',`${f2.note10}`);

  /* Les questions fermées sont requises : une réponse à chacune, puis nos
     valeurs à nous. */
  await page.evaluate(()=>document.querySelectorAll('.voile [data-question]').forEach(g=>{const b=g.querySelectorAll('button[data-avis]');if(b.length)b[0].click();}));
  await page.click('[data-avis="belle"][data-valeur="4"]'); await pause(200);
  await page.click('[data-avis="recommande"][data-valeur="8"]'); await pause(200);
  await page.click('[data-avis="paierait"][data-valeur="Oui"]'); await pause(200);
  await page.fill('#av-trop-cher','12');
  await page.fill('#av-bonne-affaire','4');
  await page.fill('#av-garder','La vue du jour, les récurrences, la synchronisation.');
  await page.click('[data-envoyer]'); await pause(2800);

  const r2 = ((await lire('projets/atelier/campagnes/c-oct/avisAnonymes/apres/reponses?pageSize=20'))||{}).documents||[];
  const f3 = r2.length ? ((r2[0].fields.reponses||{}).mapValue||{}).fields||{} : {};
  verifier(r2.length===1,'l avis de fin est rangé, à part de la première impression');
  verifier((f3['esthetique.belle']||{}).integerValue==='4','le nouvel avis y est');
  verifier(Number(((f3['argent.trop-cher']||{}).integerValue)||((f3['argent.trop-cher']||{}).doubleValue))===12,'les prix sont enregistrés');
  verifier(/récurrences/.test((f3['libre.garder']||{}).stringValue||''),'le texte libre aussi');
  verifier(((await lire('projets/atelier/campagnes/c-oct/avisAnonymes/avant/reponses?pageSize=20'))||{}).documents.length===1,'la première impression est conservée');
  const a2 = await lire(`projets/atelier/campagnes/c-oct/appreciations?pageSize=20`);
  const d2 = ((a2&&a2.documents)||[])[0];
  const rendus = d2 ? (((d2.fields.avisRendus||{}).mapValue||{}).fields||{}) : {};
  verifier((rendus.avant||{}).booleanValue===true && (rendus.apres||{}).booleanValue===true,'l appréciation dit « a répondu » aux deux moments, et rien d autre');
  verifier(await page.$('.fin-test [data-terminer]'),'« J ai terminé » apparaît, une fois l avis envoyé');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close();
  process.exit(soucis.length?1:0);
})();
