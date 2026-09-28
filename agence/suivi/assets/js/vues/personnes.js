/* ==========================================================================
   « Les personnes » d'un projet. Rien ne disait au client qui est qui : le
   nom du responsable Capmedia dans l'en-tête, des prénoms sur les étapes,
   et jamais son propre rôle. Cette section, dans l'aperçu, répond aux deux
   questions : qui, chez Capmedia, et qui, de son côté, avec le rôle de
   chacun.

   Côté client, les interlocuteurs ne se lisent pas (leur adresse, leur
   invitation restent à l'équipe) : le serveur tient un miroir
   `personnesClient` sur la fiche du projet, avec le nom et le rôle
   seulement. Côté équipe, la section lit les interlocuteurs eux-mêmes.
   ========================================================================== */

import { echapper, estResponsable, ROLES_CLIENT } from '../noyau.js';
import { icone, avatar, pastilleTexte, modale, agir, lireForme, valider, obligatoire, emailValide, toast, sur } from '../ui.js';
import { appelServeur } from '../serveur.js';

const nomEquipe = (equipe, uid) => ((equipe.find((e) => e.id === uid) || {}).nom || '');

/* Une phrase, la même partout, pour dire ce que le rôle change. */
export const PHRASE_ROLE = 'Le responsable engage votre société : devis, factures et certaines validations lui sont réservés. Le collaborateur suit le projet, échange et pose des demandes.';

const lignePersonne = ({ nom, sous, role, moi }) => `<div class="ligne ligne--inerte ligne--sans-icone" style="cursor:default">
    <span class="ligne-corps"><span class="ligne-titre rang" style="gap:10px">${avatar(nom || '')} ${echapper(nom || '')}${moi ? ' <span class="t-3" style="font-weight:400">(vous)</span>' : ''}</span>${sous ? `<span class="ligne-sous">${echapper(sous)}</span>` : ''}</span>
    <span class="ligne-fin">${role ? pastilleTexte(ROLES_CLIENT[role] || role, role === 'responsable' ? 'violet' : 'bleu') : ''}</span>
  </div>`;

/**
 * La section, pour l'aperçu d'un projet. `d` porte `equipe` (l'annuaire
 * côté client, les fiches côté équipe) et `interlocuteurs` (équipe seule).
 */
export const personnesHtml = (projet, env, d = {}) => {
  if (!projet || projet.interne) return '';
  const equipe = env.role === 'equipe';
  const uid = env.session.utilisateur.uid;
  const annuaire = d.equipe || [];
  const pid = projet.id;

  /* Chez Capmedia : le responsable du projet, et, pour l'équipe qui lit ses
     propres fiches, les agents affectés. Un client ne lit que l'annuaire
     (les noms) : il voit le responsable, et sait que l'équipe est derrière. */
  const chezNous = [];
  if (projet.responsable) chezNous.push({ nom: nomEquipe(annuaire, projet.responsable) || 'Capmedia', sous: 'Responsable du projet chez Capmedia', moi: equipe && projet.responsable === uid });
  if (equipe) {
    annuaire.filter((e) => e.id !== projet.responsable && e.actif !== false && e.role === 'agent' && (e.projets || []).includes(pid))
      .forEach((e) => chezNous.push({ nom: e.nom || '', sous: 'Sur le projet', moi: e.id === uid }));
  }

  /* De votre côté : le miroir pour le client, les interlocuteurs actifs
     pour l'équipe. */
  const cote = equipe
    ? (d.interlocuteurs || []).filter((i) => i.statut === 'actif' && ROLES_CLIENT[i.role]).map((i) => ({ uid: i.uid, nom: i.nom || i.email, role: i.role }))
    : (Array.isArray(projet.personnesClient) ? projet.personnesClient : []).filter((p) => p && ROLES_CLIENT[p.role]);
  const tri = (a, b) => (a.role === b.role ? String(a.nom || '').localeCompare(String(b.nom || '')) : (a.role === 'responsable' ? -1 : 1));
  const responsable = !equipe && estResponsable(env.session, projet);

  return `<section class="section" id="personnes">
    <div class="section-tete"><h2>Les personnes</h2>${responsable ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="inviter-collegue" data-projet="${echapper(pid)}">${icone('plus')} Inviter un collègue</button>` : ''}</div>
    <div class="grille grille-2" style="gap:var(--e-4)">
      <div class="carte carte--creuse">
        <p class="surtitre">Chez Capmedia</p>
        <div class="liste liste--serree" style="margin-top:8px">${chezNous.length ? chezNous.map(lignePersonne).join('') : lignePersonne({ nom: 'Équipe Capmedia', sous: 'Votre interlocuteur sera nommé ici.' })}</div>
        ${!equipe ? '<p class="t-micro t-3" style="margin-top:8px">Toute l\'équipe Capmedia lit ce projet ; c\'est le responsable qui vous répond.</p>' : ''}
      </div>
      <div class="carte carte--creuse">
        <p class="surtitre">${equipe ? 'Côté client' : 'De votre côté'}</p>
        <div class="liste liste--serree" style="margin-top:8px">${cote.length ? cote.slice().sort(tri).map((p) => lignePersonne({ nom: p.nom, role: p.role, moi: !equipe && p.uid === uid })).join('') : lignePersonne({ nom: equipe ? 'Personne pour l\'instant' : 'Vous', sous: equipe ? 'Onglet Accès client.' : '' })}</div>
        <p class="t-micro t-3" style="margin-top:8px">${echapper(PHRASE_ROLE)}</p>
      </div>
    </div>
  </section>`;
};

/* --------------------------------------------------------------------------
   Inviter un collègue : le responsable seul, une fenêtre (nom, e-mail), et
   le serveur ajoute un collaborateur (jamais un autre responsable depuis
   l'écran du client). Branché une fois sur le document : l'aperçu du
   projet ne connaît pas ce geste, et n'a pas à le connaître.
   -------------------------------------------------------------------------- */

const inviterCollegue = (pid) => {
  const m = modale({
    titre: 'Inviter un collègue',
    sousTitre: 'Il rejoint ce projet comme collaborateur : il suit, échange et pose des demandes. Les devis et les factures restent à vous.',
    corps: `<form class="forme" id="f-collegue" novalidate>
      <div class="forme-rang">
        <div class="groupe"><label class="etiquette-champ" for="co-nom">Nom</label><input class="champ" id="co-nom" name="nom" maxlength="120" autocomplete="off"></div>
        <div class="groupe"><label class="etiquette-champ" for="co-email">Adresse e-mail</label><input class="champ" id="co-email" name="email" type="email" autocomplete="off"></div>
      </div>
      <p class="aide">Il reçoit une invitation par e-mail, puis se connecte avec un code, comme vous.</p>
    </form>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-collegue">Inviter</button>',
  });
  m.el.querySelector('#f-collegue').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(e.target, { nom: obligatoire('Son nom, pour le reconnaître.'), email: (v) => obligatoire()(v) || emailValide()(v) })) return;
    const f = lireForme(e.target);
    let r = null;
    if (await agir(m.pied.querySelector('[type="submit"]'), async () => { r = await appelServeur('inviterCollegue', { projet: pid, nom: f.nom, email: f.email }); })) {
      m.fermer(true);
      const etat = r && r.invitation ? r.invitation.etat : '';
      toast(etat === 'envoyee' ? 'Invitation envoyée à votre collègue.' : 'Collègue ajouté. Capmedia lui transmettra son invitation.');
    }
  });
  return m.fin;
};

let branche = false;
export const brancherPersonnes = () => {
  if (branche) return;
  branche = true;
  sur(document, 'click', '[data-action="inviter-collegue"]', (el) => { inviterCollegue(el.dataset.projet); });
};
brancherPersonnes();
