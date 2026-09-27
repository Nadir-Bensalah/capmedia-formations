/* ==========================================================================
   Les conversations des testeurs : une par testeur, à part des messages
   de projet. À gauche, qui a écrit et ce qui attend une réponse ; à
   droite, le fil, en direct, et la réponse. Le serveur tient les compteurs
   (hubMessageTesteur) ; ouvrir un fil remet celui de l'équipe à zéro.
   ========================================================================== */

import { echapper, depuis, enDate, bdd, doc, collection, query, orderBy, limit, onSnapshot, addDoc, updateDoc, serverTimestamp } from '../noyau.js';
import { icone, vide, squelette, titrePage, toast, agir, messageHtml } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  const uid = env.session.utilisateur.uid;
  const nom = (env.session.equipe && env.session.equipe.nom) || env.session.utilisateur.displayName || 'Capmedia';
  const choisi = ctx.params.uid || '';
  titrePage('Testeurs');
  filAriane([{ libelle: 'Testeurs' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  let messages = [];
  let arretFil = null;

  const conversations = () => magasin.lire(K.conversationsTesteurs) || [];
  const testeurs = () => magasin.lire(K.testeurs) || [];
  const nomDe = (c) => { const t = testeurs().find((x) => x.id === c.id) || {}; return c.prenom || t.prenom || c.email || t.email || 'Testeur'; };

  const marquerLu = async () => {
    const c = conversations().find((x) => x.id === choisi);
    if (!c || !Number(c.nonLusEquipe || 0)) return;
    try { await updateDoc(doc(bdd, 'conversationsTesteurs', choisi), { nonLusEquipe: 0 }); } catch (e) { /* rien */ }
  };

  const rendreFil = () => {
    const fil = sortie.querySelector('#tm-fil');
    if (!fil) return;
    fil.innerHTML = messages.length
      ? messages.map((m) => messageHtml(m, { moi: uid })).join('')
      : vide({ icone: 'messages', titre: 'Rien encore', texte: 'Écrivez-lui : il reçoit le message dans sa bulle, en direct, et par e-mail.', compact: true });
    fil.scrollTop = fil.scrollHeight;
  };

  const rendre = () => {
    const liste = conversations();
    const courante = liste.find((x) => x.id === choisi);
    sortie.innerHTML = `<div class="page page--large">
      <div class="page-tete"><div><h1>Testeurs</h1><p class="chapo">Ce que les testeurs vous écrivent depuis leur espace, à part des projets.</p></div></div>
      <div class="tm-deux">
        <aside class="tm-liste">
          ${liste.length ? liste.map((c) => `
            <button class="ligne${c.id === choisi ? ' ligne--active' : ''}" type="button" data-conv="${echapper(c.id)}">
              <span class="ligne-icone${Number(c.nonLusEquipe || 0) ? ' ligne-icone--rouge' : ''}">${icone('smartphone')}</span>
              <span class="ligne-corps"><span class="ligne-titre">${echapper(nomDe(c))}${Number(c.nonLusEquipe || 0) ? ` <span class="badge badge--rouge">${echapper(String(c.nonLusEquipe))}</span>` : ''}</span>
                <span class="ligne-sous">${c.dernier ? `${c.dernier.cote === 'equipe' ? 'Vous : ' : ''}${echapper(String(c.dernier.texte || '').slice(0, 80))}` : ''}</span></span>
              <span class="ligne-fin t-micro t-3">${c.maj ? echapper(depuis(c.maj)) : ''}</span>
            </button>`).join('')
          : vide({ icone: 'messages', titre: 'Aucun message de testeur', texte: 'Quand un testeur écrit depuis la bulle de son espace, la conversation apparaît ici.', compact: true })}
        </aside>
        <section class="tm-fil-cadre">
          ${courante ? `
            <header class="tm-tete"><div><p class="surtitre">Testeur</p><h2>${echapper(nomDe(courante))}</h2><p class="t-petit t-2">${echapper(courante.email || '')}</p></div></header>
            <div class="tm-fil" id="tm-fil"></div>
            <form class="tm-repondre" id="tm-forme" novalidate>
              <textarea class="champ" id="tm-texte" rows="2" maxlength="4000" placeholder="Répondre à ${echapper(nomDe(courante))}…"></textarea>
              <button class="btn btn-principal" type="submit">${icone('envoyer')} Envoyer</button>
            </form>`
          : `<div class="tm-vide">${vide({ icone: 'messages', titre: 'Choisissez une conversation', texte: 'Le fil s\'ouvre ici, en direct.', compact: true })}</div>`}
        </section>
      </div>
    </div>`;
    rendreFil();
    const forme = sortie.querySelector('#tm-forme');
    if (forme) {
      const champ = forme.querySelector('#tm-texte');
      champ.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); forme.requestSubmit(); } });
      forme.addEventListener('submit', async (e) => {
        e.preventDefault();
        const texte = champ.value.trim();
        if (!texte) return;
        await agir(forme.querySelector('[type="submit"]'), async () => {
          try {
            await addDoc(collection(bdd, 'conversationsTesteurs', choisi, 'messages'), { de: { uid, nom, cote: 'equipe' }, texte, pieces: [], date: serverTimestamp() });
            champ.value = '';
          } catch (err) { console.error(err); toast("Le message n'est pas parti.", 'erreur'); }
        });
      });
      setTimeout(() => champ.focus(), 50);
    }
  };

  sortie.addEventListener('click', (e) => {
    const b = e.target.closest('[data-conv]');
    if (b) naviguer(`/testeurs-messages/${b.dataset.conv}`);
  });

  if (choisi) {
    arretFil = onSnapshot(query(collection(bdd, 'conversationsTesteurs', choisi, 'messages'), orderBy('date', 'desc'), limit(300)), (inst) => {
      /* Les 300 plus récents, remis dans l'ordre : une fenêtre qui suit la fin
         de la conversation, jamais son début. */
      messages = inst.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      rendreFil();
      marquerLu();
    }, (err) => console.warn('[testeurs] fil', err));
  }

  [K.conversationsTesteurs, K.testeurs].forEach((c) => lot.sur(c, rendre));
  rendre();
  return () => { if (arretFil) arretFil(); lot.fin(); };
};
