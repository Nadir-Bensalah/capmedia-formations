/* ==========================================================================
   Demander un nouveau projet : le client décrit son idée, un espace de
   cadrage s'ouvre avec sa conversation. L'équipe qualifie, chiffre, puis
   transforme en projet sans rien perdre.
   ========================================================================== */

import { echapper, dateHeure, depuis, pluriel, parDateDesc, avecLiens, bdd, collection, query, orderBy, doc, TYPES_PROJET, STATUTS_PREPROJET } from '../noyau.js';
import { icone, pastille, ligne, vide, squelette, titrePage, toast, depot, lireForme, valider, obligatoire, agir, optionsDe, messageHtml, brancherPieces, fait, pieceHtml, sur, encart } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';

export const nouvelle = async (ctx, env) => {
  const sortie = ctx.sortie;
  titrePage('Nouveau projet');
  filAriane([{ libelle: 'Accueil', chemin: '/' }, { libelle: 'Demander un nouveau projet' }]);
  const org = env.session.organisations[0] || {};
  sortie.innerHTML = `<div class="page" style="max-width:820px">
    <div class="page-tete"><div><p class="surtitre">Cadrage</p><h1>Demander un projet</h1><p class="chapo">Décrivez l'idée avec vos mots. Nous en discutons ici, nous la chiffrons, et nous ouvrons le projet une fois d'accord. Rien de ce que vous écrivez n'est perdu en route.</p></div></div>
    <form class="forme" id="forme-preprojet" novalidate>
      <div class="groupe"><label class="etiquette-champ" for="titre">Le projet en une phrase</label><input class="champ" id="titre" name="titre" maxlength="120" placeholder="Une application de réservation pour mon restaurant"></div>
      <div class="forme-rang">
        <div class="groupe"><label class="etiquette-champ" for="type">Type</label><select class="select" id="type" name="type">${optionsDe(TYPES_PROJET, 'application-mobile')}</select></div>
        <div class="groupe"><span class="etiquette-champ">Plateformes</span><div class="rang" style="gap:14px;margin-top:6px">${[['ios', 'iPhone'], ['android', 'Android'], ['web', 'Web']].map(([v, l]) => `<label class="case"><input type="checkbox" name="plateformes" value="${v}"> ${l}</label>`).join('')}</div></div>
      </div>
      <div class="groupe"><label class="etiquette-champ" for="idee">L'idée et le besoin</label><textarea class="zone" id="idee" name="idee" rows="4" maxlength="6000" placeholder="Ce que vous voulez faire, pour qui, et le problème que ça résout."></textarea></div>
      <div class="groupe"><label class="etiquette-champ" for="objectifs">Objectifs <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="objectifs" name="objectifs" rows="2" maxlength="2000" placeholder="Ce qui ferait de ce projet une réussite."></textarea></div>
      <div class="groupe"><label class="etiquette-champ" for="fonctionnalites">Fonctionnalités imaginées <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="fonctionnalites" name="fonctionnalites" rows="3" maxlength="4000" placeholder="Une par ligne."></textarea></div>
      <div class="forme-rang">
        <div class="groupe"><label class="etiquette-champ" for="budget">Budget indicatif <span class="facultatif">(facultatif)</span></label><input class="champ" id="budget" name="budget" maxlength="60" placeholder="5 000 à 10 000 €"></div>
        <div class="groupe"><label class="etiquette-champ" for="delai">Délai souhaité <span class="facultatif">(facultatif)</span></label><input class="champ" id="delai" name="delai" maxlength="60" placeholder="Avant l'été"></div>
      </div>
      <div class="groupe"><label class="etiquette-champ" for="exemples">Exemples, concurrents, inspirations <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="exemples" name="exemples" rows="2" maxlength="2000"></textarea></div>
      <div class="groupe"><label class="etiquette-champ" for="liens">Liens <span class="facultatif">(facultatif)</span></label><input class="champ" id="liens" name="liens" placeholder="https://..., séparés par des espaces"></div>
      <div class="groupe"><span class="etiquette-champ">Fichiers, captures, maquettes</span><div id="zone-pieces"></div></div>
      <div class="forme-pied"><a class="btn btn-secondaire" href="#/">Annuler</a><button class="btn btn-principal btn-grand" type="submit">Envoyer ma demande</button></div>
    </form></div>`;
  const forme = sortie.querySelector('#forme-preprojet');
  const pieces = depot(sortie.querySelector('#zone-pieces'), { chemin: `preprojets/${env.session.utilisateur.uid}` });
  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(forme, { titre: obligatoire('Résumez le projet en une phrase.'), idee: obligatoire("Décrivez l'idée.") })) return;
    if (pieces.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
    const d = lireForme(forme);
    d.plateformes = Array.from(forme.querySelectorAll('[name="plateformes"]:checked')).map((c) => c.value);
    d.organisation = org.id || '';
    await agir(forme.querySelector('[type="submit"]'), async () => {
      const id = await ecrire.creerDemandeProjet(env.session, d, pieces.pieces);
      naviguer(`/nouveaux-projets/${id}`);
    }, 'Demande envoyée. On revient vers vous vite.');
  });
  return () => {};
};

export const liste = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Nouveaux projets');
  filAriane([{ libelle: 'Nouveaux projets' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;
  const rendre = () => {
    const demandes = (magasin.lire(K.demandesProjet) || []).slice().sort(parDateDesc('maj'));
    const enCours = demandes.filter((d) => !['projet', 'refusee'].includes(d.statut));
    const closes = demandes.filter((d) => ['projet', 'refusee'].includes(d.statut));
    const bloc = (d) => ligne({ href: `#/nouveaux-projets/${echapper(d.id)}`, icone: 'sparkle', ton: d.statut === 'nouvelle' ? 'violet' : '', titre: echapper(d.titre), sous: `${echapper((d.par || {}).nom || '')} · ${echapper((d.par || {}).email || '')} · ${echapper(TYPES_PROJET[d.type] || d.type || '')} · ${echapper(depuis(d.maj))}`, fin: pastille(STATUTS_PREPROJET, d.statut) });
    sortie.innerHTML = `<div class="page">
      <div class="page-tete">
        <div><h1>Nouveaux projets</h1><p class="chapo">Vous créez les projets. Les clients, eux, décrivent leur idée ici : vous la qualifiez, vous chiffrez, puis vous ouvrez le projet quand vous le décidez.</p></div>
        <div class="actions"><a class="btn btn-principal" href="#/projets/nouveau">${icone('plus')} Créer un projet</a></div>
      </div>
      ${enCours.length ? `<section class="section" style="margin-top:0"><div class="section-tete"><h2>Demandes des clients</h2><span class="t-petit t-3">${pluriel(enCours.length, 'à traiter')}</span></div><div class="liste">${enCours.map(bloc).join('')}</div></section>`
      : vide({ icone: 'sparkle', titre: 'Aucune demande de client en attente', texte: "Quand un client décrit un nouveau projet depuis son espace, il arrive ici. Vous pouvez aussi ouvrir un projet directement, sans passer par une demande.", action: '<a class="btn btn-principal" href="#/projets/nouveau">Créer un projet</a>' })}
      ${closes.length ? `<section class="section"><div class="section-tete"><h2>Clôturées</h2></div><div class="liste">${closes.map(bloc).join('')}</div></section>` : ''}
    </div>`;
  };
  lot.sur(K.demandesProjet, rendre);
  return () => lot.fin();
};

export const detail = async (ctx, env) => {
  const id = ctx.params.id;
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  lot.abonner(`preprojet:${id}`, () => doc(bdd, 'demandesProjet', id));
  lot.abonner(K.messagesDemandeProjet(id), () => query(collection(bdd, 'demandesProjet', id, 'messages'), orderBy('date', 'asc')));
  let composeur = null;

  const rendre = () => {
    const d = magasin.lire(`preprojet:${id}`);
    if (d === undefined) return;
    if (!d) { sortie.innerHTML = `<div class="page">${vide({ icone: 'sparkle', titre: 'Demande introuvable' })}</div>`; return; }
    const messages = magasin.lire(K.messagesDemandeProjet(id)) || [];
    const brouillon = composeur ? composeur.value : '';
    titrePage(d.titre);
    filAriane([{ libelle: equipe ? 'Nouveaux projets' : 'Accueil', chemin: equipe ? '/nouveaux-projets' : '/' }, { libelle: d.titre }]);
    sortie.innerHTML = `<div class="page" style="max-width:960px">
      <div class="page-tete" style="align-items:flex-start"><div><p class="surtitre">Nouveau projet · ${echapper(TYPES_PROJET[d.type] || d.type || '')}</p><h1>${echapper(d.titre)}</h1><div class="rang" style="margin-top:8px">${pastille(STATUTS_PREPROJET, d.statut)}<span class="puce t-3">${icone('utilisateur')} ${echapper((d.par || {}).nom || '')}</span><span class="puce t-3">${icone('horloge')} ${echapper(depuis(d.cree))}</span></div></div>
        ${equipe ? `<div class="actions"><select class="select" id="statut-preprojet" style="width:auto">${optionsDe(STATUTS_PREPROJET, d.statut)}</select>${d.projet ? `<a class="btn btn-secondaire" href="#/projets/${echapper(d.projet)}">Ouvrir le projet</a>` : `<a class="btn btn-principal" href="#/projets/nouveau?depuis=${echapper(id)}">${icone('plus')} Créer le projet</a>`}</div>` : ''}</div>
      ${!equipe ? encart(`<strong>${({ nouvelle: 'Bien reçu.', discussion: 'On en discute ici.', qualification: 'Nous qualifions le besoin.', estimation: 'Nous estimons.', devis: 'Un devis vous a été envoyé.', acceptee: 'Devis accepté, le projet va s\'ouvrir.', projet: 'Le projet est créé.', refusee: 'Cette demande est close.' })[d.statut] || ''}</strong> ${d.projet ? `<a href="#/projets/${echapper(d.projet)}">Voir le projet</a>.` : 'Vous recevez un e-mail à chaque réponse.'}`, 'info', 'sparkle') : ''}
      <div class="grille grille-tiers section">
        <div>
          <section class="carte"><p class="surtitre">La demande</p><div class="prose t-corps" style="margin-top:10px">${avecLiens(d.idee || '')}</div>
            <dl class="faits" style="margin-top:20px">${fait('Objectifs', d.objectifs ? avecLiens(d.objectifs) : '')}${fait('Fonctionnalités', d.fonctionnalites ? avecLiens(d.fonctionnalites) : '')}${fait('Plateformes', echapper((d.plateformes || []).join(', ')))}${fait('Budget indicatif', echapper(d.budget || ''))}${fait('Délai souhaité', echapper(d.delai || ''))}${fait('Exemples', d.exemples ? avecLiens(d.exemples) : '')}${fait('Liens', d.liens ? avecLiens(d.liens) : '')}</dl>
            ${(d.pieces || []).length ? `<div class="pieces">${d.pieces.map(pieceHtml).join('')}</div>` : ''}</section>
          <section class="carte" style="margin-top:var(--e-5)"><p class="surtitre">Discussion</p>
            <div class="fil" id="fil" style="margin-top:14px">${messages.length ? messages.map((m) => messageHtml(m, { moi: env.session.utilisateur.uid })).join('') : '<p class="t-petit t-3">Pas encore d\'échange.</p>'}</div>
            <form class="composer" id="forme-message" novalidate><textarea class="zone" name="texte" id="texte-message" maxlength="6000" placeholder="Votre message...">${echapper(brouillon)}</textarea><div id="zone-pieces"></div><div class="composer-pied"><span class="pousse"></span><button class="btn btn-principal" type="submit">${icone('envoyer')} Envoyer</button></div></form></section>
        </div>
        <aside class="carte carte--creuse"><p class="surtitre">Parcours</p><div class="chrono" style="margin-top:10px">${Object.entries(STATUTS_PREPROJET).filter(([cle]) => cle !== 'refusee').map(([cle, s], i, arr) => { const idx = arr.findIndex(([k]) => k === d.statut); return `<div class="chrono-item"><span class="chrono-point${i < idx ? ' chrono-point--vert' : i === idx ? ' chrono-point--bleu' : ''}">${i < idx ? icone('check') : ''}</span><div class="chrono-texte" style="${i > idx ? 'color:var(--encre-3)' : ''}">${echapper(s.libelle)}</div></div>`; }).join('')}</div></aside>
      </div></div>`;
    composeur = sortie.querySelector('#texte-message');
    /* Le dossier porte l'identifiant du DEMANDEUR, jamais celui de la
       demande : c'est ce que les règles de stockage savent vérifier. Les
       réponses de l'équipe y vont aussi, sinon le demandeur ne peut pas
       les ouvrir. */
    const boite = depot(sortie.querySelector('#zone-pieces'), { chemin: `preprojets/${(d.par && d.par.uid) || env.session.utilisateur.uid}`, texte: 'Joindre des <strong>fichiers</strong>.', aide: '' });
    sortie.querySelector('#forme-message').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texte = composeur.value.trim();
      if (!texte && !boite.pieces.length) { toast('Écrivez quelque chose.', 'erreur'); return; }
      await agir(e.target.querySelector('[type="submit"]'), async () => { await ecrire.messageDemandeProjet(env.session, id, texte || '(pièces jointes)', boite.pieces); composeur.value = ''; boite.vider(); }, 'Message envoyé.');
    });
    const sel = sortie.querySelector('#statut-preprojet');
    if (sel) sel.addEventListener('change', () => agir(null, () => ecrire.majDemandeProjet(id, { statut: sel.value }), 'Statut mis à jour.'));
  };
  brancherPieces(sortie);
  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  lot.sur(`preprojet:${id}`, planifier);
  lot.sur(K.messagesDemandeProjet(id), planifier);
  return () => { clearTimeout(minuteur); lot.fin(); };
};

void dateHeure; void sur;
