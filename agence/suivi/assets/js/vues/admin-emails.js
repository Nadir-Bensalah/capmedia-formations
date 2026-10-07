/* ==========================================================================
   Les e-mails envoyés (administrateur seul)

   Chaque lettre partie de la plateforme, du plus récent au plus ancien :
   aux clients d'abord, et sur un clic à l'équipe, aux testeurs, ou les
   codes de connexion. Une ligne s'ouvre sur la lettre telle que reçue.

   Le serveur lit la file « envois » (fermée à tout navigateur) et rend
   chaque lettre telle que le facteur l'a enregistrée à l'envoi, ou, pour
   une lettre plus ancienne, la refait avec son gabarit (journal-envois.js). La lettre
   s'affiche dans un cadre isolé, sans script ni sortie : rien de ce qu'elle
   contient ne touche au Cockpit.

   Les filtres vivent dans l'adresse (#/emails?projet=…&statut=…) : la
   fiche d'un projet y mène déjà filtrée, et le retour arrière les garde.
   ========================================================================== */

import { echapper, peut, pluriel } from '../noyau.js';
import { squelette, titrePage, sur, modale, fait, encart } from '../ui.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { appelServeur } from '../serveur.js';

const VOILES = { attente: 'ambre', envoye: 'vert', echec: 'rouge', simule: 'gris' };
const ETATS = { attente: 'En file', envoye: 'Envoyé', echec: 'Échec', simule: 'Simulé' };
const TIRET = '–';

const quand = (ms) => (ms ? new Date(ms).toLocaleString('fr-FR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
}) : '');
const ouTiret = (texte) => (texte ? echapper(texte) : TIRET);
const puceEtat = (etat) => `<span class="puce puce--${VOILES[etat] || 'gris'}" data-etat="${echapper(etat || '')}"><i aria-hidden="true"></i>${echapper(ETATS[etat] || etat || 'Inconnu')}</span>`;

/* Les filtres, lus dans l'adresse. « public » vaut « client » par défaut :
   la page répond d'abord à « qu'a-t-on écrit à nos clients ». */
const lireFiltres = (requete = {}) => ({
  public: requete.public === 'tous' ? '' : (['client', 'equipe', 'testeur', 'connexion'].includes(requete.public) ? requete.public : 'client'),
  projet: requete.projet || '',
  destinataire: requete.destinataire || '',
  statut: requete.statut || '',
  page: Math.max(1, Number(requete.page) || 1),
});
const adresse = (f) => {
  const p = new URLSearchParams();
  p.set('public', f.public || 'tous');
  if (f.projet) p.set('projet', f.projet);
  if (f.destinataire) p.set('destinataire', f.destinataire);
  if (f.statut) p.set('statut', f.statut);
  if (f.page > 1) p.set('page', String(f.page));
  return `/emails?${p.toString()}`;
};

const destinataireHtml = (a) => {
  const premier = (a || [])[0];
  if (!premier) return TIRET;
  const reste = a.length - 1;
  return `<span class="t-fort">${echapper(premier.nom || premier.email)}</span>${reste ? ` <span class="t-3">+${reste}</span>` : ''}
    ${premier.nom ? `<br><span class="t-petit t-3">${echapper(premier.email)}</span>` : ''}`;
};

const ligneHtml = (l) => `<tr data-envoi="${echapper(l.id)}">
  <td style="white-space:nowrap">${ouTiret(quand(l.quand))}</td>
  <td style="min-width:180px">${destinataireHtml(l.a)}</td>
  <td style="min-width:240px"><button type="button" class="ligne-titre--bouton" data-ouvrir="${echapper(l.id)}" style="font-weight:500;color:var(--encre)">${l.objet ? echapper(l.objet) : `<span class="t-3">Lettre illisible : ${echapper(l.modele || 'modèle absent')}</span>`}</button></td>
  <td>${ouTiret(l.projetNom)}</td>
  <td>${ouTiret(l.evenementLibelle)}</td>
  <td style="white-space:nowrap">${puceEtat(l.etat)}${l.etat === 'echec' && l.essais ? ` <span class="t-petit t-3">${echapper(pluriel(l.essais, 'essai'))}</span>` : ''}</td>
</tr>`;

/* --- La lettre ouverte --------------------------------------------------- */

/* D'où vient la lettre montrée : enregistrée au moment de l'envoi (depuis
   le 07/10/2026), ou reconstituée pour une lettre plus ancienne. */
const provenance = (e) => {
  if (e.provenance === 'enregistre') return "Telle qu'envoyée : objet, lettre et texte brut enregistrés au moment de l'envoi.";
  const pourquoi = e.renduTronque
    ? "La lettre envoyée dépassait la taille gardée ; elle est reconstituée"
    : (e.etat === 'attente' ? 'Pas encore partie : elle est reconstituée' : "Lettre partie avant l'enregistrement des envois : elle est reconstituée");
  return `${pourquoi} à partir des données figées à la mise en file, avec le gabarit en service. Une retouche du gabarit faite après l'envoi s'y verrait.`;
};

/* La lettre montrée ici vit dans un cadre qui hérite de la politique de
   sécurité du Cockpit : pas de feuille <style> en ligne, des images du site
   seulement. On retire donc la feuille de la lettre (elle ne porte que le
   mode sombre et la mise en page du téléphone : la lettre claire reste
   entière), et ses images, publiées sur capmedia.app, sont prises sur le
   site qui sert la page. La lettre gardée, elle, ne change pas. */
const IMAGES_COURRIEL = 'https://capmedia.app/assets/img/courriel/';
const pourApercu = (html) => String(html || '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .split(IMAGES_COURRIEL).join('/assets/img/courriel/');
const enveloppe = (html) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"></head><body style="margin:0">${pourApercu(html)}</body></html>`;

const ouvrirLettre = async (id) => {
  const m = modale({ titre: 'E-mail', large: true, corps: squelette('lignes', 4) });
  let e;
  try {
    e = (await appelServeur('emailEnvoye', { id })).envoi;
  } catch (err) {
    m.corps.innerHTML = encart(echapper(err.message || 'Cette lettre ne peut pas être lue.'), 'alerte', 'alerte');
    return;
  }
  m.el.querySelector('.modale-tete h2').textContent = e.objet || 'Lettre illisible';
  const destinataires = (e.a || []).map((d) => (d.nom ? `${echapper(d.nom)} <span class="t-3">${echapper(d.email)}</span>` : echapper(d.email))).join('<br>');
  m.corps.innerHTML = `
    <dl class="faits" data-infos-envoi style="margin-bottom:var(--e-4)">
      ${fait(e.a && e.a.length > 1 ? 'Destinataires' : 'Destinataire', destinataires || TIRET)}
      ${fait('Statut', puceEtat(e.etat))}
      ${fait('Mise en file', ouTiret(quand(e.cree)))}
      ${fait(e.etat === 'simule' ? 'Simulé le' : 'Envoyé le', ouTiret(quand(e.envoye)))}
      ${fait('Projet', ouTiret(e.projetNom))}
      ${fait('Événement', ouTiret(e.evenementLibelle))}
      ${fait('Essais', String(e.essais || 0))}
      ${fait('Modèle', `<span class="t-mono">${ouTiret(e.modele)}</span>`)}
      ${fait('Identifiant Brevo', `<span class="t-mono">${ouTiret(e.brevo)}</span>`)}
    </dl>
    ${e.erreur ? encart(`<strong>Motif de l'échec</strong> : ${echapper(e.erreur)}`, 'alerte', 'alerte') : ''}
    ${e.erreurRendu ? encart(`Cette lettre ne se reconstitue pas : ${echapper(e.erreurRendu)}`, 'alerte', 'alerte') : ''}
    ${e.html || e.texte ? `<div class="rang-espace" style="margin:var(--e-4) 0 var(--e-3)">
      <div class="segments" role="group" aria-label="Version de la lettre">
        <button type="button" data-version="html" aria-pressed="true">Lettre</button>
        <button type="button" data-version="texte" aria-pressed="false">Texte brut</button>
      </div>
      <p class="t-petit t-3" style="margin:0">Les liens ne s'ouvrent pas depuis l'aperçu.</p>
    </div>
    <div data-lettre></div>` : ''}
    <p class="t-petit t-3" data-provenance="${e.provenance === 'enregistre' ? 'enregistre' : 'reconstitue'}" style="margin-top:var(--e-3)">${provenance(e)}${(e.masques || []).length ? ` Masqué ici : ${echapper(e.masques.join(', '))}.` : ''}</p>`;

  const zone = m.corps.querySelector('[data-lettre]');
  if (!zone) return;
  const montrer = (version) => {
    m.corps.querySelectorAll('[data-version]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.version === version)));
    zone.innerHTML = '';
    if (version === 'texte') {
      const pre = document.createElement('pre');
      pre.setAttribute('data-texte', '');
      pre.style.cssText = 'margin:0;padding:20px 24px;white-space:pre-wrap;overflow-wrap:anywhere;font:400 13.5px/1.6 var(--mono);color:var(--encre);background:var(--eleve);border-radius:8px;max-height:70vh;overflow:auto';
      pre.textContent = e.texte || '';
      zone.appendChild(pre);
      return;
    }
    /* Un cadre sans aucune permission (sandbox vide) : ni script, ni
       formulaire, ni fenêtre, ni navigation du Cockpit. Le contenu est posé
       par srcdoc, jamais par une adresse. */
    const cadre = document.createElement('iframe');
    cadre.setAttribute('sandbox', '');
    cadre.setAttribute('referrerpolicy', 'no-referrer');
    cadre.setAttribute('title', `Aperçu de la lettre : ${e.objet || ''}`);
    cadre.setAttribute('data-apercu', '');
    cadre.style.cssText = 'display:block;width:100%;height:640px;max-height:70vh;border:0;border-radius:8px;background:#F6F5F4';
    cadre.srcdoc = enveloppe(e.html || '');
    zone.appendChild(cadre);
  };
  m.corps.addEventListener('click', (ev) => { const b = ev.target.closest('[data-version]'); if (b) montrer(b.dataset.version); });
  montrer(e.html ? 'html' : 'texte');
};

/* --- La page --------------------------------------------------------------- */

export const vue = async (ctx, env) => {
  const sortie = ctx.sortie;
  titrePage('E-mails envoyés');
  filAriane([{ libelle: 'E-mails envoyés' }]);
  if (!peut(env.session, 'systeme')) {
    sortie.innerHTML = `<div class="page" style="max-width:720px"><div class="page-tete"><div><h1>E-mails envoyés</h1><p class="chapo" data-refus>Cette page est réservée à l'administration.</p></div></div></div>`;
    return () => {};
  }
  sortie.innerHTML = `<div class="page">${squelette('page', 8)}</div>`;

  let filtres = lireFiltres(ctx.requete);
  let tour = 0;
  let donnees = null;

  const rendre = () => {
    const d = donnees;
    const f = d.filtres;
    const publics = [...d.facettes.publics, { cle: '', libelle: 'Tous', n: d.facettes.publics.reduce((s, p) => s + p.n, 0) }];
    const projets = d.facettes.projets;
    const adresses = d.facettes.destinataires;
    /* Un filtre posé par l'adresse mais absent des comptes (aucune lettre)
       reste choisi, pour qu'on voie pourquoi la liste est vide. */
    if (f.projet && !projets.some((p) => p.id === f.projet)) projets.unshift({ id: f.projet, nom: f.projet, n: 0 });
    if (f.destinataire && !adresses.some((a) => a.email === f.destinataire)) adresses.unshift({ email: f.destinataire, nom: '', n: 0 });
    const filtre = Boolean(f.projet || f.destinataire || f.statut);
    const enEchec = (d.facettes.statuts.find((s) => s.cle === 'echec') || {}).n || 0;

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>E-mails envoyés</h1><p class="chapo">Chaque lettre partie de la plateforme, telle que son destinataire l'a reçue.</p></div></div>
      <div class="filtres" data-publics style="margin-bottom:var(--e-4)">${publics.map((p) => `<button class="filtre${(f.public || '') === p.cle ? ' actif' : ''}" type="button" data-public="${p.cle || 'tous'}">${echapper(p.libelle)} <span class="compte">${p.n}</span></button>`).join('')}</div>
      <div class="rang" style="gap:9px;margin-bottom:var(--e-4)">
        <select class="select" id="f-projet" aria-label="Projet" style="width:auto;max-width:100%"><option value="">Tous les projets</option>${projets.map((p) => `<option value="${echapper(p.id)}"${f.projet === p.id ? ' selected' : ''}>${echapper(p.nom)} (${p.n})</option>`).join('')}</select>
        <select class="select" id="f-destinataire" aria-label="Destinataire" style="width:auto;max-width:100%"><option value="">Tous les destinataires</option>${adresses.map((a) => `<option value="${echapper(a.email)}"${f.destinataire === a.email ? ' selected' : ''}>${echapper(a.nom ? `${a.nom} · ${a.email}` : a.email)} (${a.n})</option>`).join('')}</select>
        <select class="select" id="f-statut" aria-label="Statut" style="width:auto"><option value="">Tous les statuts</option>${d.facettes.statuts.map((s) => `<option value="${s.cle}"${f.statut === s.cle ? ' selected' : ''}>${echapper(s.libelle)} (${s.n})</option>`).join('')}</select>
        ${filtre ? '<button class="btn btn-petit btn-doux" type="button" data-effacer>Effacer les filtres</button>' : ''}
      </div>
      <p class="t-petit t-2" data-resume style="margin-bottom:var(--e-3)"><strong>${pluriel(d.total, 'e-mail')}</strong>${enEchec && f.statut !== 'echec' ? ` · <button type="button" class="ligne-titre--bouton" data-voir-echecs style="display:inline;width:auto;color:var(--rouge);text-decoration:underline">${pluriel(enEchec, 'en échec', 'en échec')}</button>` : ''}${d.pages > 1 ? ` · page ${d.page} sur ${d.pages}` : ''}</p>
      ${d.lignes.length ? `<div class="cadre-defile"><table class="tableau" data-emails>
        <thead><tr><th scope="col">Date</th><th scope="col">Destinataire</th><th scope="col">Objet</th><th scope="col">Projet</th><th scope="col">Événement</th><th scope="col">Statut</th></tr></thead>
        <tbody>${d.lignes.map(ligneHtml).join('')}</tbody></table></div>`
        : `<div class="carte"><p class="t-2" data-vide style="margin:0">${filtre || f.public ? 'Aucun e-mail ne correspond à ces filtres.' : "Aucun e-mail n'est encore parti."}</p></div>`}
      ${d.pages > 1 ? `<div class="rang-espace" style="margin-top:var(--e-4)">
        <button class="btn btn-secondaire" type="button" data-page="${d.page - 1}"${d.page <= 1 ? ' disabled' : ''}>Plus récents</button>
        <span class="t-petit t-3">${d.page} / ${d.pages}</span>
        <button class="btn btn-secondaire" type="button" data-page="${d.page + 1}"${d.page >= d.pages ? ' disabled' : ''}>Plus anciens</button>
      </div>` : ''}
    </div>`;
    const changer = (cle) => (ev) => aller({ ...filtres, [cle]: ev.target.value, page: 1 });
    sortie.querySelector('#f-projet').addEventListener('change', changer('projet'));
    sortie.querySelector('#f-destinataire').addEventListener('change', changer('destinataire'));
    sortie.querySelector('#f-statut').addEventListener('change', changer('statut'));
  };

  const charger = async () => {
    const mien = (tour += 1);
    try {
      const d = await appelServeur('emailsEnvoyes', filtres);
      if (mien !== tour) return;
      donnees = d;
      rendre();
    } catch (err) {
      if (mien !== tour) return;
      sortie.innerHTML = `<div class="page" style="max-width:720px"><div class="page-tete"><div><h1>E-mails envoyés</h1></div></div>${encart(echapper(err.message || 'La liste ne peut pas être lue.'), 'alerte', 'alerte')}</div>`;
    }
  };

  const aller = (f) => naviguer(adresse(f));

  const gestes = sur(sortie, 'click', '[data-public], [data-page], [data-effacer], [data-voir-echecs], [data-ouvrir], tr[data-envoi]', (el) => {
    if (el.dataset.public !== undefined) { aller({ ...filtres, public: el.dataset.public === 'tous' ? '' : el.dataset.public, page: 1 }); return; }
    if (el.dataset.page) { aller({ ...filtres, page: Number(el.dataset.page) }); return; }
    if (el.hasAttribute('data-effacer')) { aller({ public: filtres.public, projet: '', destinataire: '', statut: '', page: 1 }); return; }
    if (el.hasAttribute('data-voir-echecs')) { aller({ ...filtres, statut: 'echec', page: 1 }); return; }
    const id = el.dataset.ouvrir || el.dataset.envoi;
    if (id) ouvrirLettre(id);
  });

  await charger();
  return {
    fin: () => { tour += 1; gestes(); },
    maj: (suite) => { filtres = lireFiltres(suite.requete); charger(); },
  };
};
