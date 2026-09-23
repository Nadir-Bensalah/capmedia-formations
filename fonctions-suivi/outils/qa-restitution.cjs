/* ==========================================================================
   CAPMEDIA CLIENT HUB · la restitution des avis

   Le client doit savoir QUI a donné un avis sans savoir QUI c'est. Un avis
   de 22 ans et un avis de 55 ans ne disent pas la même chose, et masquer
   le profil le priverait de l'essentiel ; mais il n'a aucune raison de
   connaître le nom de qui teste pour lui.

   Les réponses libres sont rendues mot pour mot, jamais résumées : c'est
   là qu'est la vraie information, et un résumé la tue.

     (émulateurs, semis, campagne avec des avis déposés)
     node fonctions-suivi/outils/qa-restitution.cjs
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
  await aller(page,'/tests?projet=atelier','.chiffres-tests','Tests');
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

(async()=>{
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
  verifier((v.familles||[]).length===7,'les sept familles',(v.familles||[]).join('/'));
  verifier((v.verbatims||0)>0,`les réponses libres sont rendues (${v.verbatims})`);
  verifier(/récurrences/.test(v.texte||''),'mot pour mot, sans résumé');
  verifier(/recommandation sur 10/.test((v.chiffres||[]).join(' ')),'le score de recommandation est calculé');
  verifier(/fourchette acceptable/.test((v.chiffres||[]).join(' ')),'et la fourchette de prix');
  verifier((v.cites||[]).some(c=>/Karim|Sonia|Marc|Ines|Hugo|Leila/.test(c)),'l\'équipe voit les noms',(v.cites||[])[0]);

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
  verifier((c.cites||[]).some(x=>/Testeur \d/.test(x)),'ils sont numérotés',(c.cites||[])[0]||'');
  verifier(/ans/.test((c.cites||[]).join(' ')),'et leur profil reste visible',(c.cites||[])[0]||'');

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close(); await nav2.close();
  process.exit(soucis.length?1:0);
})();
