require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · le lot B1 de l'audit du 3 octobre

   Capmedia est une micro-entreprise : franchise en base de TVA. Une pièce
   à TVA 0 n'affiche ni « HT » ni « TTC », un seul montant et la mention
   « TVA non applicable, article 293 B du CGI ». Puis quatre défauts :
   le coffre fermé sans issue, le ré-ajout d'une adresse active qui retirait
   le dernier responsable, la relance qui montrait la finance à un
   collaborateur, et « en en cours » dans l'activité.

     (émulateurs avec les fonctions, semis)
     node fonctions-suivi/outils/qa-lotb1.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const PROJET='capmedia-1f90d', SITE=BANC.site;
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`${BANC.firestore}/v1/${d.name}`,{method:'DELETE',headers:prop});};
const poser=async(chemin,fields)=>fetch(bdd(chemin),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields})});
const S=(v)=>({stringValue:String(v)}), N=(v)=>({integerValue:String(v)}), B=(v)=>({booleanValue:v});
const champ=(d,k)=>(((d||{}).fields||{})[k]||{});
const str=(d,k)=>champ(d,k).stringValue||'';
const soucis=[];const ok=m=>console.log('  ok     '+m);const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const attendre=async(fn,n=30)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(800);}return null;};
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
const { appelAdmin } = require('./lib/session-banc.cjs');
const activites=async()=>((await lire('activite?pageSize=300'))||{}).documents||[];
const MENTION=/TVA non applicable, article 293 B du CGI/;
const TAXE=/\b(HT|TTC)\b|Hors taxes|TVA 0/;

(async()=>{
  const nav=await chromium.launch();
  const err=[];
  const CLIENT='camille.essai@exemple.test';

  console.log('\n== 0 · Les lettres : franchise de TVA');
  {
    const c=require('../courriels');
    const base={numero:'F-1',libelle:'Essai',projetNom:'Atelier',montant:1000,echeance:new Date()};
    const zero=['devis','facture','facture-echeance','facture-retard'].map(m=>c.rendre(m,{...base,tva:0,ttc:1000,reste:1000})).map(r=>`${r.texte}\n${r.html}`);
    verifier(zero.every(t=>/1 000,00 €/.test(t)&&MENTION.test(t)&&!/EUR|TTC|hors taxes/.test(t)),'à TVA 0 : un seul montant en « € » et la mention 293 B, ni « EUR TTC » ni « hors taxes »',zero.map(t=>(t.match(/[^\n]*(EUR|TTC|hors taxes)[^\n]*/)||[''])[0]).filter(Boolean).join(' | ').slice(0,160));
    const vingt=c.rendre('facture',{...base,tva:20,ttc:1200});
    verifier(/1[\s\u202f\u00a0]200,00[\s\u202f\u00a0]EUR TTC/.test(vingt.texte)&&/hors taxes/.test(vingt.texte)&&!MENTION.test(vingt.texte),'à TVA 20 : le TTC et le hors taxes restent, sans la mention',vingt.texte.split('\n').filter(l=>/Montant/.test(l)).join(' '));
  }

  console.log('\n== 1 · Franchise de TVA : un seul montant, la mention une fois');
  const cl=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
  cl.on('pageerror',e=>err.push('CLIENT: '+e.message.slice(0,160)));
  await connecter(cl,CLIENT);
  await aller(cl,'/finances','.metriques');
  const page=await cl.evaluate(()=>document.querySelector('.page').innerText);
  verifier(!TAXE.test(page),'Devis et factures : ni « HT » ni « TTC » ni « TVA 0 % »',(page.match(/[^\n]*(\bHT\b|\bTTC\b|Hors taxes|TVA 0)[^\n]*/)||[''])[0]);
  verifier((page.match(/TVA non applicable, article 293 B du CGI/g)||[]).length===1,'la mention 293 B y est, une seule fois');
  await cl.evaluate(()=>{location.hash='/finances/f-acompte';window.dispatchEvent(new HashChangeEvent('hashchange'));});
  await cl.waitForSelector('.modale-corps',{timeout:15000}).catch(()=>{});
  const fiche=await cl.evaluate(()=>{const m=document.querySelector('.voile');return m?m.innerText:'';});
  verifier(/2[\s  ]875,00[\s  ]?€/.test(fiche),'la fiche de la facture F-2026-031 montre 2 875,00 €',fiche.slice(0,120));
  verifier(!TAXE.test(fiche),'sans « HT », « TTC » ni « TVA 0 % »',(fiche.match(/[^\n]*(\bHT\b|\bTTC\b|Hors taxes|TVA 0)[^\n]*/)||[''])[0]);
  verifier((fiche.match(/TVA non applicable, article 293 B du CGI/g)||[]).length===1,'la mention légale une fois sur la fiche');
  verifier(!/null|undefined/.test(fiche),'ni « null » ni « undefined »');
  const declarer=await cl.$('[data-declarer]');
  if (declarer) {
    await declarer.click(); await pause(800);
    const lab=await cl.evaluate(()=>{const l=document.querySelector('label[for="r-montant"]');return l?l.textContent:'';});
    verifier(lab&&!/TTC/.test(lab),'« J\'ai réglé cette facture » : le montant sans « TTC »',lab);
    await cl.keyboard.press('Escape'); await pause(500);
  }
  await cl.keyboard.press('Escape'); await pause(600);
  await aller(cl,'/','.page-tete');
  const acc=await cl.evaluate(()=>document.querySelector('.page').textContent.replace(/\s+/g,' '));
  verifier(!/TTC à régler/.test(acc)&&/à régler/.test(acc),"l'accueil dit « à régler », sans « TTC »",(acc.match(/.{20}à régler/)||[''])[0]);
  const annonces=fs.readFileSync(`${__dirname}/annonces-semer.mjs`,'utf8');
  verifier(!/hors taxes/.test(annonces),"l'annonce des tarifs ne dit plus « en euros hors taxes »");

  console.log('\n== 2 · Le coffre pas encore ouvert propose de le demander');
  await aller(cl,'/projets/atelier/coffre','[data-coffre-etat]');
  const etat=await cl.evaluate(()=>{const e=document.querySelector('[data-coffre-etat]');return e?e.dataset.coffreEtat:'';});
  verifier(etat==='absent',`le coffre d'Atelier n'est pas encore ouvert (${etat})`);
  const bouton=await cl.$('[data-coffre-demander]');
  verifier(Boolean(bouton)&&/Demander l'ouverture du coffre/.test(await bouton.textContent()),'un bouton « Demander l\'ouverture du coffre »');
  if (bouton) {
    await bouton.click(); await pause(2500);
    const titre=await cl.evaluate(()=>{const t=document.querySelector('#titre, [name="titre"]');return t?t.value:'';});
    verifier(/#\/projets\/atelier\/nouvelle-demande/.test(await cl.evaluate(()=>location.hash))&&/coffre/i.test(titre),'il ouvre un ticket prérempli vers l\'équipe',titre);
  }
  await cl.context().close();

  console.log('\n== 3 · Ré-ajouter une adresse active ne laisse pas le projet sans responsable');
  {
    const r=await appelAdmin('ajouterInterlocuteur',{projet:'atelier',email:CLIENT,nom:'Camille Martin',role:'collaborateur'});
    verifier(r.code===409,`rétrograder la seule responsable d'Atelier est refusé (${r.code})`,r.texte.slice(0,100));
    const fic=await lire('projets/atelier/interlocuteurs');
    const cam=((fic&&fic.documents)||[]).find(d=>str(d,'email')===CLIENT);
    verifier(str(cam,'role')==='responsable'&&str(cam,'statut')==='actif','elle reste responsable, active',`${str(cam,'role')} ${str(cam,'statut')}`);
    const p=await lire('projets/atelier');
    const roles=((champ(p,'roles').mapValue||{}).fields)||{};
    verifier(Object.values(roles).some(v=>v.stringValue==='responsable'),'le projet garde un responsable dans ses rôles');
    const r2=await appelAdmin('ajouterInterlocuteur',{projet:'atelier',email:CLIENT,nom:'Camille Martin',role:'responsable'});
    verifier(r2.code===200,`ré-ajouter avec le même rôle passe (${r2.code})`,r2.texte.slice(0,100));
  }

  console.log('\n== 4 · La relance : la finance au responsable seul');
  {
    const { initializeApp, getApps } = require('firebase-admin/app');
    if (!getApps().length) initializeApp({ projectId: PROJET });
    const hub = require('../hub.js');
    const points = await hub._pointsEnAttente('atelier');
    const devis = points.filter((p) => p.quoi === 'Devis à décider');
    const factures = points.filter((p) => p.quoi === 'Facture à régler');
    verifier(devis.length>0&&devis.every((p)=>p.reserve===true),`« Devis à décider » est réservé au responsable (${devis.length})`);
    verifier(factures.length>0&&factures.every((p)=>p.reserve===true),`« Facture à régler » aussi (${factures.length})`);
    verifier(factures.every((p)=>!/TTC/.test(p.detail)),'et une facture à TVA 0 se dit sans « TTC »',factures.map((p)=>p.detail).join(' | '));
    /* Le tri de la lettre, tel que hubRelanceHebdo le fait. */
    const src=fs.readFileSync(`${__dirname}/../hub.js`,'utf8');
    verifier(/points\.filter\(\(p\) => !p\.reserve \|\| \(d\.uid && roles\[d\.uid\] === 'responsable'\)\)/.test(src),'la lettre de chacun ne garde que ce qui est à lui');
    const pourCollaborateur = points.filter((p) => !p.reserve);
    verifier(!pourCollaborateur.some((p)=>/Devis à décider|Facture à régler/.test(p.quoi)),'un collaborateur ne reçoit ni devis ni facture');
  }

  console.log('\n== 5 · L\'activité parle juste');
  {
    const base={projet:S('atelier'),titre:S('Essai lot B1'),description:S(''),visibilite:S('client'),archive:B(false),responsable:S('')};
    await poser('taches/t-lotb1',{...base,statut:S('a-faire')});
    await pause(2500);
    await poser('taches/t-lotb1',{...base,statut:S('en-cours')});
    const ligne=await attendre(async()=>(await activites()).map(d=>str(d,'texte')).find(t=>/Essai lot B1/.test(t)&&/cours/.test(t)));
    verifier(ligne==='a passé la tâche « Essai lot B1 » en cours',"« a passé la tâche … en cours », sans « en en »",ligne||'(rien)');
    await poser('taches/t-lotb1',{...base,statut:S('en-revue')});
    const revue=await attendre(async()=>(await activites()).map(d=>str(d,'texte')).find(t=>/Essai lot B1/.test(t)&&/revue/.test(t)));
    verifier(revue==='a passé la tâche « Essai lot B1 » en revue','« … en revue »',revue||'(rien)');
    const tous=(await activites()).map(d=>str(d,'texte'));
    verifier(!tous.some(t=>/\ben en\b/.test(t)),'« en en » n\'apparaît plus dans l\'activité',tous.filter(t=>/\ben en\b/.test(t)).join(' | '));

    const fact={projet:S('atelier'),type:S('facture'),numero:S('F-LOTB1'),libelle:S('Essai'),montant:N(100),tva:N(0),ttc:N(100),archive:B(false)};
    await poser('documents/f-lotb1',{...fact,statut:S('a-payer')});
    await pause(2500);
    await poser('documents/f-lotb1',{...fact,statut:S('payee')});
    const paye=await attendre(async()=>(await activites()).find(d=>/F-LOTB1/.test(str(d,'texte'))&&/paiement|réglé/.test(str(d,'texte'))));
    const nomPar=(((champ(paye,'par').mapValue||{}).fields||{}).nom||{}).stringValue||'';
    verifier(paye&&str(paye,'texte')==='a reçu le paiement de la facture F-LOTB1',`l'équipe « a reçu le paiement de la facture », elle ne l'a pas réglée (${nomPar})`,paye?str(paye,'texte'):'(rien)');
  }

  verifier(!err.length,'aucune erreur de page',[...new Set(err)].slice(0,3).join(' | '));
  await nav.close();
  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-lotb1 : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
