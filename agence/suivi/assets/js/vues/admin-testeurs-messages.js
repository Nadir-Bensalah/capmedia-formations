/* ==========================================================================
   Les conversations des testeurs : une par testeur, à part des messages
   de projet. À gauche, qui a écrit et ce qui attend une réponse ; à
   droite, le fil, en direct, et la réponse. Le serveur tient les compteurs
   (hubMessageTesteur) ; ouvrir un fil remet celui de l'équipe à zéro.

   Depuis octobre 2026, la messagerie commune (messagerie.js), comme la
   page Messages d'un projet : le fil par jour, « Lu le », réagir,
   répondre, modifier, supprimer, joindre. Trois zones dessinées à part :
   la liste, le fil, et le champ, monté une fois par conversation (un
   message qui arrive n'efface plus la réponse en cours de frappe). L'équipe
   peut aussi écrire la première, à n'importe quel testeur du vivier.
   ========================================================================== */

import { echapper, depuis, enDate, STATUTS_CAMPAGNE, bdd, doc, collection, query, orderBy, limit, onSnapshot, updateDoc, serverTimestamp } from '../noyau.js';
import { icone, vide, squelette, titrePage, toast, agir, depot, brancherPieces, sur, lisible } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, filDeMessages } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { filParJour, luLe } from '../bulle.js';
import { messageDuFil, signatureFil, allerAuMessage, barreContexte, citationPour, brancherGestesMessages } from '../messagerie.js';

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  const uid = env.session.utilisateur.uid;
  const nom = String((env.session.equipe && env.session.equipe.nom) || env.session.utilisateur.displayName || 'Capmedia').slice(0, 80);
  const choisi = ctx.params.uid || '';
  const fil$ = choisi ? filDeMessages(['conversationsTesteurs', choisi, 'messages'], { uid, nom, cote: 'equipe' }) : null;
  titrePage('Testeurs');
  filAriane([{ libelle: 'Testeurs' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  let messages = [];
  let arretFil = null;
  let signature = null;
  let contexte = null;
  let brouillonMis = '';
  const retraits = [];

  const conversations = () => magasin.lire(K.conversationsTesteurs) || [];
  const testeurs = () => magasin.lire(K.testeurs) || [];
  const conversation = () => conversations().find((x) => x.id === choisi) || null;
  const fiche = () => testeurs().find((x) => x.id === choisi) || null;
  /* Les campagnes où le testeur a été pris, les plus récentes d'abord :
     chacune mène à sa fiche, dans son projet. */
  const campagnesDe = (id) => (magasin.lire(K.campagnesToutes) || [])
    .filter((c) => (c.testeurs || []).includes(id))
    .sort((a, b) => ((enDate(b.debut) || enDate(b.cree) || 0) - (enDate(a.debut) || enDate(a.cree) || 0)));
  const nomProjet = (pid) => ((magasin.lire(K.projets) || []).find((p) => p.id === pid) || {}).nom || '';
  /* Sous le nom : la fiche du testeur (le vivier, dans la page Tests) et
     ses campagnes. Un testeur qui n'est plus au vivier n'a plus de fiche :
     on le dit au lieu d'un lien qui n'ouvrirait rien. */
  let liensPoses = '';
  const liensHtml = () => {
    const t = fiche();
    const camp = campagnesDe(choisi);
    const lienFiche = t
      ? `<a class="lien" href="#/tests?testeur=${encodeURIComponent(choisi)}" data-fiche-testeur="${echapper(choisi)}">Voir sa fiche</a>`
      : '<span class="t-3">Plus au vivier</span>';
    const lienCampagnes = camp.length
      ? camp.map((c) => {
        const pid = c.projet || c._parent || '';
        const statut = (STATUTS_CAMPAGNE[c.statut || 'preparation'] || {}).libelle || '';
        return `<a class="lien" href="#/tests?projet=${encodeURIComponent(pid)}&campagne=${encodeURIComponent(c.id)}" data-campagne-testeur="${echapper(c.id)}">${echapper(c.titre || 'Campagne')}</a><span class="t-3"> · ${echapper([nomProjet(pid), statut].filter(Boolean).join(', '))}</span>`;
      }).join('<span class="t-3">&nbsp;; </span>')
      : '<span class="t-3">Aucune campagne</span>';
    return `<p class="t-petit">${lienFiche}</p><p class="t-petit"><span class="t-2">Ses campagnes : </span>${lienCampagnes}</p>`;
  };
  const nomDe = (c) => { const t = testeurs().find((x) => x.id === c.id) || {}; return c.prenom || t.prenom || c.email || t.email || 'Testeur'; };

  /* Lu : le compteur de l'équipe à zéro, avec l'heure (le testeur lit « Lu le »). */
  const marquerLu = async () => {
    const c = conversation();
    if (!c || !Number(c.nonLusEquipe || 0)) return;
    try { await updateDoc(doc(bdd, 'conversationsTesteurs', choisi), { nonLusEquipe: 0, luEquipe: serverTimestamp() }); } catch (e) { /* rien */ }
  };

  /* --- La page, une fois --------------------------------------------- */
  /* Un testeur choisi par l'adresse : son fil s'ouvre, même s'il n'a encore
     rien écrit (l'équipe écrit la première) ; son nom suit les données. */
  const courante = choisi ? { id: choisi } : null;
  sortie.innerHTML = `<div class="page page--large">
    <div class="page-tete"><div><h1>Testeurs</h1><p class="chapo">Ce que les testeurs vous écrivent depuis leur espace, à part des projets.</p></div></div>
    <div class="tm-deux">
      <aside>
        <label class="champ-groupe" style="display:block;margin-bottom:10px"><span class="t-petit t-2">Écrire à un testeur</span>
          <select class="champ" id="tm-nouveau"></select>
        </label>
        <div class="tm-liste" id="tm-liste"></div>
      </aside>
      <section class="tm-fil-cadre">
        ${courante ? `
          <header class="tm-tete"><div><p class="surtitre">Testeur</p><h2 id="tm-nom"></h2><p class="t-petit t-2" id="tm-email"></p><div class="tm-liens" id="tm-liens" style="margin-top:6px"></div></div></header>
          <div class="tm-fil" id="tm-fil"></div>
          <form class="tm-repondre" id="tm-forme" novalidate>
            <div style="grid-column:1/-1" id="tm-contexte"></div>
            <div style="grid-column:1/-1" id="tm-pieces"></div>
            <textarea class="champ" id="tm-texte" rows="2" maxlength="6000" aria-label="Votre réponse. Entrée envoie, Maj+Entrée va à la ligne."></textarea>
            <div style="display:flex;gap:6px;align-items:end">
              <button class="btn-icone" type="button" id="tm-joindre" aria-label="Joindre un fichier" data-astuce="Joindre">${icone('trombone')}</button>
              <button class="btn btn-principal" type="submit">${icone('envoyer')} Envoyer</button>
            </div>
          </form>`
        : `<div class="tm-vide">${vide({ icone: 'messages', titre: 'Choisissez une conversation', texte: 'Le fil s\'ouvre ici, en direct.', compact: true })}</div>`}
      </section>
    </div>
  </div>`;
  const $ = (s) => sortie.querySelector(s);

  /* --- La liste et le choix d'un testeur ------------------------------- */
  const rendreListe = () => {
    const liste = conversations();
    $('#tm-liste').innerHTML = liste.length ? liste.map((c) => `
      <button class="ligne${c.id === choisi ? ' ligne--active' : ''}" type="button" data-conv="${echapper(c.id)}">
        <span class="ligne-icone${Number(c.nonLusEquipe || 0) ? ' ligne-icone--rouge' : ''}">${icone('smartphone')}</span>
        <span class="ligne-corps"><span class="ligne-titre">${echapper(nomDe(c))}${Number(c.nonLusEquipe || 0) ? ` <span class="badge badge--rouge">${echapper(String(c.nonLusEquipe))}</span>` : ''}</span>
          <span class="ligne-sous">${c.dernier ? `${c.dernier.cote === 'equipe' ? 'Vous : ' : ''}${echapper(String(c.dernier.texte || '').slice(0, 80))}` : ''}</span></span>
        <span class="ligne-fin t-micro t-3">${c.maj ? echapper(depuis(c.maj)) : ''}</span>
      </button>`).join('')
      : vide({ icone: 'messages', titre: 'Aucun message de testeur', texte: 'Quand un testeur écrit depuis la bulle de son espace, la conversation apparaît ici. Vous pouvez aussi lui écrire le premier.', compact: true });
    const actifs = testeurs().filter((t) => t.actif !== false).sort((a, b) => String(a.prenom || a.email || '').localeCompare(String(b.prenom || b.email || ''), 'fr'));
    $('#tm-nouveau').innerHTML = `<option value="">Choisir un testeur…</option>${actifs.map((t) => `<option value="${echapper(t.id)}"${t.id === choisi ? ' selected' : ''}>${echapper(t.prenom || t.email || 'Testeur')}${t.email && t.prenom ? ` · ${echapper(t.email)}` : ''}</option>`).join('')}`;
    if ($('#tm-nom')) {
      const c = conversation() || { id: choisi, ...(fiche() || {}) };
      $('#tm-nom').textContent = nomDe(c);
      $('#tm-email').textContent = c.email || (fiche() || {}).email || '';
      const liens = liensHtml();
      if (liens !== liensPoses) { liensPoses = liens; $('#tm-liens').innerHTML = liens; }
    }
  };
  $('#tm-nouveau').addEventListener('change', (e) => { if (e.target.value) naviguer(`/testeurs-messages/${e.target.value}`); });
  retraits.push(sur(sortie, 'click', '[data-conv]', (b) => naviguer(`/testeurs-messages/${b.dataset.conv}`)));

  /* --- Le fil ------------------------------------------------------------ */
  const rendreFil = (force = false) => {
    const filEl = $('#tm-fil');
    if (!filEl) return;
    const lu = enDate((conversation() || {}).luTesteur);
    const miens = messages.filter((m) => m.de && m.de.cote === 'equipe');
    const dernierMien = miens[miens.length - 1];
    const luDernier = Boolean(dernierMien && lu && (enDate(dernierMien.date) || 0) <= lu);
    const nouvelle = `${signatureFil(messages)}#${dernierMien ? dernierMien.id : ''}:${luDernier ? luLe(lu) : ''}`;
    if (!force && nouvelle === signature) return;
    const enBas = filEl.scrollHeight - filEl.scrollTop - filEl.clientHeight < 80;
    const hautAvant = filEl.scrollTop;
    const premiereFois = signature === null;
    signature = nouvelle;
    filEl.innerHTML = messages.length
      ? filParJour(messages, (m) => messageDuFil(m, { uid, equipe: true, classe: 'fil-message', tous: messages, transformer: false }))
        + (dernierMien ? `<p class="bulle-accuse">${luDernier ? `${icone('checkDouble')} ${echapper(luLe(lu))}` : `${icone('check')} Envoyé`}</p>` : '')
      : vide({ icone: 'messages', titre: 'Rien encore', texte: 'Écrivez-lui : il reçoit le message dans sa bulle, en direct, et par e-mail.', compact: true });
    if (force || premiereFois || enBas) filEl.scrollTop = filEl.scrollHeight;
    else filEl.scrollTop = hautAvant;
  };

  /* --- Le champ, monté une fois ------------------------------------------ */
  const forme = $('#tm-forme');
  if (forme) {
    const champ = forme.querySelector('#tm-texte');
    champ.placeholder = `Répondre à ${nomDe(conversation() || { id: choisi })}…`;
    const ajuster = () => { champ.style.height = 'auto'; champ.style.height = `${Math.min(champ.scrollHeight, 220)}px`; };
    const rendreContexte = () => { $('#tm-contexte').innerHTML = barreContexte(contexte, uid); };
    const finirContexte = () => {
      if (contexte && contexte.mode === 'modifier') { champ.value = brouillonMis; ajuster(); }
      contexte = null; brouillonMis = '';
      rendreContexte();
    };
    const auBout = () => { champ.focus(); const f = champ.value.length; try { champ.setSelectionRange(f, f); } catch (e) { /* rien */ } };
    const repondre = (m) => { if (contexte && contexte.mode === 'modifier') finirContexte(); contexte = { mode: 'repondre', message: m }; rendreContexte(); auBout(); };
    const modifier = (m) => {
      if (!contexte || contexte.mode !== 'modifier') brouillonMis = champ.value;
      contexte = { mode: 'modifier', message: m }; rendreContexte();
      champ.value = String(m.texte || ''); ajuster(); auBout();
    };
    const boite = depot($('#tm-pieces'), { chemin: `conversationsTesteurs/${choisi}`, metadonnees: { par: uid }, texte: '', aide: '', compact: true, cible: $('.tm-fil-cadre') });
    brancherPieces(sortie);
    $('#tm-joindre').addEventListener('click', () => { const e = $('#tm-pieces input[type="file"]'); if (e) e.click(); });
    champ.addEventListener('input', ajuster);
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); forme.requestSubmit(); }
      if (e.key === 'Escape' && contexte) { e.stopPropagation(); finirContexte(); }
    });
    forme.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texte = champ.value.trim();
      const bouton = forme.querySelector('[type="submit"]');
      if (contexte && contexte.mode === 'modifier') {
        const m = contexte.message;
        if (!texte && !(m.pieces || []).length) { toast('Un message ne peut pas être vide : supprimez-le plutôt.', 'erreur'); return; }
        if (texte === String(m.texte || '').trim()) { finirContexte(); return; }
        bouton.disabled = true;
        try { await fil$.modifier(m.id, texte); finirContexte(); } catch (err) {
          toast(err && err.code === 'permission-denied' ? 'Le délai de modification (15 minutes) est passé.' : lisible(err), 'erreur');
        } finally { bouton.disabled = false; }
        return;
      }
      if (!texte && !boite.pieces.length) return;
      if (boite.occupe) { toast('Attendez la fin des envois.', 'erreur'); return; }
      const reponseA = contexte && contexte.mode === 'repondre' ? citationPour(contexte.message, uid) : null;
      await agir(bouton, async () => {
        try {
          await fil$.envoyer(texte, boite.pieces, reponseA);
          champ.value = ''; ajuster(); boite.vider();
          if (reponseA) finirContexte();
        } catch (err) { console.error(err); toast("Le message n'est pas parti.", 'erreur'); }
      });
    });
    retraits.push(brancherGestesMessages($('#tm-fil'), {
      uid, equipe: true, fil: fil$,
      trouver: (id) => messages.find((x) => x.id === id),
      repondre, modifier, transformer: null,
      allerA: (id) => { if (!allerAuMessage($('#tm-fil'), id)) toast('Ce message est trop ancien pour être affiché ici.', 'info'); },
    }));
    retraits.push(sur(sortie, 'click', '[data-annuler-contexte]', () => { finirContexte(); champ.focus(); }));
    setTimeout(() => champ.focus(), 50);
  }

  if (choisi && courante) {
    arretFil = onSnapshot(query(collection(bdd, 'conversationsTesteurs', choisi, 'messages'), orderBy('date', 'desc'), limit(300)), (inst) => {
      /* Les 300 plus récents, remis dans l'ordre : une fenêtre qui suit la fin
         de la conversation, jamais son début. */
      /* L'heure du serveur, estimée tant qu'elle n'est pas revenue. */
      messages = inst.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).reverse();
      rendreFil();
      marquerLu();
    }, (err) => console.warn('[testeurs] fil', err));
  }

  const surConversations = () => { rendreListe(); rendreFil(); marquerLu(); };
  [K.conversationsTesteurs, K.testeurs, K.campagnesToutes, K.projets].forEach((c) => lot.sur(c, surConversations));
  rendreListe();
  rendreFil(true);
  return () => { if (arretFil) arretFil(); retraits.forEach((r) => r()); lot.fin(); };
};
