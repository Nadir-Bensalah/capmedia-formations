require('./lib/garde-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · les projets à faire

   Ce que Nadir a demandé le 24/09/2026 : un onglet « Projets à faire » dans
   son cockpit, pour noter ses idées et ne pas les oublier, et un geste pour
   basculer un projet actuel en projet à faire, et retour.

   On note une idée comme il le ferait, on la relit, on la bascule dans
   les deux sens, et on vérifie à chaque fois la base ET l'écran : le
   drapeau, la note hors du projet, le compte de la barre, la liste des
   projets, le fil d'activité interne, et le client qui ne voit rien de
   tout cela.

     (émulateurs avec les fonctions, semis de semer-suivi, serveur local sur 8787)
     node fonctions-suivi/outils/qa-a-faire.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const CLE=process.env.ADMIN_CLE_ESSAI||'cle-essai-locale';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const poser=async(chemin,fields,masque)=>fetch(bdd(chemin)+(masque?`?${masque.map(m=>`updateMask.fieldPaths=${m}`).join('&')}`:''),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields})});
const S=(v)=>({stringValue:String(v)}), B=(v)=>({booleanValue:v});
const champ=(d,k)=>(((d||{}).fields||{})[k]||{});
const str=(d,k)=>champ(d,k).stringValue||'';
const bool=(d,k)=>champ(d,k).booleanValue===true;
const soucis=[];const ok=m=>console.log('  ok     '+m);const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const attendre=async(fn,n=30,ms=500)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(ms);}return null;};
const dernierCode=async(e)=>{for(let i=0;i<40;i++){const j=await lire('envois?pageSize=200');const p=((j&&j.documents)||[]).filter(d=>str(d,'modele')==='code'&&((((d.fields||{}).a||{}).arrayValue||{}).values||[]).some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===e));if(p.length){p.sort((x,y)=>new Date(((y.fields.cree||{}).timestampValue)||0)-new Date(((x.fields.cree||{}).timestampValue)||0));const v=(((p[0].fields.variables||{}).mapValue||{}).fields)||{};if(v.code&&v.code.stringValue)return v.code.stringValue;}await pause(300);}return'';};
const connecter=async(page,email)=>{
  await vider('connexions');await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
  await page.fill('#email',email);await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
  await page.fill('#code',await dernierCode(email));
  await page.waitForURL(/\/suivi\/(hub|cockpit|testeur)/,{timeout:40000}).catch(()=>{});
  await pause(2500);
};
const aller=async(page,hash,sel)=>{
  for(let i=0;i<6;i++){
    await page.evaluate(h=>{location.hash=h;},hash);
    if(!sel||await page.waitForSelector(sel,{timeout:5000}).then(()=>true).catch(()=>false))break;
  }
  await pause(500);
};
/* Le compte gris de l'entrée de la barre, ou 0 quand il n'y en a pas. */
const compteBarre=(page,chemin)=>page.evaluate(c=>{const a=document.querySelector(`#lat-corps .lat-lien[data-chemin="${c}"]`);if(!a)return -1;const n=a.querySelector('.compte:not(.vif)');return n?Number(n.textContent):0;},chemin);
const confirmerModale=async(page)=>{await page.waitForSelector('.voile [data-oui]',{timeout:8000});const b=await page.$$('.voile [data-oui]');await b[b.length-1].click();};
const activites=async(pid)=>{const j=await lire('activite?pageSize=300');return ((j&&j.documents)||[]).filter(d=>str(d,'projet')===pid).map(d=>({texte:str(d,'texte'),visibilite:str(d,'visibilite')}));};

const NOTE=[
  '## 1. Vision','',
  'Une fortune **virtuelle**, vécue quelques minutes par jour.','',
  '> Et si vous aviez 10 000 000 € aujourd hui ?','',
  '+ 42 800 € · Dividendes','− 8 500 € · Loyer','',
  '---','',
  '## 2. Le compte','',
  '- Patrimoine total','- Disponible','- Immobilier','',
  '### Détail','',
  '<img src=x onerror="window.__piege=1">','',
  '## 3. Sécurité','',
  'Rien ne sort de la simulation.',
].join('\n');

(async()=>{
  const nav=await chromium.launch();
  const ctx=await nav.newContext({viewport:{width:1440,height:900}});
  const page=await ctx.newPage();
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(e.message));

  console.log('\n== L onglet, vide au départ');
  await connecter(page,'agent.essai@exemple.test');
  await page.evaluate(k=>{try{localStorage.setItem('suivi:cle-admin',k);}catch(e){}},CLE);
  await page.reload({waitUntil:'domcontentloaded'}); await pause(2500);
  const entrees=await page.$$eval('#lat-corps .lat-lien',as=>as.map(a=>a.dataset.chemin));
  verifier(entrees.includes('/a-faire'),'la barre porte « Projets à faire »');
  verifier(entrees.indexOf('/a-faire')===entrees.indexOf('/projets')+1,'juste sous « Projets », dans le portefeuille');
  verifier(await compteBarre(page,'/a-faire')===0,'sans compte tant que rien n est rangé');
  /* Le compte ne se lit qu'une fois les projets chargés, et stable : lu
     trop tôt, il vaut encore zéro. */
  let actifsAvant=-1;
  await attendre(async()=>{const n=await compteBarre(page,'/projets');const stable=n>0&&n===actifsAvant;actifsAvant=n;return stable;},40,700);
  await aller(page,'#/a-faire','.page-tete h1');
  verifier((await page.textContent('.page-tete h1'))==='Projets à faire','la page a son titre');
  verifier(!!(await page.$('.vide [data-noter]')),'la page vide propose de noter une idée');

  console.log('\n== Noter une idée');
  await page.click('.vide [data-noter]');
  await page.waitForSelector('#af-forme');
  await page.click('.voile [type="submit"]'); await pause(400);
  verifier(!!(await page.$('#af-forme .erreur-champ')),'sans nom, la feuille refuse et le dit');
  await page.fill('#af-nom','Wealth Simulator');
  await page.fill('#af-description','Vivre avec une fortune virtuelle.');
  await page.click('#af-forme .choix-plateformes label:has(input[value="ios"])');
  await page.click('#af-forme .choix-plateformes label:has(input[value="android"])');
  await page.fill('#af-texte',NOTE);
  await page.click('.voile [type="submit"]');
  const surDetail=await attendre(async()=>/^#\/a-faire\/[\w-]+$/.test(await page.evaluate(()=>location.hash)),40,300);
  verifier(!!surDetail,'noter mène à la page de l idée');
  const pid=(await page.evaluate(()=>location.hash)).split('/').pop();
  const p=await lire(`projets/${pid}`);
  verifier(bool(p,'aFaire'),'le projet porte le drapeau « à faire »');
  verifier(bool(p,'interne'),'c est un projet à moi, sans client');
  verifier(str(p,'ref')==='WEALTH','sa référence vient du nom',str(p,'ref'));
  verifier(str(p,'statut')==='brouillon','il reste en préparation',str(p,'statut'));
  verifier(bool(p,'silence'),'en sourdine : aucun e-mail ne partira');
  verifier(JSON.stringify((((champ(p,'plateformes').arrayValue)||{}).values||[]).map(v=>v.stringValue))==='["ios","android"]','les plateformes cochées sont posées');
  verifier(!('idee' in ((p||{}).fields||{})) && !('texte' in ((p||{}).fields||{})),'la note n est PAS dans la fiche du projet, qu un client membre lirait');
  const idee=await lire(`idees/${pid}`);
  verifier(str(idee,'texte')===NOTE,'la note est dans « idees », mot pour mot');

  console.log('\n== La note se lit');
  await page.waitForSelector('.af-note h2',{timeout:10000}).catch(()=>{});
  verifier(await page.$$eval('.af-note h2',x=>x.length)===3,'trois titres de premier rang');
  verifier(await page.$$eval('.af-sommaire [data-ancre]',x=>x.length)===3,'le sommaire les liste');
  verifier(await page.$$eval('.af-note blockquote',x=>x.length)===1,'la phrase mise en avant');
  verifier(await page.$$eval('.af-note ul li',x=>x.length)===3,'la liste et ses trois lignes');
  verifier(await page.$$eval('.af-note hr',x=>x.length)===1,'le séparateur');
  verifier(await page.$$eval('.af-note strong',x=>x.length)===1,'le gras');
  verifier(await page.$$eval('.af-note img',x=>x.length)===0 && !(await page.evaluate(()=>window.__piege)),'une balise dans la note reste du texte, rien ne s exécute');
  verifier(/42 800 € · Dividendes/.test(await page.textContent('.af-note')),'les opérations gardent leur signe, sans devenir une liste');
  verifier((await page.textContent('.af-tete .surtitre'))==='Projet à faire','la page dit ce que c est');
  verifier(!!(await page.$('[data-basculer="actuel"]')),'le geste pour la passer en projet actuel est là');
  /* Une fenêtre basse, pour que le dernier titre soit sous la ligne de
     flottaison avant le clic : sinon le test ne prouverait rien. */
  await page.setViewportSize({width:1440,height:420}); await page.evaluate(()=>window.scrollTo(0,0)); await pause(300);
  verifier(await page.evaluate(()=>document.getElementById('note-3').getBoundingClientRect().top>window.innerHeight),'avant le clic, la troisième partie est hors de vue');
  const hashAvant=await page.evaluate(()=>location.hash);
  await page.click('.af-sommaire [data-ancre="note-3"]'); await pause(900);
  verifier((await page.evaluate(()=>location.hash))===hashAvant,'le sommaire ne touche pas à l adresse (le routeur la lirait comme une page)');
  verifier(await page.evaluate(()=>{const r=document.getElementById('note-3').getBoundingClientRect();return r.top>=0&&r.top<window.innerHeight;}),'et amène le titre sous les yeux');
  await page.setViewportSize({width:1440,height:900});

  console.log('\n== La liste, la barre, le portefeuille');
  await aller(page,'#/a-faire','.af-carte');
  verifier(await page.$$eval('.af-carte',x=>x.length)===1,'une carte');
  const carte=await page.textContent('.af-carte');
  verifier(/Wealth Simulator/.test(carte)&&/Vivre avec une fortune virtuelle/.test(carte),'la carte porte le nom et la phrase');
  verifier(/Une fortune virtuelle, vécue/.test(carte),'et le début de la note, sans ses signes');
  verifier(/3 parties/.test(carte)&&/min de lecture/.test(carte),'et sa taille : parties, temps de lecture');
  verifier(await compteBarre(page,'/a-faire')===1,'la barre compte 1');
  {const n=await compteBarre(page,'/projets');verifier(n===actifsAvant,'le compte des projets en cours ne bouge pas',`${n} contre ${actifsAvant}`);}
  await aller(page,'#/projets','.filtres');
  await page.click('[data-filtre="maison"]'); await pause(400);
  verifier(!/Wealth Simulator/.test(await page.textContent('.page')),'l idée n est pas dans « Mes projets »');
  await page.click('[data-filtre="tous"]'); await pause(400);
  verifier(!/Wealth Simulator/.test(await page.textContent('.page')),'ni dans « Tous »');
  verifier(/1 projet à faire rangé à part/.test(await page.textContent('.chapo')),'le chapeau le signale, avec un lien');

  console.log('\n== Même nom, autre référence');
  await aller(page,'#/a-faire?noter=1','#af-forme');
  verifier(!!(await page.$('#af-forme')),'« Noter une idée » depuis la recherche ouvre la feuille');
  verifier((await page.evaluate(()=>location.hash))==='#/a-faire','et l adresse perd sa demande');
  await page.fill('#af-nom','Wealth Simulator');
  await page.click('.voile [type="submit"]');
  await attendre(async()=>{const h=await page.evaluate(()=>location.hash);return /^#\/a-faire\/[\w-]+$/.test(h)&&!h.endsWith(pid);},40,300);
  const pid2=(await page.evaluate(()=>location.hash)).split('/').pop();
  verifier(pid2!==pid && str(await lire(`projets/${pid2}`),'ref')==='WEALTH2','la référence prise, la suivante est choisie',str(await lire(`projets/${pid2}`),'ref'));
  verifier(!!(await page.$('.vide [data-modifier]')),'une idée sans note propose de l écrire');

  console.log('\n== Reprendre la note, en direct');
  await aller(page,`#/a-faire/${pid}`,'.af-note');
  await page.click('.af-tete [data-modifier]');
  await page.waitForSelector('#af-texte');
  verifier((await page.inputValue('#af-texte'))===NOTE,'la feuille rouvre la note entière');
  await page.fill('#af-texte',`${NOTE}\n\n## 4. Monétisation\n\nFreemium.`);
  await page.click('.voile [type="submit"]');
  const idee2=await attendre(async()=>{const d=await lire(`idees/${pid}`);return /## 4\. Monétisation/.test(str(d,'texte'))?d:null;},30,400);
  verifier(/## 4\. Monétisation/.test(str(idee2,'texte')),'la note reprise est enregistrée');
  verifier(str(idee2,'par').length>0,'avec son auteur');
  verifier(await attendre(async()=>(await page.$$eval('.af-note h2',x=>x.length))===4,20,300),'la page montre la quatrième partie sans recharger');
  await poser(`idees/${pid}`,{texte:S(`${NOTE}\n\n## 4. Monétisation\n\n## 5. Écrit ailleurs`),par:S('autre')});
  verifier(await attendre(async()=>(await page.$$eval('.af-note h2',x=>x.length))===5,20,300),'une note reprise ailleurs arrive en direct');

  console.log('\n== Passer en projet actuel');
  await page.click('[data-basculer="actuel"]');
  await confirmerModale(page);
  const surProjet=await attendre(async()=>(await page.evaluate(()=>location.hash))===`#/projets/${pid}`,30,300);
  verifier(!!surProjet,'on arrive sur la fiche du projet');
  const p3=await lire(`projets/${pid}`);
  verifier(!bool(p3,'aFaire'),'le drapeau est levé');
  verifier(str(p3,'statut')==='cadrage','l idée démarre en cadrage',str(p3,'statut'));
  verifier(!!(await lire(`idees/${pid}`)),'la note reste');
  verifier(await attendre(async()=>(await compteBarre(page,'/a-faire'))===1,20,300),'la barre repasse à 1 (la seconde idée)');
  verifier(!(await page.$('.etiquette--lien')),'la fiche ne porte plus l étiquette « Projet à faire »');
  /* Le déclencheur de l'émulateur met parfois vingt secondes à passer. */
  const fil=await attendre(async()=>{const a=await activites(pid);return a.some(x=>/sorti le projet des projets à faire/.test(x.texte))?a:null;},90,500);
  const ligne=(fil||[]).find(a=>/sorti le projet des projets à faire/.test(a.texte));
  verifier(!!ligne && ligne.visibilite==='interne','le fil d activité le note, en interne',JSON.stringify(fil));
  await aller(page,'#/projets','.filtres');
  await page.click('[data-filtre="maison"]'); await pause(400);
  verifier(/Wealth Simulator/.test(await page.textContent('.page')),'il est dans « Mes projets »');

  console.log('\n== Ranger un projet client, puis le ramener');
  await aller(page,'#/projets/atelier','[data-action="menu-projet"]');
  await page.click('[data-action="menu-projet"]'); await pause(300);
  const choix=await page.$$eval('.menu [data-cle]',b=>b.map(x=>x.dataset.cle));
  verifier(choix.includes('Ranger dans les projets à faire')&&!choix.includes('Passer en projet actuel'),'le menu du projet propose de le ranger');
  await page.click('.menu [data-cle="Ranger dans les projets à faire"]');
  await page.waitForSelector('.voile [data-oui]');
  verifier(/Le client garde son accès/.test(await page.textContent('.voile')),'la confirmation dit que le client garde son accès');
  await confirmerModale(page);
  verifier(await attendre(async()=>bool(await lire('projets/atelier'),'aFaire'),20,300),'le projet client porte le drapeau');
  const pa=await lire('projets/atelier');
  verifier(str(pa,'statut')==='en-cours','son statut n a pas bougé',str(pa,'statut'));
  verifier(await attendre(async()=>!!(await page.$('.etiquette--lien')),20,300),'la fiche porte l étiquette « Projet à faire », qui mène à sa note');
  verifier(await attendre(async()=>(await compteBarre(page,'/projets'))===actifsAvant-1,20,300),'il quitte le compte des projets en cours');
  await aller(page,'#/a-faire','.af-carte');
  const cartes=await page.$$eval('.af-carte',x=>x.map(c=>c.textContent));
  verifier(cartes.some(c=>/Atelier/.test(c)&&/Mis de côté · Atelier Nord/.test(c)),'il est dans les projets à faire, « mis de côté » chez son client');

  const client=await (await nav.newContext({viewport:{width:1440,height:900}})).newPage();
  const erreursClient=[]; client.on('pageerror',e=>erreursClient.push(e.message));
  await connecter(client,'camille.essai@exemple.test');
  await aller(client,'#/projets/atelier','.page-tete h1');
  verifier(/Atelier/.test(await client.textContent('.page-tete h1')),'Camille ouvre toujours son projet');
  verifier(!(await client.$('.etiquette--lien')) && !/Projet à faire/.test(await client.textContent('.page')),'et ne voit rien du rangement');
  const refusIdee=await client.evaluate(async()=>{try{const m=await import('./assets/js/noyau.js');await m.getDoc(m.doc(m.bdd,'idees','atelier'));return 'lu';}catch(e){return String(e.code||e.message);}});
  verifier(/permission/.test(refusIdee),'et ne peut pas lire une note, même en la demandant',refusIdee);

  await aller(page,'#/projets/atelier','[data-action="menu-projet"]');
  await page.click('[data-action="menu-projet"]'); await pause(300);
  await page.click('.menu [data-cle="Passer en projet actuel"]');
  await confirmerModale(page);
  verifier(await attendre(async()=>!bool(await lire('projets/atelier'),'aFaire'),20,300),'le geste inverse le ramène');
  verifier(str(await lire('projets/atelier'),'statut')==='en-cours','sans toucher à son statut (il n était pas en préparation)');
  verifier(await attendre(async()=>(await compteBarre(page,'/projets'))===actifsAvant,20,300),'le compte des projets en cours revient');

  console.log('\n== Archiver une idée');
  await aller(page,`#/a-faire/${pid2}`,'[data-plus]');
  await page.click('[data-plus]'); await pause(300);
  await page.click('.menu [data-cle="Archiver"]');
  await confirmerModale(page);
  verifier(await attendre(async()=>bool(await lire(`projets/${pid2}`),'archive'),20,300),'l idée part aux archives');
  verifier(await attendre(async()=>(await page.evaluate(()=>location.hash))==='#/a-faire',20,300),'et l on revient à la liste');
  verifier(await attendre(async()=>(await compteBarre(page,'/a-faire'))===0,20,300),'la barre ne la compte plus');

  console.log('\n== Sur un téléphone');
  const tel=page; await tel.setViewportSize({width:390,height:844});
  await aller(tel,`#/a-faire/${pid}`,'.af-note');
  await pause(800);
  verifier(await tel.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'la note ne déborde pas en largeur');
  verifier(await tel.evaluate(()=>{const s=document.querySelector('.af-sommaire');return !!s&&getComputedStyle(s).position==='static';}),'le sommaire passe en rangée au-dessus du texte');

  verifier(!erreurs.length,'aucune erreur dans la console de l équipe',erreurs.join(' | '));
  verifier(!erreursClient.length,'aucune erreur chez le client',erreursClient.join(' | '));
  await nav.close();
  console.log(`\n${soucis.length?`${soucis.length} ÉCART(S)`:'tout est conforme'}`);
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
