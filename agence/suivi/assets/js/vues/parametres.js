/* ==========================================================================
   Les paramètres de la personne connectée : profil, préférences de
   notification, apparence, sécurité.
   ========================================================================== */

import { echapper, nomAffiche, dateHeure } from '../noyau.js';
import { icone, squelette, titrePage, toast, lireForme, valider, obligatoire, agir, encart, sur } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { quitter } from '../noyau.js';

const CATEGORIES = [
  ['messages', 'Messages et réponses', 'Un message dans une conversation ou une demande.'],
  ['demandes', 'Mouvements de mes demandes', 'Changement de statut, qualification, résolution.'],
  ['validations', 'Validations attendues', "Quand Capmedia attend votre accord."],
  ['fichiers', 'Nouveaux fichiers', 'Un livrable ou un document déposé.'],
  ['finances', 'Devis et factures', "Un devis disponible, une facture émise ou bientôt échue."],
  ['reunions', 'Réunions', 'Une réunion programmée ou modifiée.'],
  ['releases', 'Nouvelles versions', 'Une version publiée.'],
  ['relance', 'Rappel hebdomadaire', "Le lundi matin, et seulement s'il reste des points en attente de vous."],
];

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Paramètres');
  filAriane([{ libelle: 'Paramètres' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;

  const rendre = () => {
    const profil = magasin.lire(K.profil) || {};
    const prefs = profil.notifications || {};
    const theme = document.documentElement.getAttribute('data-theme') || 'auto';
    sortie.innerHTML = `<div class="page" style="max-width:760px">
      <div class="page-tete"><div><h1>Paramètres</h1><p class="chapo">Votre profil, vos notifications, l'apparence de l'espace.</p></div></div>

      <section class="section" style="margin-top:0">
        <div class="section-tete"><h2>Profil</h2></div>
        <form class="carte forme" id="forme-profil" novalidate>
          <div class="forme-rang">
            <div class="groupe"><label class="etiquette-champ" for="nom">Nom</label><input class="champ" id="nom" name="nom" value="${echapper(profil.nom || nomAffiche(session))}" maxlength="80"></div>
            <div class="groupe"><label class="etiquette-champ" for="telephone">Téléphone <span class="facultatif">(facultatif)</span></label><input class="champ" id="telephone" name="telephone" value="${echapper(profil.telephone || '')}" maxlength="30" inputmode="tel"></div>
          </div>
          <div class="forme-rang">
            <div class="groupe"><label class="etiquette-champ" for="entreprise">Entreprise <span class="facultatif">(facultatif)</span></label><input class="champ" id="entreprise" name="entreprise" value="${echapper(profil.entreprise || ((session.organisations[0] || {}).entreprise || ''))}" maxlength="80"></div>
            <div class="groupe"><label class="etiquette-champ" for="fuseau">Fuseau horaire</label><select class="select" id="fuseau" name="fuseau">${['Europe/Paris', 'Africa/Tunis', 'Europe/Brussels', 'Europe/Zurich', 'America/Montreal', 'UTC'].map((f) => `<option value="${f}" ${(profil.fuseau || Intl.DateTimeFormat().resolvedOptions().timeZone) === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          </div>
          <div class="groupe"><label class="etiquette-champ">Adresse e-mail</label><p class="t-corps">${echapper(session.utilisateur.email || '')}</p><p class="aide">C'est votre identifiant. Pour en changer, prévenez Capmedia.</p></div>
          <div class="forme-pied"><button class="btn btn-principal" type="submit">Enregistrer</button></div>
        </form>
      </section>

      <section class="section">
        <div class="section-tete"><h2>Notifications par e-mail</h2></div>
        <div class="carte">
          <p class="t-petit t-2" style="margin-bottom:12px">Les notifications dans l'espace restent toujours actives. Ici, vous choisissez ce qui vous arrive aussi par e-mail.</p>
          <div class="liste">${CATEGORIES.map(([cle, lib, aide]) => `<div class="ligne ligne--sans-icone" style="cursor:default"><span class="ligne-corps"><span class="ligne-titre">${echapper(lib)}</span><span class="ligne-sous">${echapper(aide)}</span></span><span class="ligne-fin"><select class="select" style="width:auto" data-pref="${cle}"><option value="immediat" ${(prefs[cle] || 'immediat') === 'immediat' ? 'selected' : ''}>Immédiat</option><option value="resume" ${prefs[cle] === 'resume' ? 'selected' : ''}>Résumé quotidien</option><option value="off" ${prefs[cle] === 'off' ? 'selected' : ''}>Désactivé</option></select></span></div>`).join('')}</div>
        </div>
      </section>

      <section class="section">
        <div class="section-tete"><h2>Apparence</h2></div>
        <div class="carte rang-espace"><div><p class="t-corps-fort">Thème</p><p class="t-petit t-2">Automatique suit le réglage de votre appareil.</p></div>
          <div class="selecteur-theme" role="group" aria-label="Thème"><button type="button" data-theme-val="light" aria-pressed="${theme === 'light'}">Clair</button><button type="button" data-theme-val="dark" aria-pressed="${theme === 'dark'}">Sombre</button><button type="button" data-theme-val="auto" aria-pressed="${theme === 'auto'}">Auto</button></div></div>
      </section>

      <section class="section">
        <div class="section-tete"><h2>Sécurité</h2></div>
        <div class="carte pile">
          ${encart('<strong>Connexion sans mot de passe.</strong> À chaque connexion, un lien à usage unique vous est envoyé par e-mail. Il expire au bout d\'une heure et ne sert qu\'une fois. Personne ne peut deviner un mot de passe qui n\'existe pas.', 'info', 'cadenas')}
          <div class="rang-espace"><div><p class="t-corps-fort">Dernière connexion</p><p class="t-petit t-2">${echapper(session.utilisateur.metadata && session.utilisateur.metadata.lastSignInTime ? dateHeure(new Date(session.utilisateur.metadata.lastSignInTime)) : '')}</p></div><button class="btn btn-secondaire" type="button" id="deconnexion">${icone('dehors')} Se déconnecter</button></div>
        </div>
      </section>
    </div>`;

    sortie.querySelector('#forme-profil').addEventListener('submit', async (e) => {
      e.preventDefault();
      const forme = e.target;
      if (!valider(forme, { nom: obligatoire() })) return;
      /* L'adresse est recopiée dans le profil : côté serveur, la coupure
         des e-mails se cherche par adresse, et sans elle le réglage
         « Désactivé » n'avait jamais aucun effet. */
      await agir(forme.querySelector('[type="submit"]'), () => ecrire.majProfil(session.utilisateur.uid, { ...lireForme(forme), email: String(session.utilisateur.email || '').toLowerCase() }), 'Profil enregistré.');
    });
    sortie.querySelector('#deconnexion').addEventListener('click', quitter);
  };

  const gestes = sur(sortie, 'change', '[data-pref]', async (el) => {
    const profil = magasin.lire(K.profil) || {};
    const notifications = { ...(profil.notifications || {}), [el.dataset.pref]: el.value };
    await agir(null, () => ecrire.majProfil(session.utilisateur.uid, { notifications, email: String(session.utilisateur.email || '').toLowerCase() }), 'Préférence enregistrée.');
  });
  let premier = true;
  lot.sur(K.profil, () => { if (premier) { premier = false; rendre(); } });
  /* Le même délai que l'accueil, et le même piège : il meurt avec la vue,
     sinon il dessine les paramètres par-dessus la page suivante. */
  const garde = setTimeout(() => { if (premier) { premier = false; rendre(); } }, 600);
  return () => { premier = false; clearTimeout(garde); gestes(); lot.fin(); };
};

void toast;
