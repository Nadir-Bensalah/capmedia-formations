/* ==========================================================================
   CAPMEDIA CLIENT HUB · le vivier de testeurs à l'épreuve

   Un testeur n'est pas un client : il n'est membre d'aucun projet, il ne
   voit que son propre travail, et son accès tient à la revendication que
   la connexion lui pose. L'inscrire ne lui ouvre donc ni les demandes ni
   les devis, et c'est vérifié ailleurs (qa-testeur.cjs).

   Ce qui se garde ici est la recopie du profil public : le client doit
   savoir QUI a donné un avis sans savoir QUI c'est. Firestore sert un
   document entier ou rien, une règle ne masque pas un champ, d'où la
   recopie. Si elle laissait passer le nom, personne ne le verrait avant
   que le client l'ait sous les yeux.

   Retirer un testeur ferme son accès mais ne supprime pas ses passages :
   ils sont la mémoire de la campagne, et les effacer falsifierait le
   rapport.

     (émulateurs, semis, campagne en cours)
     node fonctions-suivi/outils/qa-vivier.cjs
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

(async()=>{
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push('PAGE: '+e.message.slice(0,180)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,180));});

  await connecter(page,'agent.essai@exemple.test');
  /* La clé d'administration, que l'interface demande dans une feuille : on
     la pose comme un humain qui l'a déjà saisie une fois. */
  await page.evaluate(()=>{ try { localStorage.setItem('suivi:cle-admin','cle-essai-locale'); } catch(e){} });
  await page.reload({waitUntil:'domcontentloaded'}); await pause(3500);
  await aller(page,'/tests',null,'Tests');
  await pause(1600);

  console.log('\n== La section Testeurs');
  const v = await page.evaluate(()=>({
    section: [...document.querySelectorAll('.section-tete h2')].map(h=>h.innerText.trim()),
    bouton: !!document.querySelector('[data-nouveau-testeur]'),
    lignes: document.querySelectorAll('[data-action="ouvrir-testeur"]').length,
  }));
  verifier(v.section.includes('Testeurs'),'la section existe',v.section.join('/'));
  verifier(v.bouton,'le bouton d\'inscription est là');
  console.log(`     ${v.lignes} testeurs au vivier`);

  console.log('\n== Inscrire quelqu\'un');
  const avant = ((await lire('testeurs?pageSize=50'))||{}).documents||[];
  await page.click('[data-nouveau-testeur]'); await pause(1200);
  const f = await page.evaluate(()=>({
    feuille: !!document.querySelector('.feuille'),
    champs: ['#t-prenom','#t-email','#t-sexe','#t-age','#t-fonction','#t-aisance'].filter(s=>document.querySelector(s)).length,
    plateformes: document.querySelectorAll('[data-plateforme-t]').length,
    projets: document.querySelectorAll('[data-projet]').length,
  }));
  verifier(f.feuille,'la feuille s\'ouvre');
  verifier(f.champs===6,'les six champs du profil',`${f.champs}`);
  verifier(f.plateformes===3,'les trois plateformes, à cocher',`${f.plateformes}`);
  verifier(f.projets>0,'et ses projets',`${f.projets}`);

  /* Sans mobile : le calcul de repartition ne saurait pas quoi lui donner. */
  await page.fill('#t-prenom','Nadia');
  await page.fill('#t-email','nadia.qa@essai.test');
  await page.click('[data-enregistrer]'); await pause(900);
  const t1 = await page.evaluate(()=>((document.querySelector('.toasts')||{}).innerText||'').trim());
  verifier(/ce qu.il teste/i.test(t1),'sans plateforme, c\'est refusé',t1||'(rien)');

  /* Web ET Android : un testeur peut couvrir les deux, ou le web seul. */
  await page.check('[data-plateforme-t="android"]'); await pause(200);
  await page.check('[data-plateforme-t="web"]'); await pause(200);
  await page.selectOption('#t-sexe','femme');
  await page.selectOption('#t-age','25-34');
  await page.fill('#t-fonction','Testeuse QA');
  await page.selectOption('#t-aisance','À l\'aise');
  const pr = await page.$('[data-projet]'); if (pr) await pr.check();
  await page.click('[data-enregistrer]'); await pause(3200);

  const apres = ((await lire('testeurs?pageSize=50'))||{}).documents||[];
  /* Compter les fiches ne dit rien : une passe précédente laisse la sienne,
     et réinscrire la même adresse met à jour au lieu d'ajouter. On vérifie
     donc que CE testeur est là, ce qui est la vraie question. */
  const sien = apres.find((d) => (((d.fields||{}).email||{}).stringValue||'') === 'nadia.qa@essai.test');
  verifier(!!sien, `le testeur est inscrit (${apres.length} au vivier)`);
  verifier(!!sien && (((sien.fields||{}).actif||{}).booleanValue) === true, 'et il est actif');
  const nadia = apres.find(d=>((d.fields.email||{}).stringValue||'')==='nadia.qa@essai.test');
  verifier(!!nadia,'avec la bonne adresse');
  if (nadia) {
    verifier((nadia.fields.mobile||{}).stringValue==='android','son mobile est déduit');
    const pf = ((nadia.fields.plateformes||{}).arrayValue||{}).values||[];
    verifier(pf.length===2,'ses deux plateformes sont retenues',pf.map(x=>x.stringValue).join(','));
    verifier(pf.some(x=>x.stringValue==='web'),'dont le web');
    const p = ((nadia.fields.profil||{}).mapValue||{}).fields||{};
    verifier((p.fonction||{}).stringValue==='Testeuse QA','son profil aussi');
    verifier(((nadia.fields.projets||{}).arrayValue||{}).values?.length>0,'et son projet');
  }
  const visible = await page.evaluate(()=>/Nadia/.test(document.body.innerText));
  verifier(visible,'elle apparaît sans recharger');

  console.log('\n== Le profil public est recopié');
  await pause(3000);
  const uid = nadia ? nadia.name.split('/').pop() : '';
  const pub = uid ? await lire(`testeurs/${uid}/public/profil`) : null;
  verifier(!!pub,'le serveur a recopié son profil');
  if (pub) {
    const ch = Object.keys(pub.fields||{});
    verifier(!ch.includes('prenom') && !ch.includes('email'),'sans son nom ni son adresse',ch.join(','));
    verifier(ch.includes('age') && ch.includes('fonction'),'mais avec ce qui éclaire son avis');
  }

  console.log('\n== La modifier, puis la retirer');
  await page.click(`[data-action="ouvrir-testeur"][data-id="${uid}"]`); await pause(1200);
  const lect = await page.evaluate(()=>{const e=document.querySelector('#t-email');return e?e.hasAttribute('readonly'):null;});
  verifier(lect===true,'son adresse est en lecture seule');
  await page.fill('#t-fonction','Testeuse QA senior');
  await page.click('[data-enregistrer]'); await pause(2600);
  const maj = await lire(`testeurs/${uid}`);
  verifier((((maj.fields.profil||{}).mapValue||{}).fields||{}).fonction?.stringValue==='Testeuse QA senior','la modification est enregistrée');

  await page.click(`[data-action="ouvrir-testeur"][data-id="${uid}"]`); await pause(1200);
  await page.click('[data-retirer]'); await pause(900);
  const oui = await page.$$('.voile [data-oui]');
  if (oui.length) { await oui[oui.length-1].click(); await pause(2800); }
  /* Le retrait garde la fiche : les passages d'une campagne portent
     l'identifiant du testeur, et sans elle le rapport ne sait plus de qui
     il parle. Ce qui doit partir, c'est l'accès et le profil public. */
  const fiche = await lire(`testeurs/${uid}`);
  verifier(!!fiche, 'la fiche du testeur reste, pour la mémoire de la campagne');
  verifier(fiche && (((fiche.fields||{}).actif||{}).booleanValue) === false, 'mais il est retiré du vivier');
  await pause(2500);
  verifier(!(await lire(`testeurs/${uid}/public/profil`)),'et son profil public part avec son accès');

  /* Ménage : la fiche d'essai ne reste pas au vivier du banc. */
  {
    const j = ((await lire('testeurs?pageSize=50'))||{}).documents||[];
    for (const d of j) {
      if ((((d.fields||{}).email||{}).stringValue||'') === 'nadia.qa@essai.test') {
        await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});
      }
    }
  }

  console.log('\n'+(soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'));
  console.log('Erreurs JS :', err.length?err.slice(0,4).join('\n  '):'aucune');
  await nav.close();
  process.exit(soucis.length?1:0);
})();
