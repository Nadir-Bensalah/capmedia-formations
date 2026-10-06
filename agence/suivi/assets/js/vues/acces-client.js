/* ==========================================================================
   L'accès du client à un projet : qui entre, avec quel rôle, où en est son
   invitation, et ce que le projet envoie.

   Deux réglages que l'on ne confond pas :
   - « Ouvert au client » : fermé, le client n'a AUCUN accès et ne reçoit
     RIEN, ni e-mail, ni notification. On prépare en paix. La première
     ouverture envoie une seule lettre par personne, avec ce qui l'attend.
   - « E-mails au client » : sur un projet ouvert, les couper laisse
     l'espace vivre (notifications, activité), sans rien envoyer par e-mail.

   Tout passe par le serveur (acces.js) : l'écran ne donne aucun accès, il
   demande.
   ========================================================================== */

import { echapper, dateCourte, dateHeure, peut, ROLES_CLIENT, ETATS_INVITATION, etatInvitation, enDate, depuis } from '../noyau.js';
import { icone, avatar, ligne, vide, modale, agir, lireForme, valider, obligatoire, emailValide, encart, confirmer, menu, pastilleTexte, copier, toast, squelette } from '../ui.js';
import { appelServeur } from '../serveur.js';
import { interneDuProjet, K } from '../donnees.js';
import * as magasin from '../magasin.js';

/* --------------------------------------------------------------------------
   La présence d'un interlocuteur (équipe seule)

   Le Hub du client bat une fois par minute tant qu'il est ouvert et
   visible (presence-client.js). En ligne : un battement de moins de deux
   minutes, et pas de « parti » depuis. Sinon « Vu il y a… », ou « Jamais
   connecté ». La pastille se patche en place, sans redessiner la page :
   un battement qui ne change pas le libellé ne touche à rien.
   -------------------------------------------------------------------------- */

const EN_LIGNE_MS = 2 * 60 * 1000;

export const etatPresence = (i, presences, maintenant = Date.now()) => {
  const p = i && i.uid ? (presences || []).find((x) => x.id === i.uid) : null;
  const vu = p ? enDate(p.vu) : null;
  if (vu && p.enLigne === true && maintenant - vu.getTime() < EN_LIGNE_MS) return { libelle: 'En ligne', voile: 'vert' };
  if (vu) {
    const d = depuis(vu);
    return { libelle: d === "à l'instant" ? "Vu à l'instant" : (/^il y a/.test(d) ? `Vu ${d}` : `Vu le ${d}`), voile: 'gris' };
  }
  if (!i || !i.uid || etatInvitation(i) !== 'acceptee') return { libelle: 'Jamais connecté', voile: 'gris' };
  return { libelle: 'Dernière visite inconnue', voile: 'gris' };
};

const pucePresence = (e) => `<span class="puce puce--${e.voile}"><i aria-hidden="true"></i>${echapper(e.libelle)}</span>`;

const presenceHtml = (i, pid) => {
  const e = etatPresence(i, magasin.lire(K.presencesClient(pid)));
  return `<span class="presence-client" data-presence="${echapper(i.id)}" data-libelle="${echapper(e.libelle)}">${pucePresence(e)}</span>`;
};

/**
 * Tient les pastilles de présence à jour sur la page : à chaque battement
 * reçu, et toutes les quinze secondes (un battement qui vieillit fait
 * passer « En ligne » à « Vu il y a » sans que rien n'arrive). Ne réécrit
 * qu'une pastille dont le libellé change. Rend la fonction qui arrête.
 */
export const brancherPresences = (racine, pid) => {
  const maj = () => {
    const spans = racine.querySelectorAll('[data-presence]');
    if (!spans.length) return;
    const tous = magasin.lire(K.interlocuteurs(pid)) || [];
    const presences = magasin.lire(K.presencesClient(pid));
    spans.forEach((el) => {
      const i = tous.find((x) => x.id === el.dataset.presence);
      if (!i) return;
      const e = etatPresence(i, presences);
      if (el.dataset.libelle === e.libelle) return;
      el.dataset.libelle = e.libelle;
      el.innerHTML = pucePresence(e);
    });
  };
  const retrait = magasin.sur(K.presencesClient(pid), maj);
  const minuterie = setInterval(maj, 15000);
  return () => { retrait(); clearInterval(minuterie); };
};

/* --------------------------------------------------------------------------
   L'historique des connexions (menu ⋯), lu par le serveur
   -------------------------------------------------------------------------- */

const MODES_CONNEXION = {
  code: 'Code reçu par e-mail',
  cle: "Clé d'accès (Touch ID, Windows Hello)",
  reprise: "Session reprise à l'ouverture",
  lien: 'Lien de connexion',
};

const ouvrirHistorique = async (i, pid) => {
  const nom = i.nom || i.email;
  const m = modale({
    titre: 'Historique des connexions', sousTitre: `${nom} · les 200 dernières, la plus récente en haut.`,
    corps: `<div id="historique-connexions">${squelette('lignes', 4)}</div>`,
    pied: '<button class="btn btn-secondaire" type="button" data-fermer>Fermer</button>',
  });
  const zone = m.el.querySelector('#historique-connexions');
  try {
    const r = await appelServeur('historiqueConnexions', { projet: pid, cle: i.id });
    const entrees = (r && r.entrees) || [];
    zone.innerHTML = entrees.length
      ? `<div class="liste">${entrees.map((x) => ligne({
        titre: echapper(dateHeure(x.le ? new Date(x.le) : null) || 'Date inconnue'),
        sous: `${echapper(x.appareil || 'Appareil inconnu')} · ${echapper(MODES_CONNEXION[x.mode] || 'Mode inconnu')}`,
      })).join('')}</div>`
      : vide({ icone: 'utilisateurs', titre: 'Aucune connexion relevée', texte: i.uid ? "Rien n'a encore été noté pour cette personne." : "Elle ne s'est encore jamais connectée.", compact: true });
  } catch (e) {
    zone.innerHTML = encart(e.message || "L'historique n'a pas pu être lu.", 'alerte');
  }
};

const pastilleRole = (role) => (ROLES_CLIENT[role]
  ? pastilleTexte(ROLES_CLIENT[role], role === 'responsable' ? 'violet' : 'bleu')
  : pastilleTexte('Rôle à définir', 'ambre'));

const pastilleInvitation = (i) => {
  const etat = etatInvitation(i);
  const e = ETATS_INVITATION[etat];
  return `<span data-astuce="${echapper(e.aide)}">${pastilleTexte(e.libelle, e.voile)}</span>`;
};

/** La section « Accès client » d'un projet, pour l'équipe. */
export const accesHtml = (d, { pid, env }) => {
  const projet = d.projet;
  if (projet.interne) return `<section class="section" style="margin-top:0">${encart("C'est un projet interne : il n'a pas de client, personne n'y accède de l'extérieur et rien ne part par e-mail.", 'info')}</section>`;
  const ouvert = projet.ouvert === true;
  const coupes = projet.emailsClient === 'coupes';
  const gererAcces = peut(env.session, 'acces.gerer', pid);
  const gererOuverture = peut(env.session, 'projets.ouvrir', pid);
  const tous = (d.interlocuteurs || []).slice().sort((a, b) => String(a.nom || a.email).localeCompare(String(b.nom || b.email)));
  const actifs = tous.filter((i) => i.statut === 'actif');
  const retires = tous.filter((i) => i.statut !== 'actif');
  const responsables = actifs.filter((i) => i.role === 'responsable');

  const carteOuverture = `<div class="carte">
    <div class="rang-espace" style="align-items:flex-start;gap:16px">
      <div style="min-width:0">
        <p class="surtitre">Ouvert au client</p>
        <p class="t-titre-3" style="margin-top:4px">${ouvert ? 'Oui : les interlocuteurs actifs ont accès' : 'Non : personne n\'a accès, rien ne part'}</p>
        <p class="t-petit t-2" style="margin-top:4px">${ouvert
          ? `Ouvert${dateCourte(projet.ouvertLe) ? ` le ${echapper(dateCourte(projet.ouvertLe))}` : ''}. Refermer retire l'accès sans rien supprimer.`
          : "Tant qu'il est fermé, vous préparez le projet en interne : aucun e-mail, aucune notification, aucune invitation. La première ouverture envoie une lettre par personne, avec un résumé de ce qui l'attend, jamais l'historique."}</p>
      </div>
      ${gererOuverture ? (ouvert
        ? `<button class="btn btn-secondaire" type="button" data-action="acces-fermer">${icone('oeilFerme')} Refermer</button>`
        : `<button class="btn btn-principal" type="button" data-action="ouvrir-au-client"${responsables.length ? '' : ' disabled'}>${icone('utilisateurs')} Ouvrir au client</button>`) : ''}
    </div>
    ${!ouvert && !responsables.length ? `<p class="t-petit" style="margin-top:10px">${icone('alerte')} Ajoutez au moins un responsable avant d'ouvrir.</p>` : ''}
  </div>`;

  const carteEmails = `<div class="carte">
    <div class="rang-espace" style="align-items:flex-start;gap:16px">
      <div style="min-width:0">
        <p class="surtitre">E-mails au client</p>
        <p class="t-titre-3" style="margin-top:4px">${coupes ? 'Coupés' : 'Actifs'}</p>
        <p class="t-petit t-2" style="margin-top:4px">${coupes
          ? "Le client utilise son espace normalement et y voit ses notifications, mais aucun e-mail ne lui part (ni invitation, ni suivi, ni rappel). Le code de connexion, lui, part toujours."
          : 'Le client reçoit les e-mails du projet selon ses préférences. Les pièces comptables ne partent qu\'aux responsables.'}${ouvert ? '' : ' Sans effet tant que le projet est fermé : rien ne part de toute façon.'}</p>
        ${peut(env.session, 'systeme') ? `<p class="t-petit" style="margin-top:8px"><a href="#/emails?projet=${encodeURIComponent(pid)}" data-voir-emails>Voir les e-mails envoyés sur ce projet</a></p>` : ''}
      </div>
      ${gererOuverture ? `<button class="btn btn-secondaire" type="button" data-action="acces-emails" data-valeur="${coupes ? 'actifs' : 'coupes'}">${icone(coupes ? 'mail' : 'cadenas')} ${coupes ? 'Réactiver les e-mails' : 'Couper les e-mails'}</button>` : ''}
    </div>
  </div>`;

  const lignePersonne = (i) => ligne({
    titre: `<span class="rang" style="gap:10px">${avatar(i.nom || i.email)} ${echapper(i.nom || i.email)} ${i.statut === 'actif' ? presenceHtml(i, pid) : ''} ${pastilleRole(i.role)} ${i.statut === 'actif' ? pastilleInvitation(i) : pastilleTexte('Accès retiré', 'gris')}</span>`,
    sous: `${echapper(i.email)}${i.statut !== 'actif' && dateCourte(i.retireLe) ? ` · retiré le ${echapper(dateCourte(i.retireLe))}` : ''}${i.statut === 'actif' && i.invitation && dateHeure(i.invitation.envoyee) ? ` · invitée le ${echapper(dateHeure(i.invitation.envoyee))}` : ''}`,
    fin: gererAcces ? `<button class="btn-icone" type="button" data-action="acces-menu" data-cle="${echapper(i.id)}" aria-label="Gérer l'accès de ${echapper(i.nom || i.email)}">${icone('points')}</button>` : '',
    attrs: `data-interlocuteur="${echapper(i.id)}"`,
  });

  /* Ce qui attend un choix : les contacts sans rôle (aucun accès tant
     qu'on n'a pas choisi), et les points laissés par la migration. */
  const sansRole = actifs.filter((i) => !ROLES_CLIENT[i.role]);
  const points = interneDuProjet(pid).arbitragesAcces || [];
  const carteArbitrages = sansRole.length || points.length ? `<section class="section" id="arbitrages-acces">
    <div class="section-tete"><h2>À arbitrer</h2></div>
    ${sansRole.length ? encart(`${sansRole.length > 1 ? `${sansRole.length} personnes attendent` : 'Une personne attend'} un rôle : ${sansRole.map((i) => echapper(i.nom || i.email)).join(', ')}. Sans rôle, aucun accès et aucun e-mail, même projet ouvert. Choisissez « Passer responsable » ou « Passer collaborateur » dans son menu.`, 'attention') : ''}
    ${points.length ? `<div class="liste" style="margin-top:8px">${points.map((x, n) => ligne({
      titre: echapper(x.type === 'membre-sans-compte' ? 'Ancien membre sans compte' : x.type === 'adresse-autre-role' ? 'Adresse qui porte un autre rôle' : 'Point à trancher'),
      sous: echapper(x.detail || ''),
      fin: gererAcces ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="acces-classer" data-index="${n}">Classer</button>` : '',
    })).join('')}</div><p class="t-micro t-3" style="margin-top:8px">Laissés par la migration : aucun accès n'a été donné. Classer retire le point de la liste, sans rien changer d'autre.</p>` : ''}
  </section>` : '';

  return `<section class="section" style="margin-top:0">
    <div class="grille grille-2" style="gap:var(--e-4)">${carteOuverture}${carteEmails}</div>
  </section>
  ${carteArbitrages}
  <section class="section">
    <div class="section-tete"><h2>Qui a accès</h2>${gererAcces ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="acces-ajouter">${icone('plus')} Ajouter une personne</button>` : ''}</div>
    ${actifs.length ? `<div class="liste">${actifs.map(lignePersonne).join('')}</div>` : vide({ icone: 'utilisateurs', titre: 'Personne pour l\'instant', texte: "Ajoutez le responsable du projet chez le client, puis ses collaborateurs.", compact: true })}
    <p class="t-micro t-3" style="margin-top:8px">Le responsable engage le client : il accepte les devis, voit la finance et répond aux validations réservées. Le collaborateur suit le projet, échange, pose des demandes et répond aux validations ordinaires. L'accès se donne projet par projet : appartenir à la même société ne donne accès à rien.</p>
  </section>
  ${retires.length ? `<section class="section"><div class="section-tete"><h2>Accès retirés</h2></div><div class="liste">${retires.map(lignePersonne).join('')}</div>
    <p class="t-micro t-3" style="margin-top:8px">Ces personnes n'ont plus accès et ne reçoivent plus rien de ce projet. Leur nom reste sur ce qu'elles ont fait.</p></section>` : ''}`;
};

/** Les gestes de la section. Rend true si le geste a été traité. */
export const gesteAcces = async (el, d, { pid }) => {
  const action = el.dataset.action;
  if (!action || !action.startsWith('acces-')) return false;

  if (action === 'acces-fermer') {
    if (await confirmer({ titre: 'Refermer ce projet au client ?', texte: "Les interlocuteurs perdent l'accès immédiatement, même une session ouverte. Rien n'est supprimé, et vous pourrez rouvrir.", ok: 'Refermer', danger: true })) {
      await agir(null, () => appelServeur('fermerAuClient', { id: pid }), 'Projet refermé au client.');
    }
    return true;
  }
  if (action === 'acces-classer') {
    const x = (interneDuProjet(pid).arbitragesAcces || [])[Number(el.dataset.index)];
    if (x && await confirmer({ titre: 'Classer ce point ?', texte: "Il quitte la liste. Rien d'autre ne change : aucun accès n'est donné ni retiré.", ok: 'Classer' })) {
      await agir(el, () => appelServeur('classerArbitrageAcces', { id: pid, type: x.type, detail: x.detail }), 'Point classé.');
    }
    return true;
  }
  if (action === 'acces-emails') {
    const coupes = el.dataset.valeur === 'coupes';
    const ok = await confirmer(coupes
      ? { titre: 'Couper les e-mails du client ?', texte: "Le client garde son espace et ses notifications ; plus aucun e-mail ne lui part sur ce projet, jusqu'à ce que vous les réactiviez.", ok: 'Couper les e-mails' }
      : { titre: 'Réactiver les e-mails du client ?', texte: "Les prochains événements lui seront à nouveau envoyés par e-mail. Rien de ce qui s'est passé entre-temps n'est renvoyé.", ok: 'Réactiver' });
    if (ok) await agir(el, () => appelServeur('reglerEmailsClient', { id: pid, emailsClient: el.dataset.valeur }), coupes ? 'E-mails du client coupés.' : 'E-mails du client réactivés.');
    return true;
  }
  if (action === 'acces-ajouter') {
    const m = modale({
      titre: 'Donner accès à ce projet', sousTitre: d.projet.ouvert === true ? 'Elle reçoit son invitation tout de suite (sauf e-mails coupés).' : "Le projet est fermé : elle est préparée, rien ne part avant l'ouverture.",
      corps: `<form class="forme" id="f-acces" novalidate>
        <div class="forme-rang">
          <div class="groupe"><label class="etiquette-champ" for="ac-nom">Nom</label><input class="champ" id="ac-nom" name="nom" maxlength="120" autocomplete="off"></div>
          <div class="groupe"><label class="etiquette-champ" for="ac-email">Adresse e-mail</label><input class="champ" id="ac-email" name="email" type="email" autocomplete="off"></div>
        </div>
        <div class="groupe"><span class="etiquette-champ">Rôle</span>
          <label class="interrupteur"><input type="radio" name="role" value="responsable"><i></i> Responsable : engage le client (devis, finance, validations réservées)</label>
          <label class="interrupteur"><input type="radio" name="role" value="collaborateur" checked><i></i> Collaborateur : suit le projet, échange, pose des demandes</label>
        </div>
      </form>`,
      pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-acces">Donner accès</button>',
    });
    m.el.querySelector('#f-acces').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!valider(e.target, { email: (v) => obligatoire()(v) || emailValide()(v) })) return;
      const f = lireForme(e.target);
      let r = null;
      if (await agir(m.pied.querySelector('[type="submit"]'), async () => { r = await appelServeur('ajouterInterlocuteur', { projet: pid, ...f }); })) {
        m.fermer(true);
        const etat = r && r.invitation ? r.invitation.etat : 'preparee';
        toast(etat === 'envoyee' ? 'Accès donné, invitation envoyée.' : etat === 'en-attente' ? "Accès donné. Les e-mails sont coupés : l'invitation n'est pas partie, copiez le lien." : 'Personne préparée : elle aura accès à l\'ouverture du projet.');
      }
    });
    return true;
  }
  if (action === 'acces-menu') {
    const cle = el.dataset.cle;
    const i = (d.interlocuteurs || []).find((x) => x.id === cle);
    if (!i) return true;
    const nom = i.nom || i.email;
    const ouvert = d.projet.ouvert === true;
    if (i.statut !== 'actif') {
      /* Un rôle se choisit, il ne se devine pas : sans rôle connu, deux
         gestes explicites. */
      const redonner = (role, libelle) => ({ libelle, icone: 'utilisateurs', action: () => agir(null, () => appelServeur('ajouterInterlocuteur', { projet: pid, email: i.email, nom: i.nom, role }), 'Accès rendu.') });
      menu(el, [
        ...(ROLES_CLIENT[i.role]
          ? [redonner(i.role, "Redonner l'accès")]
          : [redonner('responsable', "Redonner l'accès, comme responsable"), redonner('collaborateur', "Redonner l'accès, comme collaborateur")]),
        { libelle: 'Historique des connexions', icone: 'horloge', action: () => ouvrirHistorique(i, pid) },
      ]);
      return true;
    }
    const roles = ROLES_CLIENT[i.role] ? [i.role === 'responsable' ? 'collaborateur' : 'responsable'] : ['responsable', 'collaborateur'];
    menu(el, [
      { libelle: 'Modifier le nom', icone: 'edit', action: () => {
        const m = modale({
          titre: 'Modifier le nom', sousTitre: "Il change partout : son espace, ses e-mails et la liste des accès.",
          corps: `<form class="forme" id="f-nom" novalidate>
            <div class="groupe"><label class="etiquette-champ" for="ac-nouveau-nom">Nom</label><input class="champ" id="ac-nouveau-nom" name="nom" maxlength="120" autocomplete="off" value="${echapper(i.nom || '')}"></div>
          </form>`,
          pied: '<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="f-nom">Enregistrer</button>',
        });
        m.el.querySelector('#f-nom').addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!valider(e.target, { nom: obligatoire() })) return;
          const { nom: nouveau } = lireForme(e.target);
          if (await agir(m.pied.querySelector('[type="submit"]'), () => appelServeur('modifierInterlocuteur', { projet: pid, cle, nom: nouveau }))) {
            m.fermer(true);
            toast('Nom modifié.');
          }
        });
      } },
      { libelle: 'Historique des connexions', icone: 'horloge', action: () => ouvrirHistorique(i, pid) },
      ...roles.map((autreRole) => ({ libelle: `Passer ${ROLES_CLIENT[autreRole].toLowerCase()}`, icone: 'edit', action: () => agir(null, () => appelServeur('modifierInterlocuteur', { projet: pid, cle, role: autreRole }), 'Rôle choisi.') })),
      ...(ouvert ? [
        { libelle: "Renvoyer l'invitation", icone: 'mail', action: () => agir(null, async () => {
          const r = await appelServeur('renvoyerInvitation', { projet: pid, cle });
          toast(r.envoyee ? 'Invitation renvoyée.' : `Invitation prête, non envoyée : ${r.motif || 'e-mails coupés'}. Le lien est copié.`);
          if (!r.envoyee && r.lien) await copier(r.lien);
        }) },
        { libelle: "Copier le lien d'invitation", icone: 'liens', action: () => agir(null, async () => {
          const r = await appelServeur('creerInvitation', { projet: pid, email: i.email, envoyer: false });
          await copier(r.lien);
          toast("Lien copié. Il pré-remplit l'adresse ; c'est le code reçu par e-mail qui ouvre la session.");
        }) },
      ] : []),
      '-',
      { libelle: "Retirer l'accès", icone: 'corbeille', danger: true, action: async () => {
        if (await confirmer({ titre: `Retirer l'accès de ${nom} ?`, texte: "Elle perd l'accès à CE projet immédiatement, même une session ouverte, et ne reçoit plus rien de lui. Ses autres projets ne changent pas.", ok: "Retirer l'accès", danger: true })) {
          await agir(null, () => appelServeur('retirerInterlocuteur', { projet: pid, cle }), 'Accès retiré.');
        }
      } },
    ]);
    return true;
  }
  return false;
};
