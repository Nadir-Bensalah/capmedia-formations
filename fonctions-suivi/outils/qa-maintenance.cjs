/* ==========================================================================
   CAPMEDIA CLIENT HUB · la maintenance continue

   Le client demande un forfait depuis son espace. L'équipe le configure :
   modalités, prix, jours ; puis ouvre des séquences, consigne des
   journées, pose et tranche des évolutions. Le client lit tout, propose
   une évolution, et ne peut rien manipuler d'autre. Chaque changement
   d'état part en lettre au bon destinataire.

     (émulateurs avec les fonctions, semis)
     node fonctions-suivi/outils/qa-maintenance.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
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
const champ=(d,k)=>(((d||{}).fields||{})[k]||{});
const str=(d,k)=>champ(d,k).stringValue||'';
const num=(d,k)=>Number(champ(d,k).integerValue||champ(d,k).doubleValue||0);
const texte=(page,sel)=>page.evaluate((s)=>{const e=document.querySelector(s);return e?e.innerText:'';},sel);
const existe=(page,sel)=>page.evaluate((s)=>!!document.querySelector(s),sel);
const attendre=async(fn,n=25)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(800);}return null;};
/* Une lettre en file, pour un destinataire et un événement donnés. */
const lettre=(dest,evenement)=>attendre(async()=>{const j=await lire('envois?pageSize=200');return ((j&&j.documents)||[]).find(d=>str(d,'modele')==='maintenance'&&(((champ(d,'a').arrayValue||{}).values)||[]).some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===dest)&&((((champ(d,'variables').mapValue||{}).fields)||{}).evenement||{}).stringValue===evenement);});
const soumettre=async(page)=>{await page.click('button[type="submit"][form="ed-forme"]');await pause(2200);};
const dossier=async()=>(((await lire('projets/atelier/maintenance?pageSize=50'))||{}).documents||[]);

(async()=>{
  await vider('projets/atelier/maintenance');
  const nav=await chromium.launch();
  const err=[];
  const cl=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  cl.on('pageerror',e=>err.push('CLIENT: '+e.message.slice(0,160)));
  cl.on('console',m=>{if(m.type()==='error')err.push('client: '+m.text().slice(0,160));});
  await connecter(cl,'camille.essai@exemple.test');

  console.log('\n== Le client demande un forfait');
  verifier(await cl.evaluate(()=>[...document.querySelectorAll('.lat a')].some(a=>/Maintenance/.test(a.innerText))),'l entrée Maintenance est dans sa barre');
  await aller(cl,'/maintenance','#forfait'); await pause(1500);
  verifier(/Pas encore de forfait/.test(await texte(cl,'#forfait')),'la page dit qu il n y a pas encore de forfait');
  verifier(/un nombre de jours de travail par mois/.test(await texte(cl,'#forfait')),'et explique ce que c est, en français');
  verifier(await existe(cl,'[data-demander-forfait]'),'le bouton « Demander » est là');
  verifier(!(await existe(cl,'[data-configurer-forfait]')),'pas de bouton « Configurer » chez le client');
  await cl.click('[data-demander-forfait]'); await pause(900);
  await cl.click('.voile [data-envoyer]'); await pause(700);
  verifier(await existe(cl,'.voile #mf-message'),'sans message, la feuille reste ouverte');
  await cl.fill('.voile #mf-message',"Que l'application reste à jour sur iPhone et Android, et pouvoir ajouter une petite fonction de temps en temps.");
  await cl.selectOption('.voile #mf-rythme','Chaque mois');
  await cl.click('.voile [data-envoyer]'); await pause(2500);
  const contrat=await lire('projets/atelier/maintenance/contrat');
  verifier(!!contrat,'le contrat est en base');
  verifier(str(contrat,'statut')==='demande'&&str(contrat,'genre')==='contrat','en « demandé »');
  const dm=((champ(contrat,'demande').mapValue||{}).fields)||{};
  verifier(/reste à jour/.test((dm.message||{}).stringValue||'')&&(dm.rythme||{}).stringValue==='Chaque mois','avec le message et le rythme');
  verifier(((((dm.par||{}).mapValue||{}).fields||{}).email||{}).stringValue==='camille.essai@exemple.test','signé de Camille');
  await pause(1500);
  verifier(/reste à jour/.test(await texte(cl,'#demande')),'la page montre sa demande, sans recharger');
  verifier(/Nous préparons une proposition/.test(await texte(cl,'#demande')),'et dit qu une proposition arrive');
  verifier(/1 \/ 4/.test(await texte(cl,'#pas-forfait')),'le premier pas est coché',await texte(cl,'#pas-forfait .frise-sous'));
  verifier(!(await existe(cl,'[data-statut-forfait], [data-configurer-forfait], [data-nouvelle-sequence]')),'et rien à configurer chez lui');
  verifier(!!(await lettre('contact@capmedia.app','demande')),'une lettre part à l équipe');

  console.log('\n== L équipe répond par une proposition');
  const eq=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  eq.on('pageerror',e=>err.push('EQUIPE: '+e.message.slice(0,160)));
  eq.on('console',m=>{if(m.type()==='error')err.push('equipe: '+m.text().slice(0,160));});
  await connecter(eq,'agent.essai@exemple.test');
  await eq.evaluate(()=>{try{localStorage.setItem('suivi:cle-admin','cle-essai-locale');}catch(e){}});
  verifier(await eq.evaluate(()=>[...document.querySelectorAll('.lat a')].some(a=>/Maintenance/.test(a.innerText))),'l entrée Maintenance est dans le cockpit');
  await aller(eq,'/maintenance','.section'); await pause(1500);
  verifier(/Demandes à traiter/.test(await texte(eq,'.page'))&&/Atelier/.test(await texte(eq,'.section--alerte')),'la demande est en tête de la page de tous les projets');
  await aller(eq,'/maintenance?projet=atelier','#demande'); await pause(1500);
  verifier(/reste à jour/.test(await texte(eq,'#demande')),'l équipe lit la demande mot pour mot');
  verifier(await existe(eq,'#demande [data-configurer-forfait]'),'et un bouton pour y répondre');
  await eq.click('#demande [data-configurer-forfait]'); await pause(1100);
  verifier(await existe(eq,'#ed-formule'),'la feuille du forfait s ouvre');
  await soumettre(eq);
  verifier(await existe(eq,'#ed-formule'),'sans nom de formule, elle reste ouverte');
  await eq.fill('#ed-formule','Sérénité');
  await eq.selectOption('#ed-statut','proposition');
  await eq.fill('#ed-montant','900');
  await eq.fill('#ed-jours','2');
  await eq.selectOption('#ed-reconduction','mensuelle');
  await eq.selectOption('#ed-devis','d-qa').catch(()=>{});
  await eq.fill('#ed-horaires','Du lundi au vendredi, de 9 h à 18 h');
  await eq.fill('#ed-delaiReponse','Sous 24 h ouvrées');
  await eq.fill('#ed-delaiCorrection','Sous 48 h ouvrées');
  await eq.fill('#ed-inclus','Corrections de défauts\nMises à jour iOS et Android');
  await eq.fill('#ed-exclus','Refonte graphique');
  await eq.fill('#ed-modalites','Les jours non consommés se reportent sur la période suivante, dans la limite d\'une période.');
  await soumettre(eq);
  const c2=await lire('projets/atelier/maintenance/contrat');
  verifier(str(c2,'statut')==='proposition'&&str(c2,'formule')==='Sérénité'&&num(c2,'montant')===900&&num(c2,'jours')===2,'le contrat porte la proposition',`${str(c2,'statut')} ${str(c2,'formule')} ${num(c2,'montant')} ${num(c2,'jours')}`);
  verifier(((champ(c2,'inclus').arrayValue||{}).values||[]).length===2,'deux points compris');
  verifier(/reste à jour/.test(((((champ(c2,'demande').mapValue||{}).fields||{}).message)||{}).stringValue||''),'la demande du client est restée intacte');
  await pause(1200);
  verifier(/Sérénité/.test(await texte(eq,'.forfait-titre')),'la carte porte la formule');
  const chiffres=await texte(eq,'.forfait-chiffres');
  verifier(/900/.test(chiffres)&&/HT par mois/.test(chiffres)&&/jours de travail par mois/.test(chiffres),'et ses chiffres',chiffres.replace(/\n/g,' '));
  verifier(/2 \/ 4/.test(await texte(eq,'#pas-forfait')),'deux pas sur quatre');
  verifier(/Corrections de défauts/.test(await texte(eq,'#modalites'))&&/Refonte graphique/.test(await texte(eq,'#modalites'))&&/Sous 24 h/.test(await texte(eq,'#modalites')),'les modalités sont écrites');
  verifier(/D-2026-014/.test(await texte(eq,'#modalites')),'le devis est rattaché');
  verifier(!!(await lettre('camille.essai@exemple.test','proposition')),'une lettre part au client');

  console.log('\n== Le statut se change depuis la pastille');
  await eq.click('[data-statut-forfait]'); await pause(600);
  const choix=await eq.evaluate(()=>[...document.querySelectorAll('.menu [data-cle]')].map(b=>b.dataset.cle));
  verifier(choix.length===5,'le menu propose les cinq statuts',choix.join(','));
  await eq.click('.menu [data-cle="actif"]'); await pause(2200);
  verifier(str(await lire('projets/atelier/maintenance/contrat'),'statut')==='actif','le forfait passe « en cours »');
  verifier(/4 \/ 4/.test(await texte(eq,'#pas-forfait')),'les quatre pas sont cochés');
  verifier(!!(await lettre('camille.essai@exemple.test','actif')),'et le client reçoit une lettre');

  console.log('\n== Une séquence, une journée, une évolution');
  await eq.click('[data-nouvelle-sequence]'); await pause(1000);
  await eq.fill('#ed-titre','Octobre 2026');
  await eq.selectOption('#ed-statut','en-cours');
  await eq.fill('#ed-jours','2');
  await soumettre(eq);
  const seq=(await dossier()).find(d=>str(d,'genre')==='sequence');
  verifier(!!seq&&str(seq,'titre')==='Octobre 2026'&&str(seq,'statut')==='en-cours','la séquence est en base');
  const sid=seq?seq.name.split('/').pop():'';
  await pause(1000);
  verifier(await existe(eq,`.frise[data-sequence="${sid}"]`),'et sur la page');
  await eq.click(`[data-nouvelle-journee="${sid}"]`); await pause(1000);
  verifier(await eq.evaluate((s)=>document.querySelector('#ed-sequence')&&document.querySelector('#ed-sequence').value===s,sid),'la journée naît dans sa séquence');
  await eq.selectOption('#ed-duree','0.5');
  await eq.fill('#ed-objet','Mise à jour iOS 27');
  await soumettre(eq);
  const jr=(await dossier()).find(d=>str(d,'genre')==='journee');
  verifier(!!jr&&num(jr,'duree')===0.5&&str(jr,'statut')==='faite'&&str(jr,'sequence')===sid,'la journée est en base, faite, une demi-journée');
  await pause(1200);
  verifier(/0,5/.test(await texte(eq,`.frise[data-sequence="${sid}"] .frise-sous`)),'la séquence compte sa demi-journée',await texte(eq,`.frise[data-sequence="${sid}"] .frise-sous`));
  verifier(/une demi-journée/.test(await texte(eq,'#journal'))&&/Mise à jour iOS 27/.test(await texte(eq,'#journal')),'le journal la liste');
  verifier(/0,5 \/ 2/.test(await texte(eq,'.forfait-chiffres')),'la carte du forfait aussi');
  await eq.click('[data-nouvelle-evolution]'); await pause(1000);
  await eq.fill('#ed-titre','Widget iOS sur l\'écran d\'accueil');
  await eq.selectOption('#ed-statut','acceptee');
  await eq.fill('#ed-estimation','1');
  await eq.selectOption('#ed-sequence',sid).catch(()=>{});
  await soumettre(eq);
  const ev=(await dossier()).find(d=>str(d,'genre')==='evolution');
  verifier(!!ev&&str(ev,'origine')==='equipe'&&str(ev,'statut')==='acceptee','l évolution est en base, venue de l équipe');
  const eid=ev?ev.name.split('/').pop():'';
  await pause(1000);
  await eq.click(`[data-statut-evolution="${eid}"]`); await pause(600);
  await eq.click('.menu [data-cle="livree"]'); await pause(2000);
  verifier(str(await lire(`projets/atelier/maintenance/${eid}`),'statut')==='livree','la pastille la passe « livrée »');
  verifier(/1\s+évolution livrée sur 1/.test(await texte(eq,'.forfait-chiffres')),'la carte compte la livraison',await texte(eq,'.forfait-chiffres').then(t=>t.replace(/\n/g,' ')));

  console.log('\n== Le client lit tout, et propose');
  await aller(cl,'/maintenance','#forfait'); await pause(2500);
  const pageC=await texte(cl,'.page');
  verifier(/Sérénité/.test(pageC)&&/900/.test(pageC),'la formule et le prix');
  verifier(/Corrections de défauts/.test(pageC)&&/Refonte graphique/.test(pageC)&&/se reportent/.test(pageC),'les modalités, mot pour mot');
  verifier(/Octobre 2026/.test(pageC)&&/Mise à jour iOS 27/.test(pageC),'la séquence et la journée');
  verifier(/Widget iOS/.test(pageC),'l évolution livrée');
  verifier(/En cours/.test(await texte(cl,'.forfait-actions')),'le statut « en cours »');
  verifier(!(await existe(cl,'[data-statut-forfait], [data-configurer-forfait], [data-nouvelle-sequence], [data-editer-sequence], [data-statut-sequence], [data-nouvelle-journee], [data-editer-journee], [data-nouvelle-evolution], [data-editer-evolution], [data-statut-evolution]')),'et pas un seul bouton de modification');
  verifier(await existe(cl,'[data-proposer-evolution]'),'mais « Proposer une évolution »');
  await cl.click('[data-proposer-evolution]'); await pause(900);
  await cl.fill('.voile #ev-titre','Exporter mes tâches en tableur');
  await cl.fill('.voile #ev-description','Pour ma comptabilité, chaque fin de mois.');
  await cl.click('.voile [data-envoyer]'); await pause(2500);
  const prop2=(await dossier()).find(d=>str(d,'genre')==='evolution'&&str(d,'origine')==='client');
  verifier(!!prop2&&str(prop2,'statut')==='proposee'&&str(prop2,'titre')==='Exporter mes tâches en tableur','sa proposition est en base, « proposée », venue du client');
  await pause(1200);
  verifier(/Proposée par vous/i.test(await texte(cl,'#evolutions')),'la page la marque « proposée par vous »');
  verifier(!!(await lettre('contact@capmedia.app','evolution')),'l équipe reçoit une lettre');
  const pid2=prop2?prop2.name.split('/').pop():'';
  await cl.click(`[data-action="ouvrir-evolution"][data-id="${pid2}"]`); await pause(1000);
  verifier(/Pour ma comptabilité/.test(await cl.evaluate(()=>{const v=document.querySelector('.voile');return v?v.innerText:'';})),'la fiche s ouvre chez le client');
  verifier(!(await existe(cl,'.voile [data-modifier]')),'sans bouton « Modifier »');
  await cl.keyboard.press('Escape'); await pause(500);
  const act=((await lire('activite?pageSize=300'))||{}).documents||[];
  verifier(act.some(d=>str(d,'type')==='maintenance'&&/demandé un forfait/.test(str(d,'texte'))),'l activité garde la demande');
  verifier(act.some(d=>str(d,'type')==='maintenance'&&/travaillé une demi-journée/.test(str(d,'texte'))),'et la demi-journée travaillée');

  console.log('\n== L équipe tranche, puis retire');
  await pause(1200);
  verifier(/Proposée par le client/i.test(await texte(eq,'#evolutions')),'l équipe voit la proposition du client');
  await eq.click(`[data-statut-evolution="${pid2}"]`); await pause(600);
  await eq.click('.menu [data-cle="acceptee"]'); await pause(2000);
  verifier(str(await lire(`projets/atelier/maintenance/${pid2}`),'statut')==='acceptee','et l accepte');
  await pause(1500);
  verifier(/Acceptée/.test(await texte(cl,'#evolutions')),'le client le voit sans recharger');
  await eq.click(`[data-editer-journee]`); await pause(1000);
  await eq.click('[data-supprimer]'); await pause(700);
  { const oui=await eq.$$('.voile [data-oui]'); if(oui.length){await oui[oui.length-1].click(); await pause(2000);} }
  verifier(!(await dossier()).some(d=>str(d,'genre')==='journee'),'une journée se supprime');
  await eq.click('[data-configurer-forfait]'); await pause(1000);
  await eq.click('[data-supprimer]'); await pause(700);
  { const oui=await eq.$$('.voile [data-oui]'); if(oui.length){await oui[oui.length-1].click(); await pause(2500);} }
  verifier((await dossier()).length===0,'retirer le forfait vide tout le dossier',String((await dossier()).length));
  await pause(1200);
  verifier(await existe(eq,'[data-configurer-forfait]')&&/Pas encore de forfait/.test(await texte(eq,'#forfait')),'la page revient à « pas encore de forfait »');

  verifier(!err.length,'aucune erreur de page',err.join(' | '));
  await nav.close();
  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-maintenance : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
