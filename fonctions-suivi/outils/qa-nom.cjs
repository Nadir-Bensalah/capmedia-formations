require('./lib/garde-banc.cjs'); const BANC = require('./lib/ports-banc.cjs');
const { lireRest } = require('./lib/rest-banc.cjs');
/* ==========================================================================
   CAPMEDIA CLIENT HUB · l'équipe corrige le nom d'un interlocuteur

   Le nom tapé à l'invitation devient celui du compte, du « Bonjour » et des
   e-mails. Le cockpit doit pouvoir le corriger, et la correction doit se
   lire partout : fiche d'accès, compte, profil.

     (émulateurs avec les fonctions, semis)
     node fonctions-suivi/outils/qa-nom.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const PROJET='capmedia-1f90d', SITE=BANC.site;
const RACINE=`${__dirname}/../../agence/suivi`;
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`${BANC.firestore}/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>lireRest(bdd(c),prop);
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`${BANC.firestore}/v1/${d.name}`,{method:'DELETE',headers:prop});};
const champ=(d,k)=>(((d||{}).fields||{})[k]||{});
const str=(d,k)=>champ(d,k).stringValue||'';
const soucis=[];const ok=m=>console.log('  ok     '+m);const dire=m=>{soucis.push(m);console.log('  ÉCART  '+m);};
const verifier=(c,b,m)=>(c?ok(b):dire(m?`${b} · ${m}`:b));
const attendre=async(fn,n=30)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(600);}return null;};
/* Depuis la Gate 2, plus de clé : on appelle au nom de l'administrateur
   du banc, avec son jeton Firebase, comme le cockpit. */
const { appelAdmin } = require('./lib/session-banc.cjs');
const serveur=async(action,corps)=>{ const r=await appelAdmin(action,corps); return { code:r.code, texte:r.texte }; };
const codeDe=(email)=>attendre(async()=>{
  const j=await lire('envois?pageSize=100');
  const p=((j&&j.documents)||[]).filter(d=>str(d,'modele')==='code'
    && (((champ(d,'a').arrayValue||{}).values)||[]).some(x=>((((x.mapValue||{}).fields||{}).email)||{}).stringValue===email));
  if(!p.length) return null;
  p.sort((x,y)=>new Date(str(y,'cree')||((y.fields.cree||{}).timestampValue)||0)-new Date(str(x,'cree')||((x.fields.cree||{}).timestampValue)||0));
  return ((((champ(p[0],'variables').mapValue||{}).fields)||{}).code||{}).stringValue||null;
});

/* Une porte franchie : on saisit l'adresse, le code, et on regarde OÙ l'on
   atterrit. C'est la seule question qui compte ici. */
const entrer=async(nav,email)=>{
  const page=await (await nav.newContext({viewport:{width:1300,height:1000}})).newPage();
  const err=[]; page.on('pageerror',e=>err.push(e.message.slice(0,140)));
  page.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,140));});
  await vider('envois');await vider('connexions');await vider('connexionsIp');
  await page.goto(`${SITE}/suivi/?emul`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#forme:not(.masque)',{timeout:25000});
  await page.fill('#email',email);await page.click('#envoyer');
  await page.waitForSelector('#forme-code:not(.masque)',{timeout:25000});
  await page.fill('#code',await codeDe(email)||'');
  await pause(7000);
  const vu=await page.evaluate(()=>({
    chemin:location.pathname, titre:document.title,
    marque:(document.querySelector('.lat-marque .service')||document.querySelector('.testeur-tete .surtitre')||{}).innerText||'',
    corps:(document.body.innerText||'').slice(0,160),
  }));
  return { page, err, ...vu };
};


const crypto = require('crypto');
const { uidDe, ADMIN_BANC } = require('./lib/session-banc.cjs');
const cleEmail = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 32);
const CAMILLE = 'camille.essai@exemple.test';
const nomDuCompte = async (uid) => {
  const r = await fetch(`${BANC.authHote ? 'http://' + BANC.authHote : ''}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:lookup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: [uid] }),
  });
  const j = await r.json().catch(() => ({}));
  return ((j.users || [])[0] || {}).displayName || '';
};

(async()=>{
  const uid = await uidDe(CAMILLE);
  console.log('\n== 1 · Un profil qui porte un ancien nom');
  await fetch(bdd(`profils/${uid}?updateMask.fieldPaths=nom`), { method: 'PATCH', headers: { ...prop, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { nom: { stringValue: 'CAMILLE M' } } }) });
  verifier(str(await lire(`profils/${uid}`), 'nom') === 'CAMILLE M', 'le profil de Camille porte « CAMILLE M »');

  console.log('\n== 2 · Le cockpit corrige le nom');
  const nav = await chromium.launch();
  const admin = await entrer(nav, ADMIN_BANC);
  const page = admin.page;
  await page.goto(`${SITE}/suivi/cockpit?emul#/projets/atelier/acces`, { waitUntil: 'domcontentloaded' });
  const sel = `[data-action="acces-menu"][data-cle="${cleEmail(CAMILLE)}"]`;
  await page.waitForSelector(sel, { timeout: 25000 });
  await page.click(sel);
  await page.click('.menu button:has-text("Modifier le nom")');
  await page.waitForSelector('#ac-nouveau-nom', { timeout: 10000 });
  verifier(await page.inputValue('#ac-nouveau-nom') === 'Camille Martin', 'la fenêtre propose le nom actuel');
  await page.fill('#ac-nouveau-nom', '   ');
  await page.click('button[form="f-nom"]');
  await pause(800);
  verifier(await page.$('#ac-nouveau-nom') !== null, 'un nom vide ne ferme pas la fenêtre');
  await page.fill('#ac-nouveau-nom', '  Camille Martin-Durand  ');
  await page.click('button[form="f-nom"]');
  const fiche = await attendre(async () => { const d = await lire(`projets/atelier/interlocuteurs/${cleEmail(CAMILLE)}`); return str(d, 'nom') === 'Camille Martin-Durand' ? d : null; });
  verifier(Boolean(fiche), 'la fiche d accès porte le nom nettoyé');
  verifier(str(fiche, 'role') === 'responsable' && str(fiche, 'statut') === 'actif', 'le rôle et l accès ne bougent pas');
  verifier(await attendre(async () => /Camille Martin-Durand/.test(await page.innerText('body'))), 'le cockpit affiche le nouveau nom');
  verifier(await nomDuCompte(uid) === 'Camille Martin-Durand', 'le compte porte le nouveau nom', await nomDuCompte(uid));
  verifier(str(await lire(`profils/${uid}`), 'nom') === 'Camille Martin-Durand', 'le profil aussi : le « Bonjour » du Hub suit');

  console.log('\n== 3 · Le serveur refuse un nom vide');
  const r = await serveur('modifierInterlocuteur', { projet: 'atelier', cle: cleEmail(CAMILLE), nom: '   ' });
  verifier(r.code === 400, 'nom vide refusé (400)', `${r.code} ${r.texte}`);
  verifier(str(await lire(`projets/atelier/interlocuteurs/${cleEmail(CAMILLE)}`), 'nom') === 'Camille Martin-Durand', 'et la fiche garde le bon nom');

  verifier(admin.err.filter((e) => !/favicon|ERR_|net::/.test(e)).length === 0, 'aucune erreur dans la console du cockpit', admin.err.join(' | '));
  await nav.close();
  console.log(`\n${soucis.length ? soucis.length + ' écart(s)' : 'Aucun écart.'}`);
  process.exit(soucis.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
