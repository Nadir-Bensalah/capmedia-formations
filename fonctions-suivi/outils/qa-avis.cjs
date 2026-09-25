require('./lib/garde-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · le questionnaire d'appréciation, côté testeur

   Les 173 scénarios disent si l'application MARCHE. Ceci dit si elle
   PLAÎT, et c'est la seconde question qui décide du chiffre d'affaires.

   Le piège gardé ici est muet : les deux moments écrivent dans le même
   document, et un enregistrement qui remplacerait au lieu de fusionner
   effacerait la première impression sans que personne s'en aperçoive.
   Or c'est le seul regard qu'on ne peut pas retrouver ensuite.

   Cette suite attend un testeur qui n'a RIEN coché : le premier bandeau ne
   s'affiche qu'avant le premier passage. Lancée après une autre suite qui
   en a consigné un, elle ne trouve pas le bandeau et tout tombe d'un coup.

     (émulateurs, semis, campagne en cours avec six testeurs, aucun passage)
     node fonctions-suivi/outils/qa-avis.cjs
   ========================================================================== */

const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
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

  console.log('\n== Avant de commencer');
  const bandeau = await page.evaluate(()=>({
    texte: (document.querySelector('.avis-appel')||{}).innerText||'',
    bouton: !!document.querySelector('[data-avis="avant"]'),
  }));
  verifier(bandeau.bouton,'le bandeau demande la première impression');
  verifier(/ne se retrouve pas/.test(bandeau.texte),'et dit pourquoi maintenant',bandeau.texte.slice(0,60));

  await page.click('[data-avis="avant"]'); await pause(1300);
  const f = await page.evaluate(()=>({
    feuille: !!document.querySelector('.feuille'),
    familles: [...document.querySelectorAll('.avis-famille .bloc-tete')].map(h=>h.innerText.trim()),
    questions: document.querySelectorAll('.avis-famille .groupe').length,
  }));
  verifier(f.feuille,'la feuille s\'ouvre');
  verifier(f.familles.length===1,'elle ne montre que la première impression',f.familles.join('/'));
  verifier(f.questions===3,'ses trois questions',`${f.questions}`);

  await page.click('[data-avis="compris"][data-valeur="4"]'); await pause(300);
  await page.fill('#av-sert-a-quoi','À ne plus repousser ce que je prévois.');
  await page.click('[data-envoyer]'); await pause(2500);

  const a1 = await lire(`projets/atelier/campagnes/c-oct/appreciations?pageSize=20`);
  const d1 = ((a1&&a1.documents)||[])[0];
  verifier(!!d1,'l\'avis est enregistré');
  if (d1) {
    const ch = Object.keys(d1.fields||{});
    verifier(ch.includes('impression.compris'),'l\'échelle est retenue',ch.join(','));
    verifier(ch.includes('impression.sert-a-quoi'),'le texte aussi');
  }
  const apres = await page.evaluate(()=>!!document.querySelector('[data-avis="avant"]'));
  verifier(!apres,'le bandeau ne redemande plus');

  console.log('\n== Tout dérouler, puis l\'avis complet');
  await page.click('[data-sur="ios"]'); await pause(800);
  /* Cocher les 43 d'un coup, par la base : l'interface est deja eprouvee
     ailleurs, ici on veut atteindre l'etat « tout fait ». */
  const camp = await lire('projets/atelier/campagnes/c-oct');
  const uid = d1 ? d1.name.split('/').pop() : '';
  const aff = (((camp.fields.affectation||{}).mapValue||{}).fields||{})[uid];
  const refs = ((aff||{}).arrayValue||{}).values||[];
  for (const r of refs) {
    const ref = r.stringValue;
    await fetch(bdd(`projets/atelier/campagnes/c-oct/passages/${uid}__${ref}`), { method:'PATCH', headers:{...prop,'Content-Type':'application/json'},
      body: JSON.stringify({ fields:{ scenario:{stringValue:ref}, testeur:{stringValue:uid}, plateforme:{stringValue:'ios'}, resultat:{stringValue:'ok'}, commentaire:{stringValue:''}, preuves:{arrayValue:{values:[]}}, contexte:{mapValue:{fields:{}}} } }) });
  }
  await page.reload({waitUntil:'domcontentloaded'}); await pause(4500);
  const fin = await page.evaluate(()=>({
    chapo:(document.querySelector('.chapo')||{}).innerText||'',
    bouton: !!document.querySelector('[data-avis="apres"]'),
    texte:(document.querySelector('.avis-appel')||{}).innerText||'',
  }));
  console.log('    ', fin.chapo);
  verifier(/100 %/.test(fin.chapo),'la jauge est pleine',fin.chapo);
  verifier(fin.bouton,'le questionnaire complet est proposé');
  verifier(/tout déroulé/i.test(fin.texte),'et il le remercie',fin.texte.slice(0,50));

  await page.click('[data-avis="apres"]'); await pause(1500);
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

  await page.click('[data-avis="belle"][data-valeur="4"]'); await pause(200);
  await page.click('[data-avis="recommande"][data-valeur="8"]'); await pause(200);
  await page.click('[data-avis="paierait"][data-valeur="Oui"]'); await pause(200);
  await page.fill('#av-trop-cher','12');
  await page.fill('#av-bonne-affaire','4');
  await page.fill('#av-garder','La vue du jour, les récurrences, la synchronisation.');
  await page.click('[data-envoyer]'); await pause(2800);

  const a2 = await lire(`projets/atelier/campagnes/c-oct/appreciations?pageSize=20`);
  const d2 = ((a2&&a2.documents)||[])[0];
  if (d2) {
    const ch = Object.keys(d2.fields||{});
    verifier(ch.includes('impression.compris'),'la première impression est conservée',`${ch.length} champs`);
    verifier(ch.includes('esthetique.belle'),'et le nouvel avis ajouté');
    verifier(ch.includes('argent.trop-cher'),'les prix sont enregistrés');
    verifier(ch.includes('libre.garder'),'le texte libre aussi');
    console.log(`     ${ch.length} champs au total`);
  } else dire('l\'avis complet n\'est pas enregistré');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close();
  process.exit(soucis.length?1:0);
})();
