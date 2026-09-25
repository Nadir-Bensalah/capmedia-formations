/* ==========================================================================
   L'équipe Capmedia : qui travaille dans le cockpit, avec quel rôle, sur
   quels projets.

   Un administrateur voit tout et administre l'équipe. Un agent voit les
   projets qu'on lui confie, et ce qu'on lui délègue en plus. Désactiver
   ferme tout, tout de suite, y compris une session déjà ouverte : ce n'est
   pas un masque à l'écran, c'est le serveur et les règles qui refusent.
   Le dernier administrateur actif ne peut être ni désactivé, ni
   rétrogradé, ni retiré.
   ========================================================================== */

import { echapper, dateCourte, peut, ROLES_EQUIPE, PERMISSIONS, PERMISSIONS_DELEGABLES, SOCLE_EQUIPE } from '../noyau.js';
import { icone, avatar, ligne, vide, squelette, titrePage, sur, modale, agir, lireForme, valider, obligatoire, emailValide, encart, confirmer, menu, pastilleTexte } from '../ui.js';
import * as magasin from '../magasin.js';
import { K } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { appelServeur } from '../serveur.js';

const nomRole = (r) => ROLES_EQUIPE[r] || 'Rôle inconnu';

/* Le formulaire d'une fiche : rôle, et pour un agent ses projets et ce
   qu'on lui délègue. Les cases de projets ne servent qu'à un agent. */
const formulaire = (fiche, projets) => {
  const role = (fiche && fiche.role) || 'agent';
  const siens = new Set((fiche && fiche.projets) || []);
  const deleguees = new Set((fiche && fiche.permissions) || []);
  const socleAgent = new Set(SOCLE_EQUIPE.agent);
  return `
    ${fiche ? '' : `<div class="forme-rang">
      <div class="groupe"><label class="etiquette-champ" for="eq-nom">Nom</label><input class="champ" id="eq-nom" name="nom" maxlength="120" autocomplete="off"></div>
      <div class="groupe"><label class="etiquette-champ" for="eq-email">Adresse e-mail</label><input class="champ" id="eq-email" name="email" type="email" autocomplete="off"></div>
    </div>`}
    <div class="groupe"><span class="etiquette-champ">Rôle</span>
      <label class="interrupteur"><input type="radio" name="role" value="agent" ${role === 'agent' ? 'checked' : ''}><i></i> Agent : travaille sur les projets qu'on lui confie</label>
      <label class="interrupteur"><input type="radio" name="role" value="admin" ${role === 'admin' ? 'checked' : ''}><i></i> Administrateur : voit tout, administre l'équipe, les clients et la finance</label>
    </div>
    <div data-agent ${role === 'admin' ? 'hidden' : ''}>
      <div class="groupe"><span class="etiquette-champ">Ses projets</span>
        ${projets.length ? `<div class="pile" style="gap:4px;max-height:220px;overflow:auto">${projets.map((p) => `<label class="interrupteur"><input type="checkbox" name="projets" value="${echapper(p.id)}" ${siens.has(p.id) ? 'checked' : ''}><i></i> ${echapper(p.nom || p.id)}</label>`).join('')}</div>` : '<p class="aide">Aucun projet pour l\'instant.</p>'}
        <p class="aide">Un agent ne voit que ces projets : ni les autres, ni leurs clients.</p>
      </div>
      <div class="groupe"><span class="etiquette-champ">Ce qu'il peut faire en plus</span>
        <div class="pile" style="gap:4px">${PERMISSIONS_DELEGABLES.filter((p) => !socleAgent.has(p)).map((p) => `<label class="interrupteur"><input type="checkbox" name="permissions" value="${echapper(p)}" ${deleguees.has(p) ? 'checked' : ''}><i></i> ${echapper(PERMISSIONS[p])}</label>`).join('')}</div>
        <p class="aide">Par défaut, un agent consulte ses projets, répond aux demandes, tient les tâches, fichiers, réunions et validations, et participe à la recette.</p>
      </div>
    </div>`;
};

const brancherRole = (racine) => {
  const bloc = racine.querySelector('[data-agent]');
  racine.querySelectorAll('[name="role"]').forEach((r) => r.addEventListener('change', () => {
    if (bloc) bloc.hidden = racine.querySelector('[name="role"]:checked').value === 'admin';
  }));
};

const lire = (forme) => {
  const d = lireForme(forme);
  const liste = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
  return { ...d, projets: liste(d.projets), permissions: liste(d.permissions) };
};

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  const gerer = peut(session, 'equipe.gerer');
  titrePage('Équipe');
  filAriane([{ libelle: 'Équipe' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  const rendre = () => {
    const equipe = (magasin.lire(K.equipe) || []).slice()
      .sort((a, b) => Number(b.actif === true) - Number(a.actif === true) || String(a.nom || '').localeCompare(String(b.nom || '')));
    const projets = magasin.lire(K.projets) || [];
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || pid);
    const adminsActifs = equipe.filter((e) => e.actif === true && e.role === 'admin').length;
    sortie.innerHTML = `<div class="page" style="max-width:920px">
      <div class="page-tete"><div><h1>Équipe</h1><p class="chapo">Qui travaille dans le cockpit, avec quel rôle, sur quels projets.</p></div>
        <div class="actions">${gerer ? `<button class="btn btn-principal" type="button" data-action="ajouter">${icone('plus')} Ajouter un membre</button>` : ''}</div></div>
      ${gerer ? '' : encart("Seul un administrateur modifie l'équipe. Vous voyez ici qui y travaille.", 'info')}
      ${equipe.length ? `<div class="liste">${equipe.map((e) => {
        const actif = e.actif === true;
        const portee = e.role === 'admin' ? 'Tous les projets' : ((e.projets || []).length ? (e.projets || []).map(nomProjet).join(', ') : 'Aucun projet confié');
        const dernier = actif && e.role === 'admin' && adminsActifs === 1;
        return ligne({
          titre: `<span class="rang" style="gap:10px">${avatar(e.nom || e.email, { equipe: true })} ${echapper(e.nom || e.email)} ${pastilleTexte(nomRole(e.role), e.role === 'admin' ? 'violet' : 'bleu')} ${actif ? pastilleTexte('Actif', 'vert') : pastilleTexte('Désactivé', 'gris')}${dernier ? ` ${pastilleTexte('Dernier administrateur', 'ambre')}` : ''}</span>`,
          sous: `${echapper(e.email || '')} · ${echapper(portee)}${(e.permissions || []).length ? ` · en plus : ${echapper(e.permissions.map((p) => PERMISSIONS[p] || p).join(', '))}` : ''}${!actif && e.desactiveLe ? ` · désactivé le ${echapper(dateCourte(e.desactiveLe))}` : ''}`,
          fin: gerer ? `<button class="btn-icone" type="button" data-action="menu" data-uid="${echapper(e.id)}" aria-label="Gérer ${echapper(e.nom || e.email)}">${icone('points')}</button>` : '',
          attrs: `data-membre="${echapper(e.id)}"`,
        });
      }).join('')}</div>` : vide({ icone: 'utilisateurs', titre: 'Aucun membre', compact: true })}
      <p class="t-micro t-3" style="margin-top:8px">Une fiche d'équipe est écrite par le serveur, jamais depuis le navigateur. Désactiver un membre ferme aussi sa session en cours.</p>
    </div>`;
  };

  const gestes = sur(sortie, 'click', '[data-action]', async (el) => {
    const projets = magasin.lire(K.projets) || [];
    if (el.dataset.action === 'ajouter') {
      const m = modale({
        titre: 'Ajouter un membre', sousTitre: "Il reçoit un e-mail et se connecte avec un code à six chiffres.", large: true,
        corps: `<form class="forme" id="f-eq" novalidate>${formulaire(null, projets)}</form>`,
        pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-eq">Ajouter</button>',
      });
      brancherRole(m.el);
      m.el.querySelector('#f-eq').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!valider(e.target, { nom: obligatoire(), email: (v) => obligatoire()(v) || emailValide()(v) })) return;
        if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('ajouterEquipe', lire(e.target)), 'Membre ajouté, son invitation est partie.')) m.fermer(true);
      });
      return;
    }
    if (el.dataset.action !== 'menu') return;
    const uid = el.dataset.uid;
    const fiche = (magasin.lire(K.equipe) || []).find((x) => x.id === uid);
    if (!fiche) return;
    const nom = fiche.nom || fiche.email;
    menu(el, [
      { libelle: 'Modifier le rôle et les projets', icone: 'edit', action: () => {
        const m = modale({
          titre: nom, sousTitre: fiche.email, large: true,
          corps: `<form class="forme" id="f-eq-maj" novalidate>${formulaire(fiche, projets)}</form>`,
          pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-eq-maj">Enregistrer</button>',
        });
        brancherRole(m.el);
        m.el.querySelector('#f-eq-maj').addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = lire(e.target);
          if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('modifierEquipe', { uid, role: d.role, projets: d.projets, permissions: d.permissions }), 'Fiche mise à jour.')) m.fermer(true);
        });
      } },
      fiche.actif === true
        ? { libelle: 'Désactiver', icone: 'cadenas', danger: true, action: async () => {
          if (await confirmer({ titre: `Désactiver ${nom} ?`, texte: "Sa session en cours est fermée tout de suite, et il ne peut plus se connecter. Rien n'est supprimé : vous pourrez le réactiver.", ok: 'Désactiver', danger: true })) {
            await agir(null, () => appelServeur('desactiverEquipe', { uid }), 'Membre désactivé.');
          }
        } }
        : { libelle: 'Réactiver', icone: 'check', action: () => agir(null, () => appelServeur('reactiverEquipe', { uid }), 'Membre réactivé.') },
      '-',
      { libelle: "Retirer de l'équipe", icone: 'corbeille', danger: true, action: async () => {
        if (await confirmer({ titre: `Retirer ${nom} de l'équipe ?`, texte: "Son accès et son compte de connexion sont supprimés. Son nom reste sur ce qu'il a fait (demandes, tâches). C'est définitif.", ok: 'Retirer', danger: true })) {
          await agir(null, () => appelServeur('retirerEquipe', { uid }), "Membre retiré de l'équipe.");
        }
      } },
    ]);
  });

  [K.equipe, K.projets].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};
