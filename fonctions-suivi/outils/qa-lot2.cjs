/* ==========================================================================
   CAPMEDIA CLIENT HUB · ce qui trompait le client

   Le lot 2 de l'audit du 23 septembre. Douze défauts qui n'empêchaient
   rien, mais montraient au client quelque chose de faux : un montant sans
   sa mention, deux chiffres qui comptent deux choses différentes, un lien
   qui retombe ailleurs, une fiche qui survit à la navigation.

     (émulateurs avec les fonctions, semis, scénarios importés)
     node fonctions-suivi/outils/qa-lot2.cjs
   ========================================================================== */
const { chromium } = require('@playwright/test');
const PROJET='capmedia-1f90d', SITE='http://127.0.0.1:8787';
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const prop={Authorization:'Bearer owner'};
const bdd=(c)=>`http://127.0.0.1:8080/v1/projects/${PROJET}/databases/(default)/documents/${c}`;
const lire=async(c)=>{const r=await fetch(bdd(c),{headers:prop});return r.ok?r.json():null;};
const vider=async(col)=>{const j=await lire(`${col}?pageSize=300`);for(const d of (j&&j.documents)||[])await fetch(`http://127.0.0.1:8080/v1/${d.name}`,{method:'DELETE',headers:prop});};
const poser=async(chemin,fields)=>fetch(bdd(chemin),{method:'PATCH',headers:{...prop,'Content-Type':'application/json'},body:JSON.stringify({fields})});
const S=(v)=>({stringValue:String(v)}), N=(v)=>({integerValue:String(v)}), B=(v)=>({booleanValue:v}), T=(d)=>({timestampValue:d.toISOString()});
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
const texte=(page,sel)=>page.evaluate((s)=>{const e=document.querySelector(s);return e?e.innerText:'';},sel);
const existe=(page,sel)=>page.evaluate((s)=>!!document.querySelector(s),sel);
const attendre=async(fn,n=25)=>{for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(800);}return null;};
/* Un montant nu : des chiffres, un €, et aucune mention sur la ligne.
   La fenêtre couvre la ligne entière : « 2 875 € sur 5 750 € HT » et
   « 2 875 € TTC à régler » portent bien leur mention. */
const MONTANT_NU=/\d[\d   ]*€(?![^\n]*(HT|TTC))/;

(async()=>{
  const nav=await chromium.launch();
  const err=[];

  console.log('\n== 1 · Les lettres');
  {
    const c=require('../courriels');
    /* Les cinq statuts qui n'envoyaient rien. */
    const muets=['a-analyser','acceptee','planifiee','en-revue','annulee'];
    const sansLettre=muets.filter(st=>{
      try { const r=c.rendre('statut',{numero:'A-1',titre:'x',statutApres:st}); return !r.objet||/inconnu|undefined/.test(r.objet); }
      catch(e){ return true; }
    });
    verifier(sansLettre.length===0,'les cinq statuts muets envoient une lettre',sansLettre.join(', '));
    /* Et le serveur les reconnaît : sinon il écrit « Statut inconnu ». */
    const src=require('fs').readFileSync(`${__dirname}/../suivi.js`,'utf8');
    const connus=(src.match(/const STATUTS_CONNUS = \[([\s\S]*?)\]/)||[])[1]||'';
    verifier(muets.every(st=>connus.includes(`'${st}'`)),'et le serveur les connaît tous',connus.replace(/\s+/g,' ').slice(0,90));

    /* L'accusé d'une demande ouverte par l'équipe. */
    const parClient=c.rendre('ticket-cree',{cote:'client',numero:'A-1',titre:'x',clientNom:'Camille Martin'});
    const parEquipe=c.rendre('ticket-cree',{cote:'client',numero:'A-1',titre:'x',clientNom:'Camille Martin',parLEquipe:true});
    verifier(/Votre demande est enregistrée/.test(parClient.objet),'le client qui écrit lit « votre demande est enregistrée »',parClient.objet);
    verifier(/ouverte pour vous/.test(parEquipe.objet)&&!/votre demande/i.test(parEquipe.texte.split('\n')[4]||''),
      "une demande ouverte par l'équipe ne se fait plus passer pour la sienne",parEquipe.objet);

    /* Les accents des lettres du hub. */
    const lettres=['reunion','tache-attente','fichier','validation-demandee','release','qualification','message-projet','preprojet','relance'];
    const sansAccent=[];
    for (const m of lettres) {
      const r=c.rendre(m,{projetNom:'Atelier',titre:'Point hebdo',nom:'x',categorie:'design',version:'1.2.0',notes:[],date:'lundi',numero:'A-1',description:'x',points:[],par:'Camille',email:'a@b.c',idee:'x',texte:'x',auteur:'Capmedia',lien:'x'});
      const brut=`${r.objet} ${r.texte}`;
      if (/\b(Reunion|programmee|Tache|Detail|Repondez|Categorie|recu|depose|Delai|termine|Piece|etre|propose|etudie|developpement|perimetre)\b/.test(brut)) sansAccent.push(m);
    }
    verifier(sansAccent.length===0,`les ${lettres.length} lettres du hub portent leurs accents`,sansAccent.join(', '));

    /* Aucune clé de modèle ne doit porter d'accent : ce sont des
       identifiants écrits en base par les fonctions. */
    const accentuees=Object.keys(c.MODELES).filter(n=>/[À-ÿ]/.test(n));
    verifier(accentuees.length===0,"aucun nom de modèle n'est accenté",accentuees.join(', '));

    /* Le mot « ticket » a disparu des lettres. */
    const tickets=[];
    for (const m of Object.keys(c.MODELES)) {
      try { const r=c.rendre(m,{projetNom:'Atelier',titre:'x',numero:'A-1',nom:'x',version:'1',notes:[],points:[],code:'123456',montant:100,lien:'x',idee:'x',par:'x',email:'a@b.c',texte:'x',description:'x'});
        if (/ticket/i.test(`${r.objet} ${r.texte}`)) tickets.push(m); } catch(e){}
    }
    verifier(tickets.length===0,"le mot « ticket » ne sort plus dans aucune lettre",tickets.join(', '));

    /* « Valable jusqu'au » d'un devis. */
    const suiviSrc=require('fs').readFileSync(`${__dirname}/../suivi.js`,'utf8');
    verifier(/document\.type === 'devis' \? document\.expiration : document\.echeance/.test(suiviSrc),
      "la lettre d'un devis lit sa date d'expiration");
  }

  console.log('\n== 2 · Les montants portent leur mention');
  {
    const cl=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
    cl.on('pageerror',e=>err.push('CLIENT: '+e.message.slice(0,160)));
    cl.on('console',m=>{if(m.type()==='error')err.push('client: '+m.text().slice(0,160));});
    await connecter(cl,'camille.essai@exemple.test');

    await aller(cl,'/finances','.metriques');
    const fin=await texte(cl,'.page');
    verifier(!MONTANT_NU.test(fin),'aucun montant nu sur Devis et factures',(fin.match(MONTANT_NU)||[''])[0]);
    /* Le semis ne porte que des pièces sans TVA : « HT » est donc la bonne
       réponse partout, et « TTC » n'apparaîtrait qu'avec une TVA. On
       vérifie la règle plutôt qu'un mot : chaque montant a SA mention. */
    const montants=(fin.match(/\d[\d\u202f\u00a0 ]*€[^\n]*/g)||[]);
    const sansMention=montants.filter(m=>!/HT|TTC/.test(m));
    verifier(sansMention.length===0,`les ${montants.length} montants de la page portent leur mention`,sansMention.join(' | '));

    /* « innerText » coupe à chaque bloc : un montant et sa mention posés
       dans deux éléments voisins se retrouvent sur deux lignes, alors
       qu'ils sont côte à côte à l'écran. On lit donc le texte brut du
       conteneur, celui que l'œil voit d'un seul tenant. */
    const texteVu=(page,sel)=>page.evaluate((s)=>{const e=document.querySelector(s);return e?(e.textContent||'').replace(/\s+/g,' '):'';},sel);

    await aller(cl,'/','.page-tete');
    const acc=await texteVu(cl,'.page');
    verifier(!MONTANT_NU.test(acc),"aucun montant nu sur l'accueil",(acc.match(MONTANT_NU)||[''])[0]);

    await aller(cl,'/projets/atelier/etapes','.page');
    const et=await texteVu(cl,'.page');
    verifier(!MONTANT_NU.test(et),'ni sur la frise du devis',(et.match(MONTANT_NU)||[''])[0]);

    console.log('\n== 3 · Un seul chiffre par entrée de menu');
    const barre=await cl.evaluate(()=>[...document.querySelectorAll('.lat .comptes')].map(c=>({
      lien:(c.closest('a')||{}).textContent?.trim().replace(/\s+/g,' ').slice(0,28)||'',
      chiffres:[...c.querySelectorAll('.compte')].map(x=>x.textContent.trim()),
    })));
    const doubles=barre.filter(b=>b.chiffres.length>1&&b.chiffres[0]!==b.chiffres[1]);
    verifier(doubles.length===0,'aucune entrée ne montre deux chiffres différents',JSON.stringify(doubles).slice(0,140));

    console.log('\n== 4 · L\'activité tient en cinq lignes');
    await aller(cl,'/','.page-tete');
    const lignes=await cl.evaluate(()=>document.querySelectorAll('.chrono-item').length);
    verifier(lignes>0,`l'accueil montre de l'activité (${lignes} lignes)`);
    verifier(lignes<=5,`et au plus cinq (${lignes})`);

    console.log('\n== 5 · Une fiche ne survit pas à la navigation');
    await aller(cl,'/finances','.metriques');
    await cl.evaluate(()=>{location.hash='/finances/d-qa';window.dispatchEvent(new HashChangeEvent('hashchange'));});
    await pause(3000);
    verifier(await existe(cl,'.voile'),"la fiche d'un devis s'ouvre par son adresse");
    await cl.evaluate(()=>{location.hash='/maintenance';window.dispatchEvent(new HashChangeEvent('hashchange'));});
    await pause(2200);
    verifier(!(await existe(cl,'.voile')),"et se ferme en changeant d'adresse");

    console.log('\n== 6 · Les liens de l\'activité mènent au bon espace');
    await aller(cl,'/projets/atelier/activite','.page');
    const liensClient=await cl.evaluate(()=>[...document.querySelectorAll('.chrono-texte a')].map(a=>a.getAttribute('href')));
    verifier(!liensClient.some(h=>/^#\/validations\//.test(h||'')),"le client n'a aucun lien vers une route du cockpit",liensClient.filter(h=>/validations/.test(h||'')).join(' '));
    await cl.context().close();

    const eq=await (await nav.newContext({viewport:{width:1500,height:1100}})).newPage();
    eq.on('pageerror',e=>err.push('EQUIPE: '+e.message.slice(0,160)));
    await connecter(eq,'agent.essai@exemple.test');
    await eq.evaluate(()=>{try{localStorage.setItem('suivi:cle-admin','cle-essai-locale');}catch(e){}});
    await aller(eq,'/activite','.page');
    const liensEquipe=await eq.evaluate(()=>[...document.querySelectorAll('.chrono-texte a')].map(a=>a.getAttribute('href')));
    verifier(liensEquipe.length>0,`le cockpit affiche des liens d'activité (${liensEquipe.length})`);
    verifier(!liensEquipe.some(h=>/^#\/valider\//.test(h||'')),"et aucun ne pointe vers une route du client",liensEquipe.filter(h=>/#\/valider\//.test(h||'')).join(' '));

    console.log('\n== 7 · Le cockpit compte comme ses pages');
    const barreEq=await eq.evaluate(()=>{
      const l=[...document.querySelectorAll('.lat a')].find(a=>/Finances/.test(a.textContent));
      return l?[...l.querySelectorAll('.compte')].map(x=>x.textContent.trim()):[];
    });
    verifier(barreEq.length<=1||barreEq[0]===barreEq[1],'l\'entrée Finances ne montre pas deux chiffres qui se contredisent',JSON.stringify(barreEq));
    await aller(eq,'/finances','.metriques');
    const fin2=await texte(eq,'.page');
    const m2=(fin2.match(/\d[\d\u202f\u00a0 ]*€[^\n]*/g)||[]);
    const nus2=m2.filter(m=>!/HT|TTC/.test(m));
    verifier(nus2.length===0,`les ${m2.length} montants du cockpit portent leur mention`,nus2.join(' | '));
    await eq.context().close();
  }

  console.log('\n== 8 · La date d\'une ligne de devis');
  {
    const src=require('fs').readFileSync(`${__dirname}/../../agence/suivi/assets/js/vues/frise.js`,'utf8');
    verifier(/faiteLe: new Date\(\)/.test(src),'cocher une ligne consigne le jour de la coche');
    verifier(!/dateCourte\(j\.maj \|\| j\.fin\)/.test(src),"et « faite le » ne lit plus la dernière modification");
  }

  console.log('\n== 9 · La conversation montre ses DERNIERS messages, l historique à la demande');
  {
    /* Avant la Release Gate 1, cette garde exigeait « asc, limit(300) » :
       elle protégeait le défaut. Passé trois cents messages, la fenêtre
       gardait les trois cents PREMIERS, et les nouveaux n'apparaissaient
       plus. Le comportement est éprouvé dans qa-gate1 (320 messages) ; ici,
       on garde seulement que toutes les vues partagent la même requête. */
    const fs=require('fs');
    const admin=fs.readFileSync(`${__dirname}/../../agence/suivi/assets/js/admin.js`,'utf8');
    const donnees=fs.readFileSync(`${__dirname}/../../agence/suivi/assets/js/donnees.js`,'utf8');
    verifier(/requeteMessages\(/.test(admin),'le cockpit abonne la même requête que la bulle');
    verifier(/requeteMessages = \(pid\) => query\(col\('projets', pid, 'messages'\), orderBy\('date', 'desc'\), limit\(FENETRE_MESSAGES\)\)/.test(donnees),'la requête prend les derniers messages, en nombre borné');
    verifier(/startAfter\(avant\)/.test(donnees),"l'historique se lit par pages avant le plus ancien affiché");
    const vues=fs.readdirSync(`${__dirname}/../../agence/suivi/assets/js`).filter(f=>f.endsWith('.js')).map(f=>fs.readFileSync(`${__dirname}/../../agence/suivi/assets/js/${f}`,'utf8'))
      .concat(fs.readdirSync(`${__dirname}/../../agence/suivi/assets/js/vues`).map(f=>fs.readFileSync(`${__dirname}/../../agence/suivi/assets/js/vues/${f}`,'utf8')));
    verifier(!vues.some(v=>/'messages'\), orderBy\('date', 'asc'\), limit\(/.test(v)),"plus aucune fenêtre croissante qui garde les plus anciens");
  }

  verifier(!err.length,'aucune erreur de page',[...new Set(err)].slice(0,3).join(' | '));
  await nav.close();
  console.log(soucis.length?`\n${soucis.length} ÉCART(S)`:'\nqa-lot2 : tout est conforme');
  process.exit(soucis.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
