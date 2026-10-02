/* ==========================================================================
   Les paramètres du cockpit : les vocabulaires en service et l'état des
   intégrations. L'équipe a sa propre page (admin-equipe.js). Il n'y a plus
   de clé d'administration : le serveur lit l'identité de la personne
   connectée.
   ========================================================================== */

import { echapper, TYPES, STATUTS, TYPES_PROJET, CATEGORIES_FICHIER, STATUTS_PROJET, peut, dateHeure } from '../noyau.js';
import { icone, squelette, titrePage, encart, sur, agir, lireForme, valider, longueurMax } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { URL_SUIVI } from '../serveur.js';

/* Les coordonnées de règlement de l'agence : ce que le client lit sur une
   facture due (« Pour régler : virement à … »). La finance les écrit. */
const sectionReglement = (session, coordonnees) => {
  const c = coordonnees || {};
  const gere = peut(session, 'finance.gerer');
  const champ = (nom, libelle, valeur, { aide = '', attrs = '', facultatif = false } = {}) => `<div class="groupe"><label class="etiquette-champ" for="rf-${nom}">${libelle}${facultatif ? ' <span class="facultatif">(facultatif)</span>' : ''}</label><input class="champ" id="rf-${nom}" name="${nom}" value="${echapper(valeur || '')}" ${attrs} ${gere ? '' : 'disabled'}>${aide ? `<p class="aide">${aide}</p>` : ''}</div>`;
  return `<section class="section"><div class="section-tete"><h2>Coordonnées de règlement</h2></div>
    <div class="carte">
      <p class="t-petit t-2" style="margin-bottom:14px">Ce que le client lit sur une facture à régler, avec un bouton pour copier l'IBAN. Sans coordonnées, sa fiche renvoie au PDF de la facture.</p>
      <form class="forme" id="f-finance" novalidate>
        <div class="forme-rang">${champ('titulaire', 'Titulaire du compte', c.titulaire, { attrs: 'maxlength="120" placeholder="Capmedia Digital"' })}${champ('banque', 'Banque', c.banque, { attrs: 'maxlength="120"', facultatif: true })}</div>
        <div class="forme-rang">${champ('iban', 'IBAN', c.iban, { attrs: 'maxlength="40" placeholder="FR76 …" autocomplete="off" spellcheck="false"' })}${champ('bic', 'BIC', c.bic, { attrs: 'maxlength="16" autocomplete="off" spellcheck="false"', facultatif: true })}</div>
        <div class="groupe"><label class="etiquette-champ" for="rf-mention">Mention <span class="facultatif">(facultatif)</span></label><textarea class="zone" id="rf-mention" name="mention" rows="2" maxlength="600" placeholder="Merci d'indiquer le numéro de la facture en libellé du virement." ${gere ? '' : 'disabled'}>${echapper(c.mention || '')}</textarea></div>
        <div class="rang" style="gap:12px;align-items:center">${gere ? '<button class="btn btn-principal" type="submit">Enregistrer</button>' : '<span class="t-petit t-3">Réservé à la finance (permission « finance.gerer »).</span>'}${dateHeure(c.maj) ? `<span class="t-micro t-3">Mis à jour le ${echapper(dateHeure(c.maj))}</span>` : ''}</div>
      </form>
    </div>
  </section>`;
};

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Paramètres');
  filAriane([{ libelle: 'Paramètres' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  const rendre = () => {
    /* Une saisie en cours ne se fait pas écraser par une mise à jour venue
       d'ailleurs : on redessinera au prochain tour. */
    if (sortie.querySelector('#f-finance:focus-within')) return;
    const equipe = magasin.lire(K.equipe) || [];
    const coordonnees = magasin.lire(K.reglages) || null;
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

      ${sectionReglement(env.session, coordonnees)}

      <section class="section"><div class="section-tete"><h2>Intégrations</h2></div>
        ${encart('<strong>Brevo</strong> envoie les e-mails transactionnels depuis contact@capmedia.app. La clé vit dans un secret serveur. <strong>Paiement en ligne</strong> : l\'architecture est prête pour Stripe, l\'intégration se branchera dans la fonction serveur, sans donnée bancaire dans la plateforme.', 'info')}
      </section>
    </div>`;
  };
  const gestes = sur(sortie, 'submit', '#f-finance', async (forme, ev) => {
    ev.preventDefault();
    const iban = (v) => (v && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(String(v).replace(/\s+/g, '').toUpperCase()) ? "Cet IBAN n'a pas la forme attendue (pays, clé, puis 11 à 30 caractères)." : '');
    if (!valider(forme, { titulaire: longueurMax(120), iban, bic: (v) => (v && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(String(v).trim().toUpperCase()) ? 'Un BIC fait 8 ou 11 caractères.' : ''), mention: longueurMax(600) })) return;
    const d = lireForme(forme);
    if (await agir(forme.querySelector('[type="submit"]'), () => ecrire.reglerFinance(d), 'Coordonnées enregistrées.')) { forme.querySelector('[type="submit"]').blur(); rendre(); }
  });
  [K.equipe, K.reglages].forEach((c) => lot.sur(c, rendre));
  return () => { gestes(); lot.fin(); };
};
