/* ==========================================================================
   Les demandes : le centre de demandes du client (formulaire dynamique
   selon la nature), et la fiche d'une demande avec son fil, son
   historique, son pilotage par l'équipe et ses gestes côté client.
   ========================================================================== */

import {
  echapper, dateCourte, dateHeure, depuis, enParagraphes, avecLiens, parDateAsc, parDateDesc, joursAvant, age,
  bdd, collection, query, where, orderBy, doc,
  STATUTS, TYPES, URGENCES, PLATEFORMES, QUALIFICATIONS, OUVERTS, ATTEND_CLIENT, STATUTS_RELEASE, pluriel,
} from '../noyau.js';
import {
  icone, pastille, puce, pucePlateforme, choixPlateformes, avatar, fait, vide, squelette, titrePage, modale, confirmer, toast, sur, depot, lireForme, valider, obligatoire, longueurMax, agir, optionsDe, messageHtml, brancherPieces, encart, pieceHtml, chronoItem,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire, abonnerProjet } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { editer } from './editeurs.js';

/* ==========================================================================
   1. Nouvelle demande
   ========================================================================== */

const CHAMPS_PAR_TYPE = {
  bug:            ['plateforme', 'version', 'appareil', 'etapes', 'attendu', 'obtenu'],
  modification:   ['plateforme', 'contexte', 'attendu'],
  fonctionnalite: ['plateforme', 'contexte', 'attendu'],
  amelioration:   ['plateforme', 'contexte', 'attendu'],
  question:       ['contexte'],
  technique:      ['plateforme', 'contexte'],
  contenu:        ['plateforme', 'contexte'],
  devis:          ['contexte', 'attendu'],
  demande:        ['contexte'],
  autre:          ['contexte'],
};

export const nouvelle = async (ctx, env) => {
  const pid = ctx.params.id;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;
  abonnerProjet(lot, pid, env.role);
  const projet = await magasin.attendre(K.projet(pid)).catch(() => null);
  if (!projet) { sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Projet introuvable' })}</div>`; return () => lot.fin(); }
  titrePage('Nouvelle demande');
  filAriane([{ libelle: projet.nom, chemin: `/projets/${pid}` }, { libelle: 'Demandes', chemin: `/projets/${pid}/demandes` }, { libelle: 'Nouvelle demande' }]);
  const typeInitial = ctx.requete.type && TYPES[ctx.requete.type] ? ctx.requete.type : 'bug';
  /* Une demande née d'un message : le texte est déjà là, on ne le retape pas. */
  let depuisMessage = null;
  try {
    const brut = sessionStorage.getItem(`suivi:demande-depuis:${pid}`);
    if (brut) { depuisMessage = JSON.parse(brut); sessionStorage.removeItem(`suivi:demande-depuis:${pid}`); }
  } catch (e) { depuisMessage = null; }
  const composants = magasin.lire(K.composants(pid)) || [];
  /* On ne propose que les plateformes du projet : demander « Android » sur un
     projet qui n'en a pas n'aide personne. */
  const plateformesProjet = (projet.plateformes || []).length
    ? projet.plateformes
    : Array.from(new Set(composants.map((c) => c.type).filter((t) => PLATEFORMES[t])));

  sortie.innerHTML = `<div class="page" style="max-width:820px">
    <div class="page-tete"><div><p class="surtitre">${echapper(projet.nom)}</p><h1>Nouvelle demande</h1><p class="chapo">Dites-nous ce dont vous avez besoin. Plus c'est précis, plus vite on avance. Vous recevrez un e-mail à chaque mouvement.</p></div></div>
    ${depuisMessage ? `<div class="encart encart--info" style="margin-bottom:var(--e-5)">${icone('messages')} <span>Reprise d'un message${depuisMessage.auteur ? ` de ${echapper(depuisMessage.auteur)}` : ''}. Relisez, complétez, ajustez le type si besoin.</span></div>` : ''}
    <form class="forme" id="forme-demande" novalidate>
      <div class="groupe">
        <span class="etiquette-champ">De quoi s'agit-il ?</span>
        <div class="grille grille-2" id="choix-type" role="radiogroup">
          ${Object.entries(TYPES).filter(([cle]) => cle !== 'demande').map(([cle, t]) => `<label class="carte carte--serree carte--cliquable rang" style="gap:12px;align-items:flex-start;cursor:pointer">
            <input type="radio" name="type" value="${cle}" ${cle === typeInitial ? 'checked' : ''} style="margin-top:4px">
            <span><span class="t-corps-fort" style="display:block">${echapper(t.libelle)}</span><span class="t-petit t-2">${echapper(t.aide)}</span></span>
          </label>`).join('')}
        </div>
      </div>
      <div class="groupe"><label class="etiquette-champ" for="titre">Titre</label><input class="champ" id="titre" name="titre" maxlength="120" placeholder="En une phrase" value="${echapper(depuisMessage ? depuisMessage.titre || '' : '')}"></div>
      <div class="groupe"><label class="etiquette-champ" for="description">Description</label><textarea class="zone" id="description" name="description" rows="5" maxlength="6000" placeholder="Ce que vous avez constaté, ce que vous souhaitez, et dans quel contexte.">${echapper(depuisMessage ? depuisMessage.description || '' : '')}</textarea></div>
      <div class="forme-rang">
        <div class="groupe"><label class="etiquette-champ" for="urgence">Urgence</label><select class="select" id="urgence" name="urgence">${optionsDe(URGENCES, 'important')}</select><p class="aide">Bloquant : vous ne pouvez plus travailler. Critique : une fonction majeure est cassée.</p></div>
        ${composants.length ? `<div class="groupe"><label class="etiquette-champ" for="composant">Quelle partie du projet ?</label><select class="select" id="composant" name="composant"><option value="">Je ne sais pas</option>${composants.map((c) => `<option value="${echapper(c.id)}">${echapper(c.nom)}</option>`).join('')}</select></div>` : ''}
      </div>
      <div class="groupe" data-champ="plateforme">
        <span class="etiquette-champ">Sur quelle plateforme ?</span>
        ${choixPlateformes('plateforme', [''], { genre: 'radio', limiter: plateformesProjet, avecVide: true })}
      </div>
      <div class="groupe" data-champ="version"><label class="etiquette-champ" for="version">Version de l'application <span class="facultatif">(facultatif)</span></label><input class="champ" id="version" name="version" maxlength="40" placeholder="1.4.2"></div>
      <div class="groupe" data-champ="appareil"><label class="etiquette-champ" for="appareil">Appareil, système, navigateur <span class="facultatif">(facultatif)</span></label><input class="champ" id="appareil" name="appareil" maxlength="120" placeholder="iPhone 15, iOS 18 · Chrome sur Mac"></div>
      <div class="groupe" data-champ="contexte"><label class="etiquette-champ" for="contexte">Contexte <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="contexte" name="contexte" rows="3" maxlength="2000" placeholder="Pourquoi cette demande, pour qui, avec quel objectif."></textarea></div>
      <div class="groupe" data-champ="etapes"><label class="etiquette-champ" for="etapes">Étapes pour reproduire <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="etapes" name="etapes" rows="3" maxlength="4000" placeholder="1. J'ouvre l'application&#10;2. Je touche le bouton Compte&#10;3. ..."></textarea></div>
      <div class="forme-rang">
        <div class="groupe" data-champ="attendu"><label class="etiquette-champ" for="attendu">Résultat attendu <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="attendu" name="attendu" rows="3" maxlength="2000" placeholder="Ce qui devrait se passer."></textarea></div>
        <div class="groupe" data-champ="obtenu"><label class="etiquette-champ" for="obtenu">Résultat obtenu <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="obtenu" name="obtenu" rows="3" maxlength="2000" placeholder="Ce qui se passe vraiment."></textarea></div>
      </div>
      <div class="groupe"><label class="etiquette-champ" for="liens">Liens utiles <span class="facultatif">(facultatif)</span></label><input class="champ" id="liens" name="liens" placeholder="https://..., séparés par des espaces"></div>
      <div class="groupe"><span class="etiquette-champ">Captures, vidéos, documents</span><div id="zone-pieces"></div></div>
      <div class="forme-pied"><a class="btn btn-secondaire" href="#/projets/${echapper(pid)}/demandes">Annuler</a><button class="btn btn-principal btn-grand" type="submit">Envoyer la demande</button></div>
    </form>
  </div>`;

  const forme = sortie.querySelector('#forme-demande');
  const pieces = depot(sortie.querySelector('#zone-pieces'), { chemin: `projets/${pid}/tickets/nouveau` });
  const ajuster = () => {
    const type = (forme.elements.type.value) || 'bug';
    const visibles = CHAMPS_PAR_TYPE[type] || CHAMPS_PAR_TYPE.autre;
    sortie.querySelectorAll('[data-champ]').forEach((el) => { el.classList.toggle('masque', !visibles.includes(el.dataset.champ)); });
    const bouton = forme.querySelector('[type="submit"]');
    bouton.textContent = type === 'bug' ? "Signaler l'anomalie" : type === 'devis' ? 'Demander un devis' : 'Envoyer la demande';
    sortie.querySelectorAll('#choix-type .carte').forEach((c) => { c.style.borderColor = c.querySelector('input').checked ? 'var(--accent)' : ''; });
  };
  forme.addEventListener('change', (e) => { if (e.target.name === 'type') ajuster(); });
  ajuster();

  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(forme, { titre: (v) => obligatoire('Donnez un titre.')(v) || longueurMax(120)(v), description: (v) => obligatoire('Décrivez votre demande.')(v) || longueurMax(6000)(v) })) return;
    if (pieces.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    const d = lireForme(forme);
    d.liens = d.liens ? d.liens.split(/\s+/).filter((l) => /^https?:\/\//.test(l)).slice(0, 10) : [];
    await agir(forme.querySelector('[type="submit"]'), async () => {
      const id = await ecrire.creerDemande(env.session, pid, d, pieces.pieces);
      naviguer(`/projets/${pid}/demandes/${id}`);
    }, 'Demande envoyée. Nous vous répondons vite.');
  });

  return () => lot.fin();
};

/* ==========================================================================
   2. La fiche d'une demande
   ========================================================================== */

export const detail = async (ctx, env) => {
  const pid = ctx.params.id;
  const tid = ctx.params.tid;
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;

  abonnerProjet(lot, pid, env.role);
  lot.abonner(K.ticket(tid), () => doc(bdd, 'tickets', tid));
  lot.abonner(K.messagesTicket(tid), () => (equipe
    ? query(collection(bdd, 'tickets', tid, 'messages'), orderBy('date', 'asc'))
    : query(collection(bdd, 'tickets', tid, 'messages'), where('interne', '==', false), orderBy('date', 'asc'))));
  lot.abonner(K.evenementsTicket(tid), () => query(collection(bdd, 'tickets', tid, 'evenements'), orderBy('date', 'asc')));
  if (equipe) lot.abonner(K.equipe, () => collection(bdd, 'equipe'));

  let luMarque = false;
  let composeur = null;
  let derniereEmpreinte = '';
  const cles = [K.projet(pid), K.ticket(tid), K.messagesTicket(tid), K.evenementsTicket(tid), K.composants(pid), K.taches(pid), K.releases(pid), K.equipe];

  const rendre = () => {
    const projet = magasin.lire(K.projet(pid));
    const t = magasin.lire(K.ticket(tid));
    const refuse = magasin.erreur(K.projet(pid)) || magasin.erreur(K.ticket(tid));
    if ((projet === undefined || t === undefined) && !refuse) return;
    const e = magasin.empreinte(cles);
    if (e === derniereEmpreinte) return;
    derniereEmpreinte = e;
    if (!t || !projet) { sortie.innerHTML = `<div class="page">${vide({ icone: 'demandes', titre: 'Demande introuvable', texte: "Elle a peut-être été archivée, ou vous n'y avez plus accès.", action: `<a class="btn btn-secondaire" href="#/projets/${echapper(pid)}/demandes">Retour aux demandes</a>` })}</div>`; return; }
    const messages = magasin.lire(K.messagesTicket(tid)) || [];
    const evenements = magasin.lire(K.evenementsTicket(tid)) || [];
    const composants = magasin.lire(K.composants(pid)) || [];
    const taches = (magasin.lire(K.taches(pid)) || []).filter((x) => x.ticket === tid);
    const release = (magasin.lire(K.releases(pid)) || []).find((r) => r.id === t.release) || null;
    const equipeListe = magasin.lire(K.equipe) || [];
    const nomEquipe = (uid) => ((equipeListe.find((e) => e.id === uid) || {}).nom || '');
    const brouillon = composeur ? composeur.value : '';
    const interneCoche = sortie.querySelector('#mode-interne') ? sortie.querySelector('#mode-interne').checked : false;

    titrePage(`${t.numero || 'Demande'} · ${t.titre}`);
    filAriane([{ libelle: projet.nom, chemin: `/projets/${pid}` }, { libelle: 'Demandes', chemin: `/projets/${pid}/demandes` }, { libelle: t.numero || t.titre }]);

    if (!luMarque && OUVERTS.includes(t.statut)) { luMarque = true; ecrire.marquerLuDemande(tid, equipe ? 'equipe' : 'client').catch(() => {}); }

    const ouverte = OUVERTS.includes(t.statut);
    const peutRouvrir = !equipe && t.statut === 'resolu' && t.resolu && joursAvant(t.resolu) >= -7;

    sortie.innerHTML = `<div class="page" style="max-width:960px">
      <header class="page-tete" style="align-items:flex-start">
        <div style="min-width:0">
          <p class="surtitre">${echapper([t.numero || 'Numéro en attente', projet.nom, (TYPES[t.type] || {}).libelle].filter(Boolean).join(' · '))}</p>
          <h1 style="margin-top:2px">${echapper(t.titre)}</h1>
          <div class="rang" style="margin-top:10px">
            ${pastille(STATUTS, t.statut, { client: !equipe })}${puce(URGENCES, t.urgence || 'important')}
            ${t.qualification ? pastille(QUALIFICATIONS, t.qualification) : ''}
            ${t.plateforme ? `${pucePlateforme(t.plateforme)}${t.version ? `<span class="puce t-3">version ${echapper(t.version)}</span>` : ''}` : ''}
            <span class="puce t-3">${icone('horloge')} ouverte ${echapper(depuis(t.cree))}</span>
          </div>
        </div>
        <div class="actions">
          ${equipe ? `<button class="btn btn-secondaire" type="button" data-action="piloter">${icone('edit')} Piloter</button><button class="btn btn-doux" type="button" data-action="tache">${icone('taches')} Créer une tâche</button>` : ''}
          ${!equipe && t.statut === 'a-valider' ? `<button class="btn btn-ok" type="button" data-action="valider">${icone('check')} C'est réglé, je valide</button><button class="btn btn-secondaire" type="button" data-action="pas-regle">Pas tout à fait</button>` : ''}
          ${peutRouvrir ? `<button class="btn btn-secondaire" type="button" data-action="rouvrir">Rouvrir</button>` : ''}
        </div>
      </header>

      ${bandeauSuivi(t, { equipe, release, nomEquipe, evenements })}


      <div class="grille grille-tiers section">
        <div>
          <section class="carte">
            <p class="surtitre">Le signalement</p>
            <div class="prose t-corps" style="margin-top:10px">${avecLiens(t.description)}</div>
            <dl class="faits" style="margin-top:20px">
              ${fait('Contexte', t.contexte ? enParagraphes(t.contexte) : '')}
              ${fait('Étapes pour reproduire', t.etapes ? enParagraphes(t.etapes) : '')}
              ${fait('Résultat attendu', t.attendu ? enParagraphes(t.attendu) : '')}
              ${fait('Résultat obtenu', t.obtenu ? enParagraphes(t.obtenu) : '')}
              ${fait('Appareil', echapper(t.appareil || ''))}
            </dl>
            ${(t.liens || []).length ? `<div class="rang" style="margin-top:14px">${t.liens.map((l) => `<a class="piece" href="${echapper(l)}" target="_blank" rel="noopener">${icone('externe')}<span class="nom">${echapper(l.replace(/^https?:\/\//, ''))}</span></a>`).join('')}</div>` : ''}
            ${(t.pieces || []).length ? `<div class="pieces">${t.pieces.map(pieceHtml).join('')}</div>` : ''}
          </section>

          <section class="carte" style="margin-top:var(--e-5)">
            <p class="surtitre">Échanges</p>
            <div class="fil" id="fil" style="margin-top:14px">
              ${messages.length ? messages.map((m) => messageHtml(m, { moi: env.session.utilisateur.uid })).join('') : '<p class="t-petit t-3">Pas encore d\'échange. Écrivez-nous ci-dessous.</p>'}
            </div>
            ${ouverte || equipe ? `<form class="composer" id="forme-message" novalidate>
              ${equipe ? `<div class="segments" role="group"><label class="interrupteur" style="padding:6px 10px"><input type="radio" name="mode" value="client" ${!interneCoche ? 'checked' : ''}> Répondre au client</label><label class="interrupteur" style="padding:6px 10px"><input type="radio" name="mode" value="interne" id="mode-interne" ${interneCoche ? 'checked' : ''}> Note interne</label></div>` : ''}
              <textarea class="zone" name="texte" id="texte-message" maxlength="6000" placeholder="${equipe ? 'Votre réponse...' : 'Écrivez ici. Une capture aide souvent plus qu\'un paragraphe.'}">${echapper(brouillon)}</textarea>
              <div id="zone-pieces-message"></div>
              <div class="composer-pied"><span class="t-micro t-3" id="aide-message">${equipe ? 'Ce texte part au client et déclenche un e-mail.' : 'Capmedia est prévenu par e-mail.'}</span><span class="pousse"></span><button class="btn btn-principal" type="submit">${icone('envoyer')} Envoyer</button></div>
            </form>` : `<p class="t-petit t-3" style="margin-top:14px">Cette demande est ${(STATUTS[t.statut] || {}).libelle ? (STATUTS[t.statut].libelle.toLowerCase()) : 'close'}. ${peutRouvrir ? 'Vous pouvez la rouvrir pendant sept jours.' : 'Ouvrez une nouvelle demande si besoin.'}</p>`}
          </section>
        </div>
        <aside class="pile" style="gap:var(--e-4)">
          <div class="carte carte--creuse">
            <p class="surtitre">Fiche</p>
            <dl class="faits" style="margin-top:10px;grid-template-columns:1fr">
              ${fait('Demandée par', `${echapper((t.auteur || {}).nom || '')}${equipe && t.auteur && t.auteur.email ? `<br><span class="t-micro t-3">${echapper(t.auteur.email)}</span>` : ''}`)}
              ${fait('Le', echapper(dateHeure(t.cree)))}
              ${fait('Dernier mouvement', echapper(dateHeure(t.maj)))}
              ${fait('Suivie par', echapper(t.assigne ? (nomEquipe(t.assigne) || 'Capmedia') : (equipe ? 'Personne' : 'Capmedia')))}
              ${fait('Partie concernée', echapper((composants.find((c) => c.id === t.composant) || {}).nom || ''))}
            </dl>
          </div>
          ${taches.length ? `<div class="carte carte--creuse"><p class="surtitre">Tâches liées</p><div class="pile" style="margin-top:10px;gap:8px">${taches.map((x) => `<a class="rang" style="gap:8px;color:inherit" href="#/projets/${echapper(pid)}/taches/${echapper(x.id)}">${icone(x.statut === 'terminee' ? 'check' : 'taches')}<span class="t-petit">${echapper(x.titre)}</span></a>`).join('')}</div></div>` : ''}
          <div class="carte carte--creuse">
            <p class="surtitre">Tout ce qui lui est arrivé</p>
            ${evenements.length ? `<div class="chrono" style="margin-top:10px">${evenements.slice().reverse().map((e) => chronoItem({ icone: e.type === 'creation' ? 'plus' : e.type === 'statut' ? 'drapeau' : e.type === 'assignation' ? 'utilisateur' : 'activite', ton: e.apres === 'resolu' ? 'vert' : '', texte: texteEvenement(e, nomEquipe), date: [dateHeure(e.date), age(e.date)].filter(Boolean).join(' · ') })).join('')}</div>` : '<p class="t-petit t-3" style="margin-top:8px">Rien encore.</p>'}
          </div>
        </aside>
      </div>
    </div>`;

    composeur = sortie.querySelector('#texte-message');
    const zonePieces = sortie.querySelector('#zone-pieces-message');
    if (zonePieces) {
      const boite = depot(zonePieces, { chemin: `projets/${pid}/tickets/${tid}`, texte: 'Joindre des <strong>captures ou documents</strong>.', aide: '' });
      const forme = sortie.querySelector('#forme-message');
      forme.addEventListener('change', (e) => { if (e.target.name === 'mode') { const int = e.target.value === 'interne'; sortie.querySelector('#aide-message').textContent = int ? 'Visible uniquement par l\'équipe. Aucun e-mail.' : 'Ce texte part au client et déclenche un e-mail.'; forme.querySelector('[type="submit"]').innerHTML = `${icone(int ? 'note' : 'envoyer')} ${int ? 'Noter' : 'Envoyer'}`; } });
      forme.addEventListener('submit', async (e) => {
        e.preventDefault();
        const texte = composeur.value.trim();
        if (!texte && !boite.pieces.length) { toast('Écrivez quelque chose.', 'erreur'); return; }
        if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
        const interne = equipe && forme.elements.mode && forme.elements.mode.value === 'interne';
        await agir(forme.querySelector('[type="submit"]'), async () => {
          await ecrire.messageDemande(env.session, tid, texte || '(pièces jointes)', boite.pieces, interne);
          composeur.value = ''; boite.vider();
        }, interne ? 'Note enregistrée.' : 'Message envoyé.');
      });
    }
    setTimeout(() => { const fil = sortie.querySelector('#fil'); if (fil && fil.lastElementChild) fil.lastElementChild.scrollIntoView({ block: 'nearest' }); }, 0);
  };

  const gestes = sur(sortie, 'click', '[data-action]', async (el) => {
    const t = magasin.lire(K.ticket(tid));
    if (!t) return;
    const action = el.dataset.action;
    if (action === 'piloter') return editer('demande-pilotage', env, { pid, fiche: t });
    if (action === 'tache') return editer('tache', env, { pid, defaut: { titre: t.titre, ticket: tid, composant: t.composant || '' } });
    if (action === 'valider') {
      const ok = await confirmer({ titre: 'Valider cette correction ?', texte: 'La demande passe en terminée. Vous pourrez la rouvrir pendant sept jours.', ok: 'Je valide' });
      if (ok) await agir(el, () => ecrire.clientValideDemande(tid), 'Merci, la demande est terminée.');
      return null;
    }
    if (action === 'pas-regle') { const c = sortie.querySelector('#texte-message'); if (c) { c.focus(); c.placeholder = 'Dites-nous ce qui ne va pas encore.'; } return null; }
    if (action === 'rouvrir') {
      const ok = await confirmer({ titre: 'Rouvrir cette demande ?', texte: 'Elle repasse en cours et nous sommes prévenus.', ok: 'Rouvrir' });
      if (ok) await agir(el, () => ecrire.clientRouvreDemande(tid), 'Demande rouverte.');
      return null;
    }
    return null;
  });
  brancherPieces(sortie);

  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { clearTimeout(minuteur); gestes(); lot.fin(); };
};

/** Une ancienne adresse ne porte que l'identifiant : on retrouve le projet. */
export const resoudre = async (ctx) => {
  const tid = ctx.params.tid;
  ctx.sortie.innerHTML = `<div class="page">${squelette('page', 3)}</div>`;
  try {
    const { getDoc } = await import('../noyau.js');
    const fiche = await getDoc(doc(bdd, 'tickets', tid));
    if (fiche.exists()) { naviguer(`/projets/${fiche.data().projet}/demandes/${tid}`, { remplacer: true }); return () => {}; }
  } catch (e) { /* refus ou absence : même écran */ }
  ctx.sortie.innerHTML = `<div class="page">${vide({ icone: 'demandes', titre: 'Demande introuvable', texte: "Elle a peut-être été archivée, ou vous n'y avez plus accès.", action: '<a class="btn btn-secondaire" href="#/">Retour à l\'accueil</a>' })}</div>`;
  return () => {};
};

/*
 * « Où en est ma demande ». Le client lisait un mot d'état et écrivait un
 * message pour savoir la seule chose qui compte : qui l'a en main, depuis
 * quand, et ce qui va se passer ensuite. Cette bande le dit sans détour,
 * et nomme la version dans laquelle la correction part.
 */
const bandeauSuivi = (t, { equipe, release, nomEquipe, evenements }) => {
  const s = STATUTS[t.statut] || {};
  const ouverte = OUVERTS.includes(t.statut);
  const chez = s.chez === 'client' ? (equipe ? 'client' : 'vous') : s.chez === 'capmedia' ? 'capmedia' : '';
  const ton = !ouverte ? (t.statut === 'resolu' ? 'ok' : 'gris') : chez === 'capmedia' ? 'info' : 'attention';
  const dernier = evenements.length ? evenements[evenements.length - 1] : null;
  const suivie = t.assigne ? (nomEquipe(t.assigne) || 'Capmedia') : 'Capmedia';

  const balle = chez === 'capmedia'
    ? `C'est à nous de jouer. ${equipe ? 'Le client attend.' : 'Vous n\'avez rien à faire.'}`
    : chez === 'vous' ? 'La balle est dans votre camp.'
    : chez === 'client' ? 'La balle est dans le camp du client.' : '';

  return `<section class="suivi-demande suivi-demande--${ton}">
    <div class="suivi-demande-tete">
      <span class="suivi-demande-pastille">${icone(ouverte ? (chez === 'capmedia' ? 'play' : 'help') : 'check')}</span>
      <div style="min-width:0">
        <p class="t-titre-3">${echapper((!equipe && s.client) || s.libelle || t.statut)}</p>
        <p class="t-petit t-2" style="margin-top:2px">${echapper([balle, s.suite].filter(Boolean).join(' '))}</p>
      </div>
    </div>
    <dl class="suivi-demande-faits">
      <div><dt>Ouverte depuis</dt><dd>${echapper(age(t.cree))}</dd></div>
      <div><dt>Dernier mouvement</dt><dd>${echapper((dernier && age(dernier.date)) || age(t.maj) || age(t.cree))}</dd></div>
      <div><dt>Suivie par</dt><dd>${echapper(suivie)}</dd></div>
      <div><dt>Livrée dans</dt><dd>${release
        ? `${echapper([release.plateforme && (PLATEFORMES[release.plateforme] || {}).libelle, release.version].filter(Boolean).join(' '))} <span class="t-3">· ${echapper((STATUTS_RELEASE[release.statut] || {}).libelle || '')}${release.date ? ` ${dateCourte(release.date)}` : ''}</span>`
        : '<span class="t-3">version pas encore fixée</span>'}</dd></div>
    </dl>
    ${t.qualification === 'hors-perimetre' || t.qualification === 'a-chiffrer' ? `<p class="suivi-demande-note">${t.qualification === 'a-chiffrer' ? 'Cette demande sera chiffrée.' : 'Cette demande sort du périmètre prévu.'} ${t.devis ? `Le devis <a href="#/finances/${echapper(t.devis)}">est disponible</a>.` : 'Un devis vous sera proposé avant tout développement.'}</p>` : ''}
  </section>`;
};

const texteEvenement = (e, nomEquipe) => {
  const par = (e.par && e.par.nom) || 'Capmedia';
  if (e.type === 'creation') return `Demande créée par <strong>${echapper(par)}</strong>`;
  if (e.type === 'statut') return `Statut passé de <strong>${echapper((STATUTS[e.avant] || {}).libelle || e.avant || '')}</strong> à <strong>${echapper((STATUTS[e.apres] || {}).libelle || e.apres || '')}</strong> par ${echapper(par)}`;
  /* Le champ porte un identifiant : on cherche le nom AVANT de se rabattre
     dessus, faute de quoi le client lit un code Firebase. */
  if (e.type === 'assignation') return `Confiée à <strong>${echapper(nomEquipe(e.apres) || 'Capmedia')}</strong>`;
  if (e.type === 'urgence') return `Urgence passée à <strong>${echapper((URGENCES[e.apres] || {}).libelle || e.apres || '')}</strong>`;
  if (e.type === 'qualification') return `Qualifiée <strong>${echapper((QUALIFICATIONS[e.apres] || {}).libelle || e.apres || '')}</strong>`;
  if (e.type === 'archive') return e.apres ? 'Archivée' : 'Sortie des archives';
  return `${echapper(e.type)} : ${echapper(e.avant || 'vide')} vers ${echapper(e.apres || 'vide')}`;
};

void avatar; void parDateAsc; void parDateDesc; void modale; void ATTEND_CLIENT; void encart; void pluriel;
