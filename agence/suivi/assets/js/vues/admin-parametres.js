/* ==========================================================================
   Les paramètres du cockpit : les vocabulaires en service et l'état des
   intégrations. L'équipe a sa propre page (admin-equipe.js). Il n'y a plus
   de clé d'administration : le serveur lit l'identité de la personne
   connectée.
   ========================================================================== */

import { echapper, TYPES, STATUTS, TYPES_PROJET, CATEGORIES_FICHIER, STATUTS_PROJET } from '../noyau.js';
import { icone, squelette, titrePage, encart } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { URL_SUIVI } from '../serveur.js';

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Paramètres');
  filAriane([{ libelle: 'Paramètres' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const rendre = () => {
    const equipe = magasin.lire(K.equipe) || [];
    sortie.innerHTML = `<div class="page" style="max-width:860px">
      <div class="page-tete"><div><h1>Paramètres</h1><p class="chapo">Ce que la plateforme sait faire, et comment elle est branchée.</p></div><div class="actions"><a class="btn btn-secondaire" href="#/equipe">${icone('utilisateurs')} L'équipe (${equipe.filter((e) => e.actif === true).length})</a><a class="btn btn-secondaire" href="#/moi">${icone('utilisateur')} Mon profil</a></div></div>

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
  lot.sur(K.equipe, rendre);
  return () => { lot.fin(); };
};
