/* ==========================================================================
   L'accueil du client. En dix secondes : où en sont mes projets, qu'est-ce
   qui m'attend, qu'est-ce qui vient de se passer, quelle est la suite.
   ========================================================================== */

import {
  echapper, prenom, nomAffiche, depuis, dateCourte, heure, dateHeure, montant, enDate, parDateDesc,
  OUVERTS, STATUTS_PROJET, pluriel, statutProjet
} from '../noyau.js';
import { icone, pastille, avatarProjet, progression, ligne, vide, chronoItem, parJour, titrePage, echeanceHtml, squelette } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, G, agreger, enAttenteDeVous, progressionProjet, jalonCourant, prochaineReunion, resteAPayer, depuisVisite, nonLusProjet } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { echeance } from '../noyau.js';

const iconeActivite = {
  'tache': 'taches', 'jalon': 'drapeau', 'release': 'releases', 'fichier': 'fichiers', 'reunion': 'reunions',
  'validation': 'valider', 'demande': 'demandes', 'message': 'messages', 'devis': 'receipt', 'facture': 'euro',
  'paiement': 'paiement', 'note': 'note', 'blocage': 'alerte', 'projet': 'projets',
};
const tonActivite = { 'validation': 'violet', 'facture': 'ambre', 'paiement': 'vert', 'release': 'vert', 'blocage': 'rouge', 'devis': 'bleu' };

export const activiteHtml = (liste, options = {}) => {
  const activite = liste.filter((a) => a.date);
  if (!activite.length) return vide({ icone: 'activite', titre: "Pas encore d'activité", texte: 'Chaque mouvement du projet apparaîtra ici.', compact: true });
  return parJour(activite, 'date').map((g) => `
    <p class="chrono-jour">${echapper(g.jour)}</p>
    <div class="chrono">${g.items.map((a) => chronoItem({
      icone: iconeActivite[a.type] || 'activite', ton: tonActivite[a.type] || '',
      texte: `${a.par && a.par.nom && !options.sansAuteur ? `<strong>${echapper(a.par.nom)}</strong> ` : ''}${echapper(a.texte || '')}${options.avecProjet && a.projetNom ? ` <span class="t-3">· ${echapper(a.projetNom)}</span>` : ''}`,
      date: heure(a.date), lien: a.lien ? `#${a.lien}` : '',
    })).join('')}</div>`).join('');
};

export const vue = async (ctx, env) => {
  const { session } = env;
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  filAriane([{ libelle: 'Accueil' }]);
  titrePage('Accueil');
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;

  /* Tant que les écoutes n'ont pas rendu leur première valeur, on garde le
     squelette : un accueil qui se complète par morceaux donne l'impression
     que des choses manquent. Passé le délai de garde, on montre ce qu'on a. */
  let impatient = false;
  setTimeout(() => { impatient = true; planifier(); }, 2500);

  const rendre = () => {
    if (!impatient && !cles.every((c) => magasin.chargee(c))) return;
    const projets = (magasin.lire(K.projets) || session.projets).filter((p) => !p.archive);
    const profil = magasin.lire(K.profil);
    const tickets = agreger(session, G.tickets);
    const validations = agreger(session, G.validations);
    const documents = agreger(session, G.documents);
    const paiements = agreger(session, G.paiements);
    const taches = agreger(session, G.taches);
    const blocages = agreger(session, G.blocages);
    const reunions = agreger(session, G.reunions);
    const releases = agreger(session, G.releases);
    const activite = agreger(session, G.activite).sort(parDateDesc('date'));
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');

    const attente = enAttenteDeVous({ projets, tickets, validations, documents, taches, blocages });
    const reunion = prochaineReunion(reunions);
    const { total: du, factures: dues } = resteAPayer(documents, paiements);
    const ouverts = tickets.filter((t) => OUVERTS.includes(t.statut) && !t.archive);
    const recentes = activite.slice(0, 12).map((a) => ({ ...a, projetNom: nomProjet(a.projet) }));
    const depuisPassage = depuisVisite(activite, env.derniereVisite);
    const dernieresReleases = releases.filter((r) => r.statut === 'disponible').sort(parDateDesc('date')).slice(0, 3);
    const nonLus = projets.reduce((s, p) => s + nonLusProjet(magasin.lire(K.messages(p.id)) || [], profil, p.id, session.utilisateur.uid), 0);

    const bonjour = (() => { const h = new Date().getHours(); return h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour'; })();
    const nom = prenom(nomAffiche(session));

    const resumeDepuis = depuisPassage.length ? (() => {
      const compte = (type) => depuisPassage.filter((a) => a.type === type).length;
      const parts = [];
      if (compte('tache')) parts.push(`${icone('check')} ${pluriel(compte('tache'), 'mouvement de tâche', 'mouvements de tâches')}`);
      if (compte('release')) parts.push(`${icone('releases')} ${pluriel(compte('release'), 'nouvelle version', 'nouvelles versions')}`);
      if (compte('message')) parts.push(`${icone('messages')} ${pluriel(compte('message'), 'message')}`);
      if (compte('validation')) parts.push(`${icone('valider')} ${pluriel(compte('validation'), 'validation')}`);
      if (compte('fichier')) parts.push(`${icone('fichiers')} ${pluriel(compte('fichier'), 'fichier')}`);
      if (!parts.length) parts.push(`${icone('activite')} ${pluriel(depuisPassage.length, 'mouvement')}`);
      return `<div class="encart encart--info" style="margin-bottom:var(--e-6)"><div><strong>Depuis votre dernière visite</strong><span class="rang" style="margin-top:6px;gap:16px">${parts.map((p) => `<span class="rang" style="gap:6px">${p}</span>`).join('')}</span></div></div>`;
    })() : '';

    sortie.innerHTML = `<div class="page">
      <div class="page-tete">
        <div>
          <p class="surtitre">${echapper(dateCourte(new Date()))}</p>
          <h1>${bonjour}${nom ? ` ${echapper(nom)}` : ''}</h1>
          <p class="chapo">${projets.length
            ? `${pluriel(projets.length, 'projet actif', 'projets actifs')}${attente.length ? `, ${pluriel(attente.length, 'point attend', 'points attendent')} votre retour` : ', rien ne vous attend'}${nonLus ? `, ${pluriel(nonLus, 'message non lu', 'messages non lus')}` : ''}.`
            : "Votre espace est prêt. Il s'animera dès qu'un projet y sera rattaché."}</p>
        </div>
        <div class="actions">
          ${projets[0] ? `<a class="btn btn-principal" href="#/projets/${echapper(projets[0].id)}/nouvelle-demande">${icone('plus')} Nouvelle demande</a>` : ''}
          <a class="btn btn-secondaire" href="#/messages">${icone('messages')} Message</a>
        </div>
      </div>

      ${resumeDepuis}

      ${attente.length ? `
      <section class="section" style="margin-top:0">
        <div class="attente">
          <p class="attente-tete">${icone('alerte')} En attente de vous <span class="badge badge--vif" style="margin-left:4px">${attente.length}</span></p>
          <div class="liste" style="margin-top:8px">
            ${attente.slice(0, 6).map((a) => ligne({ href: `#${a.chemin}`, icone: a.icone, ton: a.ton, titre: echapper(a.titre), sous: echapper(a.sous) })).join('')}
          </div>
          ${attente.length > 6 ? `<p style="margin-top:8px"><a class="t-petit t-fort" href="#/valider">Tout voir (${attente.length})</a></p>` : ''}
        </div>
      </section>` : ''}

      <section class="section">
        <div class="section-tete"><h2>Vos projets</h2>${projets.length ? '<a class="lien" href="#/nouveau-projet">Demander un nouveau projet</a>' : ''}</div>
        ${projets.length ? `<div class="grille grille-2">${projets.map((p) => {
          const jalons = magasin.lire(K.jalons(p.id)) || [];
          const prog = progressionProjet(p, jalons);
          const courant = jalonCourant(jalons);
          const pulse = p.pulse || {};
          const ouvertsProjet = ouverts.filter((t) => t.projet === p.id).length;
          const attenteProjet = attente.filter((a) => (a.chemin || '').startsWith(`/projets/${p.id}`)).length;
          return `<a class="carte carte--cliquable" href="#/projets/${echapper(p.id)}">
            <div class="rang" style="gap:14px;align-items:flex-start">
              ${avatarProjet(p.nom)}
              <div style="min-width:0;flex:1">
                <div class="rang-espace" style="gap:8px">
                  <p class="t-titre-3 tronque">${echapper(p.nom)}</p>
                  ${pastille(STATUTS_PROJET, statutProjet(p))}
                </div>
                <p class="t-petit t-2" style="margin-top:2px">${echapper(courant ? `Étape en cours : ${courant.titre}` : (pulse.enCours ? `En ce moment : ${pulse.enCours}` : (p.description || 'Aucune étape renseignée')))}</p>
              </div>
            </div>
            <div style="margin-top:16px">
              <div class="rang-espace t-micro t-3" style="margin-bottom:6px"><span>Progression</span><span class="nb">${prog.valeur} %</span></div>
              ${progression(prog.valeur, prog.valeur >= 100 ? 'vert' : '')}
            </div>
            <div class="rang" style="margin-top:14px;gap:14px" class="t-petit">
              <span class="puce">${icone('demandes')} ${pluriel(ouvertsProjet, 'demande ouverte', 'demandes ouvertes')}</span>
              ${attenteProjet ? `<span class="puce puce--ambre"><i></i>${pluriel(attenteProjet, 'point pour vous', 'points pour vous')}</span>` : ''}
            </div>
          </a>`;
        }).join('')}</div>`
        : vide({ icone: 'projets', titre: 'Aucun projet pour le moment', texte: 'Décrivez-nous votre idée, on la cadre ensemble ici.', action: '<a class="btn btn-principal" href="#/nouveau-projet">Demander un nouveau projet</a>' })}
      </section>

      <div class="grille grille-tiers section">
        <section>
          <div class="section-tete"><h2>Activité récente</h2>${projets[0] ? `<a class="lien" href="#/projets/${echapper(projets[0].id)}/activite">Tout voir</a>` : ''}</div>
          ${activiteHtml(recentes, { avecProjet: projets.length > 1 })}
        </section>
        <aside class="pile" style="gap:var(--e-5)">
          <div class="carte carte--creuse">
            <p class="surtitre">Prochaine réunion</p>
            ${reunion ? `
              <p class="t-titre-3" style="margin-top:8px">${echapper(reunion.titre)}</p>
              <p class="t-petit t-2" style="margin-top:4px">${echapper(dateHeure(reunion.date))}${reunion.duree ? ` · ${reunion.duree} min` : ''}</p>
              ${reunion.lien ? `<a class="btn btn-secondaire btn-petit" style="margin-top:12px" href="${echapper(reunion.lien)}" target="_blank" rel="noopener">${icone('video')} Rejoindre</a>` : ''}
              <p style="margin-top:10px"><a class="t-petit" href="#/projets/${echapper(reunion.projet)}/reunions">Ordre du jour et historique</a></p>`
            : `<p class="t-petit t-2" style="margin-top:8px">Aucune réunion programmée.</p><p style="margin-top:8px"><a class="t-petit" href="#/messages">Demander un créneau</a></p>`}
          </div>
          <div class="carte carte--creuse">
            <p class="surtitre">Finances</p>
            ${dues.length ? `
              <p class="prix" style="margin-top:8px"><span class="montant">${echapper(montant(du))}</span><span class="unite">à régler</span></p>
              <p class="t-petit t-2" style="margin-top:4px">${pluriel(dues.length, 'facture en attente', 'factures en attente')}</p>`
            : '<p class="t-petit t-2" style="margin-top:8px">Aucune facture en attente.</p>'}
            <p style="margin-top:10px"><a class="t-petit" href="#/finances">Devis et factures</a></p>
          </div>
          ${dernieresReleases.length ? `<div class="carte carte--creuse">
            <p class="surtitre">Dernières versions</p>
            <div class="pile" style="margin-top:10px;gap:8px">${dernieresReleases.map((r) => `
              <a class="rang" style="gap:10px;color:inherit;flex-wrap:nowrap" href="#/projets/${echapper(r.projet)}/releases">
                <span class="ligne-icone ligne-icone--vert" style="width:30px;height:30px">${icone('releases')}</span>
                <span style="min-width:0"><span class="t-petit t-fort" style="display:block">${echapper(`${r.plateforme || ''} ${r.version || ''}`.trim())}</span><span class="t-micro t-3">${echapper(dateCourte(r.date))}</span></span>
              </a>`).join('')}</div>
          </div>` : ''}
        </aside>
      </div>
    </div>`;
  };

  const cles = [K.projets, K.profil, ...session.projets.flatMap((p) => [
    K.jalons(p.id), K.tickets(p.id), K.validations(p.id), K.documents(p.id), K.paiements(p.id),
    K.taches(p.id), K.blocages(p.id), K.reunions(p.id), K.releases(p.id), K.activite(p.id), K.messages(p.id),
  ])];
  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();
  void enDate; void echeanceHtml; void echeance; void depuis;
  return () => { clearTimeout(minuteur); lot.fin(); };
};
