/* ==========================================================================
   La page d'une brique : l'application iPhone, l'Android, le web, le
   tableau de bord, le site ou le serveur.

   Tout ce que le projet sait de cette plateforme se retrouve ici, et
   nulle part ailleurs en double : les versions publiées et leurs notes,
   les étapes de la feuille de route qui la concernent, les tâches, les
   demandes, les points bloquants, les décisions, les fichiers, les
   adresses et le journal. Le client la lit, l'équipe la modifie.

   En tête, la fiche de la partie (partie-format.js) : un en-tête avec ses
   versions et ses liens, les chiffres clés, ce qu'elle fait, où elle en
   est, son histoire datée, comment elle est faite. Une section sans
   donnée ne se dessine pas ; l'équipe voit ce qui reste à rédiger et
   corrige chaque section depuis le Cockpit (partie-editeur.js).
   ========================================================================== */

import {
  echapper, dateCourte, depuis, joursAvant, parDateDesc, borner, enParagraphes,
  PLATEFORMES, TYPES_COMPOSANT, STATUTS_COMPOSANT, STATUTS_ETAPE, STATUTS_TACHE, STATUTS_RELEASE,
  TYPES_CHANGEMENT, TYPES_NOTE, PRIORITES, STATUTS, OUVERTS, CATEGORIES_LIEN, pluriel, nombre, age,
} from '../noyau.js';
import {
  icone, pastille, puce, pucePlateforme, iconePlateforme, tonPlateforme, avatar, progression,
  ligne, vide, squelette, titrePage, metrique, sur, fichierHtml, encart, chronoItem, brancherPieces,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K, abonnerProjet, trierEtapes, versionsPartie } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { editer, supprimer } from './editeurs.js';
import { editerPartie, SECTIONS_PARTIE } from './partie-editeur.js';
import { trierHistorique, datePartie, URL_PARTIE } from '../partie-format.js';

const lire = (pid) => ({
  projet: magasin.lire(K.projet(pid)),
  composants: (magasin.lire(K.composants(pid)) || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)),
  jalons: (magasin.lire(K.jalons(pid)) || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)),
  liens: magasin.lire(K.liens(pid)) || [],
  taches: (magasin.lire(K.taches(pid)) || []).filter((t) => !t.archive),
  tickets: (magasin.lire(K.tickets(pid)) || []).filter((t) => !t.archive),
  fichiers: (magasin.lire(K.fichiers(pid)) || []).filter((f) => !f.archive),
  releases: magasin.lire(K.releases(pid)) || [],
  notes: magasin.lire(K.notes(pid)) || [],
  blocages: magasin.lire(K.blocages(pid)) || [],
  activite: (magasin.lire(K.activite(pid)) || []).slice().sort(parDateDesc('date')),
  technique: magasin.lire(K.technique(pid)) || [],
  equipe: magasin.lire(K.equipe) || [],
});

/* Le repère de la brique : soit un composant existant, soit une plateforme
   déclarée sur le projet qui n'a pas encore sa brique. */
const resoudre = (d, cid) => {
  const cle = String(cid || '').replace(/^p-/, '');
  const composant = d.composants.find((c) => c.id === cid)
    || (String(cid || '').startsWith('p-') ? d.composants.find((c) => c.type === cle) : null);
  if (composant) return { composant, cle: composant.type, fiche: PLATEFORMES[composant.type] || null };
  return { composant: null, cle, fiche: PLATEFORMES[cle] || null };
};

/* Ce qui appartient à cette brique. Une tâche, une demande ou une version
   s'y rattache par son composant, ou à défaut par sa plateforme. */
const sien = (x, composant, cle) => {
  /* Une demande pour « l'application mobile » appartient aux deux briques,
     iPhone et Android. */
  if (x.composant === 'mobile' || (!x.composant && x.plateforme === 'mobile')) return cle === 'ios' || cle === 'android';
  return x.composant
    ? Boolean(composant) && x.composant === composant.id
    : Boolean(cle) && x.plateforme === cle;
};

export const vue = async (ctx, env) => {
  const pid = ctx.params.id;
  const cid = ctx.params.cid;
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  /* Les fichiers de la partie : le bouton Télécharger ne faisait rien ici. */
  brancherPieces(sortie);
  abonnerProjet(lot, pid, env.role);

  const cles = [K.projet(pid), K.composants(pid), K.jalons(pid), K.liens(pid), K.taches(pid), K.tickets(pid),
    K.fichiers(pid), K.releases(pid), K.notes(pid), K.blocages(pid), K.activite(pid), K.technique(pid), K.equipe];
  let empreinte = '';

  const rendre = (force = false) => {
    const d = lire(pid);
    if (d.projet === undefined) return;
    if (!force && magasin.empreinte(cles) === empreinte) return;
    empreinte = magasin.empreinte(cles);

    if (!d.projet) {
      sortie.innerHTML = `<div class="page">${vide({ icone: 'projets', titre: 'Projet introuvable' })}</div>`;
      return;
    }

    const { composant, cle, fiche } = resoudre(d, cid);
    const titre = composant ? composant.nom : (fiche ? fiche.libelle : 'Partie inconnue');
    const nomIcone = iconePlateforme(cle) || 'composants';
    const ton = tonPlateforme(cle);
    titrePage(`${titre} · ${d.projet.nom}`);
    filAriane([{ libelle: d.projet.nom, chemin: `/projets/${pid}` }, { libelle: titre }]);

    const versions = d.releases.filter((r) => sien(r, composant, cle)).sort(parDateDesc('date'));
    const taches = d.taches.filter((t) => sien(t, composant, cle))
      .sort((a, b) => Number(a.statut === 'terminee') - Number(b.statut === 'terminee'));
    const ouvertes = taches.filter((t) => t.statut !== 'terminee');
    const demandes = d.tickets.filter((t) => sien(t, composant, cle)).sort(parDateDesc('cree')).slice(0, 20);
    const demandesOuvertes = demandes.filter((t) => OUVERTS.includes(t.statut));
    const jalons = trierEtapes(d.jalons.filter((j) => composant && Array.isArray(j.composants) && j.composants.includes(composant.id)));
    const fichiers = d.fichiers.filter((f) => sien(f, composant, cle));
    const liens = d.liens.filter((l) => sien(l, composant, cle));
    const notes = d.notes.filter((n) => sien(n, composant, cle));
    const blocages = d.blocages.filter((b) => !b.resolu && sien(b, composant, cle));
    /* Le journal se rattache par identifiant, jamais par ressemblance de
       texte : chercher « web » dans une phrase attrapait « webhook ». */
    const miens = new Set([...versions, ...taches, ...fichiers, ...demandes].map((x) => x.id));
    const journal = d.activite.filter((a) => a.cible && miens.has(a.cible)).slice(0, 25);

    const adresse = (composant && composant.lien)
      || (liens.find((l) => ['production', 'mobile'].includes(l.categorie || '')) || {}).url || '';

    const tec = (composant && d.technique.find((x) => x.id === composant.id)) || {};
    const lienFiche = `<button class="lien" type="button" data-action="editer" data-genre="technique" data-id="${echapper(composant ? composant.id : '')}">Compléter</button>`;

    const publiees = versions.filter((v) => v.statut === 'disponible');
    const derniere = publiees[0] || versions[0] || null;

    /* La fiche de la partie, lue par le client (partie-format.js). Chaque
       section ne se dessine que si sa donnée existe ; l'équipe voit en
       plus, à part, la liste de ce qui reste à rédiger. */
    const c = composant || {};
    const vp = versionsPartie(d.releases, cle, composant);
    const chiffres = (Array.isArray(c.chiffres) ? c.chiffres : []).filter((x) => x && x.valeur && x.libelle);
    const fonctions = (Array.isArray(c.fonctions) ? c.fonctions : []).filter(Boolean);
    const etapesSuivantes = (Array.isArray(c.prochainesEtapes) ? c.prochainesEtapes : []).filter(Boolean);
    const attention = (Array.isArray(c.pointsAttention) ? c.pointsAttention : []).filter(Boolean);
    const technologies = (Array.isArray(c.technologies) ? c.technologies : []).filter((x) => x && x.nom);
    const historique = trierHistorique(c.historique).filter((h) => h.titre);
    const liensPartie = (Array.isArray(c.liens) ? c.liens : []).filter((l) => l && l.libelle && URL_PARTIE.test(String(l.url || '')));
    const resume = c.resume || c.description || '';
    const ceQuElleFait = Boolean(resume || fonctions.length);
    const ouEnEst = Boolean(c.etatActuel || etapesSuivantes.length || attention.length);
    const commentFaite = Boolean(technologies.length || c.hebergement || (c.techno || []).length);
    const adresseEnPlus = adresse && /^https:\/\//i.test(adresse) && !liensPartie.some((l) => l.url === adresse) ? adresse : '';
    const modifier = (section, libelle = 'Modifier') => (equipe && composant
      ? `<button class="btn btn-fantome btn-petit" type="button" data-action="editer-partie" data-section-edit="${section}">${icone('edit')} ${libelle}</button>`
      : '');
    const manquent = composant ? [
      !c.sousTitre && 'entete',
      !chiffres.length && 'chiffres',
      !ceQuElleFait && 'fonctions',
      !ouEnEst && 'etat',
      !historique.length && 'historique',
      !technologies.length && !c.hebergement && 'fabrication',
    ].filter(Boolean) : [];

    /* L'historique en frise, rangé par année, du plus récent au plus
       ancien. Au-delà de huit entrées, le reste se déplie. */
    const frise = (liste) => {
      const parAnnee = [];
      liste.forEach((h) => {
        const annee = h.date.slice(0, 4);
        const groupe = parAnnee.find((g) => g.annee === annee);
        if (groupe) groupe.items.push(h); else parAnnee.push({ annee, items: [h] });
      });
      return parAnnee.map((g) => `<div class="partie-frise-annee">
        <p class="partie-frise-an">${echapper(g.annee)}</p>
        <ol class="partie-frise">${g.items.map((h) => `<li class="partie-frise-item">
          <time class="partie-frise-date" datetime="${echapper(h.date)}">${echapper(datePartie(h.date, { court: true }).replace(/\s\d{4}$/, ''))}</time>
          <div class="partie-frise-corps"><p class="partie-frise-titre">${echapper(h.titre)}</p>${h.detail ? `<p class="partie-frise-detail">${echapper(h.detail)}</p>` : ''}</div>
        </li>`).join('')}</ol>
      </div>`).join('');
    };

    const versionBloc = (quoi, numero, nuance, cleBloc) => `<div class="partie-version" data-version="${cleBloc}">
      <p class="partie-version-quoi">${echapper(quoi)}</p>
      <p class="partie-version-num">${numero ? echapper(numero) : '-'}</p>
      <p class="partie-version-nuance">${echapper(nuance || '')}</p>
    </div>`;

    sortie.innerHTML = `<div class="page page-partie" data-partie-page="${echapper(composant ? composant.id : cle)}">
      <header class="partie-tete partie-tete--${echapper(ton || 'gris')}" data-section="entete">
        <div class="partie-tete-haut">
          <span class="partie-tuile">${icone(nomIcone)}</span>
          <div class="partie-titres">
            <p class="surtitre"><a href="#/projets/${echapper(pid)}">${echapper(d.projet.nom)}</a> · ${echapper(TYPES_COMPOSANT[cle] || (fiche ? fiche.libelle : 'Partie du projet'))}</p>
            <h1>${echapper(titre)}</h1>
            ${c.sousTitre ? `<p class="partie-sous-titre">${echapper(c.sousTitre)}</p>` : ''}
          </div>
          <div class="actions partie-actions">
            ${modifier('entete', 'L\'en-tête')}
            ${equipe && composant ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="editer" data-genre="composant" data-id="${echapper(composant.id)}">${icone('edit')} Réglages</button>` : ''}
            ${equipe && composant ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="editer" data-genre="technique" data-id="${echapper(composant.id)}">${icone('code')} Fiche technique</button>` : ''}
            ${equipe ? `<button class="btn btn-principal btn-petit" type="button" data-action="nouveau" data-genre="release" data-defaut='${echapper(JSON.stringify({ plateforme: cle, composant: composant ? composant.id : '' }))}'>${icone('plus')} Nouvelle version</button>` : ''}
            ${equipe && !composant ? `<button class="btn btn-principal btn-petit" type="button" data-action="nouveau" data-genre="composant" data-defaut='${echapper(JSON.stringify({ type: cle, nom: fiche ? fiche.libelle : '' }))}'>${icone('plus')} Suivre cette partie</button>` : ''}
          </div>
        </div>
        <div class="partie-versions">
          <div class="partie-version" data-version="statut">
            <p class="partie-version-quoi">Statut</p>
            <p class="partie-version-statut">${composant ? pastille(STATUTS_COMPOSANT, c.statut || 'en-cours') : '<span class="etiquette">Pas encore suivie</span>'}</p>
            <p class="partie-version-nuance">${composant && dateCourte(c.maj) ? `mis à jour le ${echapper(dateCourte(c.maj))}` : ''}</p>
          </div>
          ${vp.enLigne ? versionBloc('En ligne', vp.enLigne.numero, [vp.enLigne.quand && `depuis le ${vp.enLigne.quand}`, vp.enLigne.ou].filter(Boolean).join(' · '), 'en-ligne') : ''}
          ${vp.prep ? versionBloc('En préparation', vp.prep.numero, vp.prep.etat, 'preparation') : ''}
        </div>
        ${liensPartie.length || adresseEnPlus ? `<div class="partie-liens">
          ${liensPartie.map((l) => `<a class="btn btn-secondaire" href="${echapper(l.url)}" target="_blank" rel="noopener noreferrer" data-lien-partie>${echapper(l.libelle)} ${icone('externe')}</a>`).join('')}
          ${adresseEnPlus ? `<a class="btn btn-secondaire" href="${echapper(adresseEnPlus)}" target="_blank" rel="noopener noreferrer">Ouvrir ${icone('externe')}</a>` : ''}
        </div>` : ''}
      </header>

      ${equipe && composant && manquent.length ? `<div class="partie-a-completer" data-section="a-completer">
        <p><strong>Encore vide, invisible pour le client :</strong></p>
        <div class="rang" style="gap:6px">${manquent.map((m) => `<button class="btn btn-doux btn-petit" type="button" data-action="editer-partie" data-section-edit="${m}">${icone('plus')} ${echapper(SECTIONS_PARTIE[m])}</button>`).join('')}</div>
      </div>` : ''}

      ${chiffres.length ? `<div class="metriques partie-chiffres" data-section="chiffres">${chiffres.map((x) => metrique(x.valeur, x.libelle)).join('')}</div>
      ${equipe ? `<div class="partie-geste">${modifier('chiffres', 'Les chiffres')}</div>` : ''}` : ''}

      ${ceQuElleFait ? `<section class="section partie-section" data-section="fonctions">
        <div class="section-tete"><h2>Ce que fait cette partie</h2>${modifier('fonctions')}</div>
        ${resume ? `<div class="partie-resume">${enParagraphes(resume)}</div>` : ''}
        ${fonctions.length ? `<ol class="partie-fonctions">${fonctions.map((f, i) => `<li><span class="partie-index">${String(i + 1).padStart(2, '0')}</span><span>${echapper(f)}</span></li>`).join('')}</ol>` : ''}
      </section>` : ''}

      ${ouEnEst || commentFaite ? `<div class="${ouEnEst && commentFaite ? 'grille grille-2 ' : ''}section partie-duo">
        ${ouEnEst ? `<section class="partie-section" data-section="etat">
          <div class="section-tete"><h2>Où on en est</h2>${modifier('etat')}</div>
          ${c.etatActuel ? `<p class="partie-lead">${echapper(c.etatActuel)}</p>` : ''}
          ${etapesSuivantes.length ? `<div class="partie-bloc" data-bloc="prochaines-etapes">
            <p class="partie-bloc-titre">Les prochaines étapes</p>
            <ol class="partie-etapes">${etapesSuivantes.map((e, i) => `<li><span class="partie-index">${i + 1}</span><span>${echapper(e)}</span></li>`).join('')}</ol>
          </div>` : ''}
          ${attention.length ? `<div class="partie-bloc partie-attention" data-bloc="points-attention">
            <p class="partie-bloc-titre">${attention.length > 1 ? 'Points d\'attention' : 'Point d\'attention'}</p>
            <ul>${attention.map((a) => `<li>${echapper(a)}</li>`).join('')}</ul>
          </div>` : ''}
        </section>` : ''}
        ${commentFaite ? `<section class="partie-section" data-section="fabrication">
          <div class="section-tete"><h2>Comment elle est faite</h2>${modifier('fabrication')}</div>
          ${technologies.length ? `<dl class="partie-technos">${technologies.map((t) => `<div><dt>${echapper(t.nom)}</dt>${t.role ? `<dd>${echapper(t.role)}</dd>` : ''}</div>`).join('')}</dl>`
            : `<div class="rang" style="gap:6px">${(c.techno || []).map((t) => `<span class="etiquette">${echapper(t)}</span>`).join('')}</div>`}
          ${c.hebergement ? `<div class="partie-bloc" data-bloc="hebergement"><p class="partie-bloc-titre">Où elle vit</p><p class="partie-texte">${echapper(c.hebergement)}</p></div>` : ''}
        </section>` : ''}
      </div>` : ''}

      ${historique.length ? `<section class="section partie-section" data-section="historique">
        <div class="section-tete"><h2>Son histoire <span class="compte-section">${historique.length}</span></h2>${modifier('historique')}</div>
        ${frise(historique.slice(0, 8))}
        ${historique.length > 8 ? `<details class="depliant partie-frise-suite"><summary>Voir les ${historique.length - 8} étapes plus anciennes</summary>${frise(historique.slice(8))}</details>` : ''}
      </section>` : ''}

      <div class="metriques partie-suivi" data-section="suivi">
        ${composant ? metrique(`${borner(composant.progression)} %`, 'Avancement de la partie', { nuance: dateCourte(composant.maj) ? `le ${dateCourte(composant.maj)}` : '' }) : metrique('Pas encore suivie', 'Avancement')}
        ${metrique(publiees.length, 'Versions publiées', { nuance: versions.length > publiees.length ? `${versions.length - publiees.length} en cours` : '' })}
        ${metrique(ouvertes.length, 'Tâches ouvertes', { nuance: `${taches.length} au total` })}
        ${metrique(demandesOuvertes.length, 'Tickets ouverts', { ton: demandesOuvertes.length ? 'accent' : '' })}
        ${metrique(blocages.length, 'Points bloquants', { ton: blocages.length ? 'rouge' : '' })}
      </div>

      ${equipe && tec.alertes && tec.alertes.length ? `<section class="section" data-section="alertes">
        <div class="section-tete"><h2>À mettre à jour <span class="compte-section compte-section--vif">${tec.alertes.length}</span></h2>${equipe ? lienFiche : ''}</div>
        <div class="liste">${tec.alertes.map((a) => ligne({
          icone: a.gravite === 'critique' ? 'alerte' : a.gravite === 'attention' ? 'horloge' : 'info',
          ton: a.gravite === 'critique' ? 'rouge' : a.gravite === 'attention' ? 'ambre' : 'bleu',
          titre: echapper(a.titre),
          sous: echapper(a.texte || ''),
          fin: a.echeance ? `<span class="puce${a.gravite === 'critique' ? ' puce--rouge' : a.gravite === 'attention' ? ' puce--ambre' : ''}"><i></i>${echapper(a.echeance)}</span>` : '',
        })).join('')}</div>
      </section>` : ''}

      ${equipe && (tec.lignes || tec.fichiers || (tec.technos || []).length) ? `<section class="section">
        <div class="section-tete"><h2>Le code</h2>${tec.releve ? `<span class="t-petit t-3">Relevé ${echapper(depuis(tec.releve))}</span>` : ''}</div>
        <div class="metriques">
          ${tec.lignes ? metrique(nombre(tec.lignes), 'Lignes de code', { nuance: tec.fichiers ? `${nombre(tec.fichiers)} fichiers` : '' }) : ''}
          ${(tec.dependances || []).length ? metrique((tec.dependances || []).filter((x) => !x.dev).length, 'Bibliothèques', { nuance: `${(tec.dependances || []).filter((x) => x.dev).length} de développement` }) : ''}
          ${tec.poids ? metrique(tec.poids, 'Poids du dépôt') : ''}
          ${(tec.assets || []).length ? metrique((tec.assets || []).length, 'Jeux de ressources') : ''}
        </div>
        ${(tec.technos || []).length ? `<div class="rang" style="margin-top:var(--e-5);gap:6px">${(tec.technos || []).map((x) => `<span class="etiquette etiquette--techno">${echapper(x.nom)}${x.version ? ` <b>${echapper(x.version)}</b>` : ''}</span>`).join('')}</div>` : ''}
      </section>` : ''}

      ${equipe && (tec.dependances || []).length ? `<section class="section">
        <details class="depliant">
          <summary><span class="t-titre-3">Les bibliothèques installées</span><span class="compte-section">${(tec.dependances || []).length}</span></summary>
          <table class="tableau" style="margin-top:var(--e-4)">
            <thead><tr><th>Bibliothèque</th><th>Version</th><th>Usage</th></tr></thead>
            <tbody>${(tec.dependances || []).slice().sort((a, b) => String(a.nom).localeCompare(String(b.nom))).map((x) => `<tr>
              <td>${echapper(x.nom)}</td><td class="nb">${echapper(x.version || '')}</td>
              <td>${x.dev ? '<span class="etiquette">Développement</span>' : '<span class="etiquette">Production</span>'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </details>
      </section>` : ''}

      ${equipe && (tec.assets || []).length ? `<section class="section">
        <div class="section-tete"><h3>Les ressources</h3></div>
        <div class="liste">${(tec.assets || []).map((a) => ligne({ icone: 'image', titre: echapper(a.nom), sous: echapper(a.detail || '') })).join('')}</div>
      </section>` : ''}

      ${equipe && (tec.acces || []).length ? `<section class="section">
        <div class="section-tete"><h3>Les comptes et les accès</h3>${equipe ? lienFiche : ''}</div>
        <div class="liste">${(tec.acces || []).map((a) => ligne({
          href: a.url || undefined,
          icone: 'cle', titre: echapper(a.nom),
          sous: echapper([a.compte, a.detenteur && `détenu par ${a.detenteur}`].filter(Boolean).join(' · ')),
          fin: a.url ? `<span class="t-3">${icone('externe')}</span>` : '',
        })).join('')}</div>
        <p class="aide" style="margin-top:8px">Aucun mot de passe ni clé n'est stocké ici, seulement qui détient quoi et où.</p>
      </section>` : ''}

      ${blocages.length || equipe ? `<section class="section">
        <div class="section-tete"><h2>Ce qui bloque ${blocages.length ? `<span class="compte-section compte-section--vif">${blocages.length}</span>` : ''}</h2>${equipe && composant ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="nouveau" data-genre="blocage" data-defaut='${echapper(JSON.stringify({ composant: composant ? composant.id : '' }))}'>${icone('plus')} Signaler</button>` : ''}</div>
        ${blocages.length ? `<div class="liste">${blocages.map((b) => ligne({
          icone: 'alerte', ton: 'rouge', titre: echapper(b.titre),
          sous: echapper([b.description, b.impact && `Conséquence : ${b.impact}`].filter(Boolean).join(' · ')),
          fin: `${b.responsable === 'client' ? '<span class="puce puce--ambre"><i></i>De votre côté</span>' : '<span class="puce"><i></i>De notre côté</span>'}${equipe ? boutons('blocage', b.id, b.titre) : ''}`,
        })).join('')}</div>` : '<p class="t-petit t-3">Rien ne bloque cette partie.</p>'}
      </section>` : ''}

      ${versions.length || equipe ? `<section class="section" data-section="versions">
        <div class="section-tete"><h2>Les versions ${versions.length ? `<span class="compte-section">${versions.length}</span>` : ''}</h2>${derniere && derniere.version ? `<span class="t-petit t-3">Dernière : ${echapper(derniere.version)}</span>` : ''}</div>
        ${versions.length ? `<div class="chrono">${versions.map((r) => `
          <article class="chrono-item">
            <span class="chrono-point${r.statut === 'disponible' ? ' chrono-point--ok' : ''}"></span>
            <div class="carte carte--serree">
              <div class="rang-espace">
                <div class="rang" style="gap:10px">
                  <p class="t-titre-3">${echapper(r.version || 'Sans numéro')}</p>
                  ${r.titre ? `<span class="t-2 t-petit">${echapper(r.titre)}</span>` : ''}
                </div>
                <div class="rang">${pastille(STATUTS_RELEASE, r.statut || 'developpement')}${equipe ? boutons('release', r.id, r.version) : ''}</div>
              </div>
              <p class="t-micro t-3" style="margin-top:4px">${echapper([r.statut === 'disponible' ? (dateCourte(r.date) ? `Publiée le ${dateCourte(r.date)}` : 'Publiée, date non renseignée') : dateCourte(r.date), r.build ? `build ${r.build}` : '', r.visibilite === 'interne' ? 'Interne' : ''].filter(Boolean).join(' · '))}</p>
              ${(r.notes || []).length ? `<ul class="notes-version">${(r.notes || []).map((n) => `<li><span class="puce puce--${(TYPES_CHANGEMENT[n.type] || {}).voile || 'gris'}"><i></i>${echapper((TYPES_CHANGEMENT[n.type] || {}).libelle || n.type || '')}</span> ${echapper(n.texte || '')}</li>`).join('')}</ul>` : ''}
              ${(r.liens && (r.liens.store || r.liens.test)) ? `<div class="rang" style="margin-top:10px;gap:8px">
                ${r.liens.store ? `<a class="btn btn-fantome btn-petit" href="${echapper(r.liens.store)}" target="_blank" rel="noopener noreferrer">${icone('externe')} Sur le store</a>` : ''}
                ${r.liens.test ? `<a class="btn btn-fantome btn-petit" href="${echapper(r.liens.test)}" target="_blank" rel="noopener noreferrer">${icone('externe')} Version de test</a>` : ''}
              </div>` : ''}
            </div>
          </article>`).join('')}</div>`
        : vide({ icone: 'releases', titre: 'Aucune version enregistrée', texte: 'Chaque livraison notée ici devient l\'historique de la brique.', compact: true })}
      </section>` : ''}

      ${jalons.length ? `<section class="section">
        <div class="section-tete"><h2>Les étapes qui la concernent <span class="compte-section">${jalons.length}</span></h2><a class="lien" href="#/projets/${echapper(pid)}/etapes">${equipe ? 'La feuille de route' : 'Le planning'}</a></div>
        <div class="liste">${jalons.map((j) => ligne({
          icone: j.statut === 'termine' ? 'check' : j.statut === 'bloque' ? 'alerte' : 'drapeau',
          ton: j.statut === 'termine' ? 'vert' : j.statut === 'bloque' ? 'rouge' : j.statut === 'en-cours' ? 'bleu' : '',
          titre: echapper(j.titre), sous: echapper(j.description || ''),
          fin: `${j.statut !== 'termine' ? `<span style="width:80px">${progression(j.progression)}</span>` : ''}${pastille(STATUTS_ETAPE, j.statut || 'a-venir')}`,
        })).join('')}</div>
      </section>` : ''}

      ${taches.length || equipe ? `<section class="section" data-section="taches">
        <div class="section-tete"><h2>Les tâches ${taches.length ? `<span class="compte-section">${ouvertes.length}</span>` : ''}</h2>${equipe ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="nouveau" data-genre="tache" data-defaut='${echapper(JSON.stringify({ composant: composant ? composant.id : '' }))}'>${icone('plus')} Nouvelle tâche</button>` : ''}</div>
        ${taches.length ? `<div class="liste">${taches.map((t) => ligne({
          href: `#/projets/${echapper(pid)}/taches/${echapper(t.id)}`,
          icone: t.statut === 'terminee' ? 'check' : 'taches', ton: t.statut === 'terminee' ? 'vert' : t.statut === 'bloquee' ? 'rouge' : '',
          titre: echapper(t.titre),
          sous: echapper([dateCourte(t.echeance) ? `échéance ${dateCourte(t.echeance)}` : '', t.estimation].filter(Boolean).join(' · ')),
          fin: `${puce(PRIORITES, t.priorite || 'normale')}${pastille(STATUTS_TACHE, t.statut || 'a-faire', { client: !equipe })}`,
        })).join('')}</div>` : vide({ icone: 'taches', titre: 'Aucune tâche sur cette brique', compact: true })}
      </section>` : ''}

      <section class="section" data-section="demandes">
        <div class="section-tete"><h2>Les tickets ${demandes.length ? `<span class="compte-section">${demandesOuvertes.length}</span>` : ''}</h2><a class="lien" href="#/projets/${echapper(pid)}/nouvelle-demande">${equipe ? 'Nouvelle demande' : 'Nouveau ticket'}</a></div>
        ${demandes.length ? `<div class="liste">${demandes.map((t) => ligne({
          href: `#/projets/${echapper(pid)}/demandes/${echapper(t.id)}`,
          icone: 'demandes', titre: echapper(t.titre),
          sous: echapper([t.numero, t.version ? `version ${t.version}` : '', OUVERTS.includes(t.statut) ? `${equipe ? 'ouverte' : 'ouvert'} depuis ${age(t.cree)}` : `${equipe ? 'close' : 'clos'} ${depuis(t.maj)}`].filter(Boolean).join(' · ')),
          fin: pastille(STATUTS, t.statut, { client: !equipe }),
        })).join('')}</div>` : `<p class="t-petit t-3">Aucun ticket sur cette partie. Une question, un souhait : écrivez-nous.</p>`}
      </section>

      ${notes.length || equipe ? `<section class="section">
        <div class="section-tete"><h2>Décisions et notes ${notes.length ? `<span class="compte-section">${notes.length}</span>` : ''}</h2>${equipe && composant ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="nouveau" data-genre="note" data-defaut='${echapper(JSON.stringify({ composant: composant ? composant.id : '' }))}'>${icone('plus')} Nouvelle note</button>` : ''}</div>
        ${notes.length ? `<div class="liste">${notes.map((n) => ligne({
          icone: 'note', titre: echapper(n.titre),
          sous: echapper([(TYPES_NOTE[n.type] || {}).libelle || n.type, dateCourte(n.date || n.cree)].filter(Boolean).join(' · ')),
          fin: `${n.visibilite === 'interne' ? '<span class="etiquette">Interne</span>' : ''}${equipe ? boutons('note', n.id, n.titre) : ''}`,
        })).join('')}</div>` : '<p class="t-petit t-3">Aucune décision rattachée à cette partie pour l\'instant.</p>'}
      </section>` : ''}

      ${fichiers.length || liens.length || equipe ? `<div class="${(fichiers.length && liens.length) || equipe ? 'grille grille-2 ' : ''}section">
        ${fichiers.length || equipe ? `<section data-section="fichiers">
          <div class="section-tete"><h3>Les fichiers ${fichiers.length ? `<span class="compte-section">${fichiers.length}</span>` : ''}</h3></div>
          ${fichiers.length ? `<div class="liste">${fichiers.map((f) => fichierHtml(f)).join('')}</div>` : vide({ icone: 'fichiers', titre: 'Aucun fichier', compact: true })}
        </section>` : ''}
        ${liens.length || equipe ? `<section data-section="adresses">
          <div class="section-tete"><h3>Les adresses ${liens.length ? `<span class="compte-section">${liens.length}</span>` : ''}</h3></div>
          ${liens.length ? `<div class="liste">${liens.map((l) => `<a class="lien-env" href="${echapper(l.url)}" target="_blank" rel="noopener noreferrer">
            <span class="ligne-icone">${icone('liens')}</span>
            <span><span class="ligne-titre">${echapper(l.nom)}</span><span class="ligne-sous tronque" style="display:block">${echapper([(CATEGORIES_LIEN[l.categorie] || ''), l.environnement].filter(Boolean).join(' · '))}</span></span>
            <span class="t-3">${icone('externe')}</span></a>`).join('')}</div>` : vide({ icone: 'liens', titre: 'Aucune adresse', compact: true })}
        </section>` : ''}
      </div>` : ''}

      ${journal.length ? `<section class="section">
        <div class="section-tete"><h3>Le journal</h3><a class="lien" href="#/projets/${echapper(pid)}/activite">Tout le projet</a></div>
        <div class="chrono">${journal.map((a) => chronoItem({
          texte: `<strong>${echapper(a.parNom || 'Capmedia')}</strong> ${echapper(a.texte || '')}`,
          date: depuis(a.date),
        })).join('')}</div>
      </section>` : ''}
    </div>`;
  };

  const boutons = (genre, id, libelle) => (equipe
    ? `<span class="rang boutons-edition"><button class="btn-icone" type="button" data-action="editer" data-genre="${genre}" data-id="${echapper(id)}" aria-label="Modifier" data-astuce="Modifier">${icone('edit')}</button><button class="btn-icone" type="button" data-action="supprimer" data-genre="${genre}" data-id="${echapper(id)}" data-libelle="${echapper(libelle || '')}" aria-label="Supprimer" data-astuce="Supprimer">${icone('corbeille')}</button></span>`
    : '');

  const gestes = sur(sortie, 'click', '[data-action]', async (el) => {
    const d = lire(pid);
    const genre = el.dataset.genre;
    const action = el.dataset.action;
    const trouver = (g, id) => ({
      composant: d.composants, release: d.releases, note: d.notes, blocage: d.blocages, tache: d.taches,
    }[g] || []).find((x) => x.id === id);
    if (action === 'editer-partie') {
      const { composant } = resoudre(d, cid);
      return editerPartie(env, { pid, composant, section: el.dataset.sectionEdit });
    }
    if (action === 'nouveau') {
      let defaut = {};
      try { defaut = JSON.parse(el.dataset.defaut || '{}'); } catch (e) { defaut = {}; }
      return editer(genre, env, { pid, defaut });
    }
    if (action === 'editer') {
      const cible = genre === 'technique' ? d.composants.find((c) => c.id === el.dataset.id) : trouver(genre, el.dataset.id);
      return editer(genre, env, { pid, fiche: cible });
    }
    if (action === 'supprimer') return supprimer(genre, env, { pid, fiche: trouver(genre, el.dataset.id), libelle: el.dataset.libelle });
    return undefined;
  });

  /* Premier dessin avant l'affichage, les suivants regroupés : la page
     n'apparaît qu'une fois, sans squelette quand la donnée est déjà là. */
  const planifier = magasin.dessinateur(() => rendre(false), 60, cles);
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();

  return {
    fin: () => { planifier.arreter(); gestes(); lot.fin(); },
    maj: () => rendre(true),
  };
};

void avatar; void encart; void joursAvant; void pluriel; void pucePlateforme;
