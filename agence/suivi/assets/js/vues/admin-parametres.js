/* ==========================================================================
   Les paramètres du cockpit : l'équipe, la clé d'administration, les
   vocabulaires en service, l'état des intégrations.
   ========================================================================== */

import { echapper, TYPES, STATUTS, TYPES_PROJET, CATEGORIES_FICHIER, STATUTS_PROJET } from '../noyau.js';
import { icone, avatar, ligne, vide, squelette, titrePage, sur, modale, toast, agir, lireForme, valider, obligatoire, emailValide, encart } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { appelServeur, cleEstPosee, demanderCle, verrouiller, surCle, URL_SUIVI } from '../serveur.js';

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Paramètres');
  filAriane([{ libelle: 'Paramètres' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const rendre = () => {
    const equipe = magasin.lire(K.equipe) || [];
    sortie.innerHTML = `<div class="page" style="max-width:860px">
      <div class="page-tete"><div><h1>Paramètres</h1><p class="chapo">L'équipe, la clé, et ce que la plateforme sait faire.</p></div><div class="actions"><a class="btn btn-secondaire" href="#/moi">${icone('utilisateur')} Mon profil</a></div></div>

      <section class="section" style="margin-top:0"><div class="section-tete"><h2>Clé d'administration</h2></div>
        <div class="carte rang-espace"><div><p class="t-corps-fort">${cleEstPosee() ? 'Clé posée sur cet appareil' : 'Aucune clé sur cet appareil'}</p><p class="t-petit t-2">Elle autorise les écritures qui passent par la fonction serveur : projets, clients, invitations, pièces comptables, paiements. Elle ne quitte jamais ce navigateur.</p></div>
          <div class="rang">${cleEstPosee() ? `<button class="btn btn-secondaire" type="button" data-verrouiller>${icone('cadenas')} Verrouiller</button>` : ''}<button class="btn btn-principal" type="button" data-cle>${icone('cle')} ${cleEstPosee() ? 'Changer la clé' : 'Poser la clé'}</button></div></div>
      </section>

      <section class="section"><div class="section-tete"><h2>Équipe Capmedia</h2><button class="btn btn-secondaire btn-petit" type="button" data-ajouter>${icone('plus')} Ajouter un membre</button></div>
        ${equipe.length ? `<div class="liste">${equipe.map((e) => ligne({ titre: `<span class="rang" style="gap:10px">${avatar(e.nom || e.email, { equipe: true })} ${echapper(e.nom || e.email)}</span>`, sous: `${echapper(e.email || '')} · ${e.role === 'admin' ? 'Administrateur' : 'Agent'}${e.actif === false ? ' · désactivé' : ''}`, attrs: 'style="cursor:default"' })).join('')}</div>` : vide({ icone: 'utilisateurs', titre: 'Aucun membre', compact: true })}
        <p class="t-micro t-3" style="margin-top:8px">Un membre d'équipe voit tous les projets. Sa fiche est écrite par le serveur, jamais depuis le navigateur.</p>
      </section>

      <section class="section"><div class="section-tete"><h2>Identité et numérotation</h2></div>
        <div class="carte"><dl class="faits"><div class="fait"><dt>Expéditeur des e-mails</dt><dd>Capmedia Digital · contact@capmedia.app</dd></div><div class="fait"><dt>Numéros de demande</dt><dd>RÉFÉRENCE-001, par projet, posés par le serveur</dd></div><div class="fait"><dt>Fonction serveur</dt><dd class="t-mono t-petit">${echapper(URL_SUIVI)}</dd></div><div class="fait"><dt>Stockage des fichiers</dt><dd>projets / projet / tickets, documents, fichiers</dd></div></dl></div>
      </section>

      <section class="section"><div class="section-tete"><h2>Vocabulaires en service</h2></div>
        <div class="grille grille-2">
          <div class="carte carte--creuse"><p class="surtitre">Natures de demande</p><p class="t-petit" style="margin-top:8px">${Object.values(TYPES).map((t) => echapper(t.libelle)).join(' · ')}</p></div>
          <div class="carte carte--creuse"><p class="surtitre">Statuts de demande</p><p class="t-petit" style="margin-top:8px">${Object.values(STATUTS).map((s) => echapper(s.libelle)).join(' · ')}</p></div>
          <div class="carte carte--creuse"><p class="surtitre">Types de projet</p><p class="t-petit" style="margin-top:8px">${Object.values(TYPES_PROJET).map(echapper).join(' · ')}</p></div>
          <div class="carte carte--creuse"><p class="surtitre">Statuts de projet</p><p class="t-petit" style="margin-top:8px">${Object.values(STATUTS_PROJET).map((s) => echapper(s.libelle)).join(' · ')}</p></div>
          <div class="carte carte--creuse"><p class="surtitre">Catégories de fichiers</p><p class="t-petit" style="margin-top:8px">${Object.values(CATEGORIES_FICHIER).map(echapper).join(' · ')}</p></div>
        </div>
        <p class="t-micro t-3" style="margin-top:8px">Ces listes vivent dans le code et dans les règles de sécurité : les changer se fait par une mise à jour, pas depuis cet écran.</p>
      </section>

      <section class="section"><div class="section-tete"><h2>Intégrations</h2></div>
        ${encart('<strong>Brevo</strong> envoie les e-mails transactionnels depuis contact@capmedia.app. La clé vit dans un secret serveur. <strong>Paiement en ligne</strong> : l\'architecture est prête pour Stripe, l\'intégration se branchera dans la fonction serveur, sans donnée bancaire dans la plateforme.', 'info')}
      </section>
    </div>`;
  };
  const gestes = sur(sortie, 'click', '[data-cle], [data-verrouiller], [data-ajouter]', async (el) => {
    if (el.hasAttribute('data-cle')) { await demanderCle(); rendre(); return; }
    if (el.hasAttribute('data-verrouiller')) { verrouiller(); toast('Clé retirée de cet appareil.'); rendre(); return; }
    const m = modale({ titre: 'Ajouter un membre', sousTitre: 'Il se connecte par lien e-mail, comme tout le monde.', corps: `<form class="forme" id="f-eq" novalidate><div class="groupe"><label class="etiquette-champ" for="e-nom">Nom</label><input class="champ" id="e-nom" name="nom"></div><div class="groupe"><label class="etiquette-champ" for="e-email">E-mail</label><input class="champ" id="e-email" name="email" type="email"></div><div class="groupe"><label class="etiquette-champ" for="e-role">Rôle</label><select class="select" id="e-role" name="role"><option value="agent">Agent</option><option value="admin">Administrateur</option></select></div></form>`, pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-eq">Ajouter</button>' });
    m.el.querySelector('#f-eq').addEventListener('submit', async (e) => { e.preventDefault(); if (!valider(e.target, { nom: obligatoire(), email: (v) => obligatoire()(v) || emailValide()(v) })) return; if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('ajouterEquipe', lireForme(e.target)), 'Membre ajouté.')) m.fermer(true); });
  });
  lot.sur(K.equipe, rendre);
  lot.ajouter(surCle(() => { if (sortie.isConnected) rendre(); }));
  return () => { gestes(); lot.fin(); };
};
