/* ==========================================================================
   La page d'une brique : l'application iPhone, l'Android, le web, le
   tableau de bord, le site ou le serveur.

   Tout ce que le projet sait de cette plateforme se retrouve ici, et
   nulle part ailleurs en double : les versions publiées et leurs notes,
   les étapes de la feuille de route qui la concernent, les tâches, les
   demandes, les points bloquants, les décisions, les fichiers, les
   adresses et le journal. Le client la lit, l'équipe la modifie.
   ========================================================================== */

import {
  echapper, dateCourte, depuis, joursAvant, parDateDesc, borner, enParagraphes,
  PLATEFORMES, TYPES_COMPOSANT, STATUTS_COMPOSANT, STATUTS_JALON, STATUTS_TACHE, STATUTS_RELEASE,
  TYPES_CHANGEMENT, TYPES_NOTE, PRIORITES, STATUTS, OUVERTS, CATEGORIES_LIEN, pluriel,
} from '../noyau.js';
import {
  icone, pastille, puce, pucePlateforme, iconePlateforme, tonPlateforme, avatar, progression,
  ligne, vide, squelette, titrePage, metrique, sur, fichierHtml, encart, chronoItem,
} from '../ui.js';
import * as magasin from '../magasin.js';
import { K, abonnerProjet } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { editer, supprimer } from './editeurs.js';

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
  equipe: magasin.lire(K.equipe) || [],
});

/* Le repère de la brique : soit un composant existant, soit une plateforme
   déclarée sur le projet qui n'a pas encore sa brique. */
const resoudre = (d, cid) => {
  const composant = d.composants.find((c) => c.id === cid) || null;
  if (composant) return { composant, cle: composant.type, fiche: PLATEFORMES[composant.type] || null };
  const cle = String(cid || '').replace(/^p-/, '');
  return { composant: null, cle, fiche: PLATEFORMES[cle] || null };
};

/* Ce qui appartient à cette brique. Une tâche, une demande ou une version
   s'y rattache par son composant, ou à défaut par sa plateforme. */
const sien = (x, composant, cle) => {
  if (composant && x.composant && x.composant === composant.id) return true;
  if (x.plateforme && cle && x.plateforme === cle) return true;
  return false;
};

export const vue = async (ctx, env) => {
  const pid = ctx.params.id;
  const cid = ctx.params.cid;
  const equipe = env.role === 'equipe';
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  sortie.innerHTML = `<div class="page">${squelette('page', 5)}</div>`;
  abonnerProjet(lot, pid, env.role);

  const cles = [K.projet(pid), K.composants(pid), K.jalons(pid), K.liens(pid), K.taches(pid), K.tickets(pid),
    K.fichiers(pid), K.releases(pid), K.notes(pid), K.blocages(pid), K.activite(pid), K.equipe];
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
    const titre = composant ? composant.nom : (fiche ? fiche.libelle : 'Brique inconnue');
    const nomIcone = iconePlateforme(cle) || 'composants';
    const ton = tonPlateforme(cle);
    titrePage(`${titre} · ${d.projet.nom}`);
    filAriane([{ libelle: d.projet.nom, chemin: `/projets/${pid}` }, { libelle: titre }]);

    const versions = d.releases.filter((r) => sien(r, composant, cle)).sort(parDateDesc('date'));
    const taches = d.taches.filter((t) => sien(t, composant, cle));
    const ouvertes = taches.filter((t) => t.statut !== 'terminee');
    const demandes = d.tickets.filter((t) => sien(t, composant, cle));
    const demandesOuvertes = demandes.filter((t) => OUVERTS.includes(t.statut));
    const jalons = d.jalons.filter((j) => composant && Array.isArray(j.composants) && j.composants.includes(composant.id));
    const fichiers = d.fichiers.filter((f) => sien(f, composant, cle));
    const liens = d.liens.filter((l) => sien(l, composant, cle));
    const notes = d.notes.filter((n) => sien(n, composant, cle));
    const blocages = d.blocages.filter((b) => sien(b, composant, cle));
    const journal = d.activite.filter((a) => {
      const t = `${a.texte || ''}`.toLowerCase();
      return (composant && t.includes(String(composant.nom || '').toLowerCase()))
        || (fiche && t.includes(String(fiche.libelle || '').toLowerCase()));
    }).slice(0, 25);

    const adresse = (composant && composant.lien)
      || (liens.find((l) => ['production', 'mobile'].includes(l.categorie || '')) || {}).url || '';

    const publiees = versions.filter((v) => v.statut === 'disponible');
    const derniere = publiees[0] || versions[0] || null;

    sortie.innerHTML = `<div class="page">
      <header class="page-tete page-tete--projet">
        <div class="rang" style="gap:16px;align-items:flex-start;min-width:0">
          <span class="brique-icone${ton ? ` brique-icone--${ton}` : ''}">${icone(nomIcone)}</span>
          <div style="min-width:0">
            <p class="surtitre"><a href="#/projets/${echapper(pid)}">${echapper(d.projet.nom)}</a> · ${echapper(TYPES_COMPOSANT[cle] || (fiche ? fiche.libelle : ''))}</p>
            <h1 style="margin-top:2px">${echapper(titre)}</h1>
            <div class="rang tete-suivi">
              ${composant ? pastille(STATUTS_COMPOSANT, composant.statut || 'en-cours') : '<span class="etiquette">Pas encore suivie</span>'}
              ${fiche ? pucePlateforme(cle) : ''}
              ${composant && composant.version ? `<span class="puce">${icone('releases')} Version ${echapper(composant.version)}</span>` : ''}
              ${composant && composant.versionPrep ? `<span class="puce">${icone('sparkle')} ${echapper(composant.versionPrep)} en préparation</span>` : ''}
              ${composant && composant.environnement ? `<span class="puce">${icone('serveur')} ${echapper(composant.environnement)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="actions">
          ${adresse ? `<a class="btn btn-secondaire" href="${echapper(adresse)}" target="_blank" rel="noopener noreferrer">${icone('externe')} Ouvrir</a>` : ''}
          ${equipe && composant ? `<button class="btn btn-secondaire" type="button" data-action="editer" data-genre="composant" data-id="${echapper(composant.id)}">${icone('edit')} Modifier</button>` : ''}
          ${equipe ? `<button class="btn btn-principal" type="button" data-action="nouveau" data-genre="release" data-defaut='${echapper(JSON.stringify({ plateforme: cle, composant: composant ? composant.id : '' }))}'>${icone('plus')} Nouvelle version</button>` : ''}
          ${equipe && !composant ? `<button class="btn btn-principal" type="button" data-action="nouveau" data-genre="composant" data-defaut='${echapper(JSON.stringify({ type: cle, nom: fiche ? fiche.libelle : '' }))}'>${icone('plus')} Créer la brique</button>` : ''}
        </div>
      </header>

      ${composant && composant.description ? `<div class="carte carte--serree" style="margin-bottom:var(--e-5)"><div class="prose">${enParagraphes(composant.description)}</div></div>` : ''}

      <div class="metriques">
        ${metrique(`${borner(composant ? composant.progression : 0)} %`, 'Avancement')}
        ${metrique(publiees.length, 'Versions publiées', { nuance: versions.length > publiees.length ? `${versions.length - publiees.length} en cours` : '' })}
        ${metrique(ouvertes.length, 'Tâches ouvertes', { nuance: `${taches.length} au total` })}
        ${metrique(demandesOuvertes.length, 'Demandes ouvertes', { ton: demandesOuvertes.length ? 'accent' : '' })}
        ${metrique(blocages.length, 'Points bloquants', { ton: blocages.length ? 'rouge' : '' })}
        ${metrique(fichiers.length, 'Fichiers')}
      </div>

      ${composant && (composant.techno || []).length ? `<div class="rang" style="margin-top:var(--e-5);gap:6px">${(composant.techno || []).map((t) => `<span class="etiquette">${echapper(t)}</span>`).join('')}</div>` : ''}

      ${blocages.length ? `<section class="section">
        <div class="section-tete"><h2>Ce qui bloque <span class="compte-section compte-section--vif">${blocages.length}</span></h2></div>
        <div class="liste">${blocages.map((b) => ligne({
          icone: 'alerte', ton: 'rouge', titre: echapper(b.titre),
          sous: echapper([b.description, b.impact && `Conséquence : ${b.impact}`].filter(Boolean).join(' · ')),
          fin: `${b.responsable === 'client' ? '<span class="puce puce--ambre"><i></i>De votre côté</span>' : '<span class="puce"><i></i>De notre côté</span>'}${equipe ? boutons('blocage', b.id, b.titre) : ''}`,
        })).join('')}</div>
      </section>` : ''}

      <section class="section">
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
              <p class="t-micro t-3" style="margin-top:4px">${echapper([r.date ? dateCourte(r.date) : '', r.visibilite === 'interne' ? 'Interne' : ''].filter(Boolean).join(' · '))}</p>
              ${(r.notes || []).length ? `<ul class="notes-version">${(r.notes || []).map((n) => `<li><span class="puce puce--${(TYPES_CHANGEMENT[n.type] || {}).voile || 'gris'}"><i></i>${echapper((TYPES_CHANGEMENT[n.type] || {}).libelle || n.type || '')}</span> ${echapper(n.texte || '')}</li>`).join('')}</ul>` : ''}
              ${(r.liens && (r.liens.store || r.liens.test)) ? `<div class="rang" style="margin-top:10px;gap:8px">
                ${r.liens.store ? `<a class="btn btn-fantome btn-petit" href="${echapper(r.liens.store)}" target="_blank" rel="noopener noreferrer">${icone('externe')} Sur le store</a>` : ''}
                ${r.liens.test ? `<a class="btn btn-fantome btn-petit" href="${echapper(r.liens.test)}" target="_blank" rel="noopener noreferrer">${icone('externe')} Version de test</a>` : ''}
              </div>` : ''}
            </div>
          </article>`).join('')}</div>`
        : vide({ icone: 'releases', titre: 'Aucune version enregistrée', texte: equipe ? 'Chaque livraison notée ici devient l\'historique de la brique.' : 'Les livraisons apparaîtront ici, avec ce qui change à chaque fois.', compact: true })}
      </section>

      ${jalons.length ? `<section class="section">
        <div class="section-tete"><h2>Les étapes qui la concernent <span class="compte-section">${jalons.length}</span></h2><a class="lien" href="#/projets/${echapper(pid)}/roadmap">La feuille de route</a></div>
        <div class="liste">${jalons.map((j) => ligne({
          icone: j.statut === 'termine' ? 'check' : j.statut === 'bloque' ? 'alerte' : 'drapeau',
          ton: j.statut === 'termine' ? 'vert' : j.statut === 'bloque' ? 'rouge' : j.statut === 'en-cours' ? 'bleu' : '',
          titre: echapper(j.titre), sous: echapper(j.description || ''),
          fin: `${j.statut !== 'termine' ? `<span style="width:80px">${progression(j.progression)}</span>` : ''}${pastille(STATUTS_JALON, j.statut || 'a-venir')}`,
        })).join('')}</div>
      </section>` : ''}

      <section class="section">
        <div class="section-tete"><h2>Les tâches ${taches.length ? `<span class="compte-section">${ouvertes.length}</span>` : ''}</h2>${equipe ? `<button class="btn btn-secondaire btn-petit" type="button" data-action="nouveau" data-genre="tache" data-defaut='${echapper(JSON.stringify({ composant: composant ? composant.id : '' }))}'>${icone('plus')} Nouvelle tâche</button>` : ''}</div>
        ${taches.length ? `<div class="liste">${taches.map((t) => ligne({
          href: `#/projets/${echapper(pid)}/taches/${echapper(t.id)}`,
          icone: t.statut === 'terminee' ? 'check' : 'taches', ton: t.statut === 'terminee' ? 'vert' : t.statut === 'bloquee' ? 'rouge' : '',
          titre: echapper(t.titre),
          sous: echapper([t.echeance ? `échéance ${dateCourte(t.echeance)}` : '', t.estimation].filter(Boolean).join(' · ')),
          fin: `${puce(PRIORITES, t.priorite || 'normale')}${pastille(STATUTS_TACHE, t.statut || 'a-faire')}`,
        })).join('')}</div>` : vide({ icone: 'taches', titre: 'Aucune tâche sur cette brique', compact: true })}
      </section>

      <section class="section">
        <div class="section-tete"><h2>Les demandes ${demandes.length ? `<span class="compte-section">${demandesOuvertes.length}</span>` : ''}</h2><a class="lien" href="#/projets/${echapper(pid)}/nouvelle-demande">Nouvelle demande</a></div>
        ${demandes.length ? `<div class="liste">${demandes.map((t) => ligne({
          href: `#/projets/${echapper(pid)}/demandes/${echapper(t.id)}`,
          icone: 'demandes', titre: echapper(t.titre),
          sous: echapper([t.numero, t.version ? `version ${t.version}` : '', depuis(t.cree)].filter(Boolean).join(' · ')),
          fin: pastille(STATUTS, t.statut, { client: !equipe }),
        })).join('')}</div>` : vide({ icone: 'demandes', titre: 'Aucune demande sur cette brique', compact: true })}
      </section>

      ${notes.length ? `<section class="section">
        <div class="section-tete"><h2>Décisions et notes <span class="compte-section">${notes.length}</span></h2></div>
        <div class="liste">${notes.map((n) => ligne({
          icone: 'note', titre: echapper(n.titre),
          sous: echapper([(TYPES_NOTE[n.type] || {}).libelle || n.type, dateCourte(n.date || n.cree)].filter(Boolean).join(' · ')),
          fin: `${n.visibilite === 'interne' ? '<span class="etiquette">Interne</span>' : ''}${equipe ? boutons('note', n.id, n.titre) : ''}`,
        })).join('')}</div>
      </section>` : ''}

      <div class="grille grille-2 section">
        <section>
          <div class="section-tete"><h3>Les fichiers ${fichiers.length ? `<span class="compte-section">${fichiers.length}</span>` : ''}</h3></div>
          ${fichiers.length ? `<div class="liste">${fichiers.map((f) => fichierHtml(f)).join('')}</div>` : vide({ icone: 'fichiers', titre: 'Aucun fichier', compact: true })}
        </section>
        <section>
          <div class="section-tete"><h3>Les adresses ${liens.length ? `<span class="compte-section">${liens.length}</span>` : ''}</h3></div>
          ${liens.length ? `<div class="liste">${liens.map((l) => `<a class="lien-env" href="${echapper(l.url)}" target="_blank" rel="noopener noreferrer">
            <span class="ligne-icone">${icone('liens')}</span>
            <span><span class="ligne-titre">${echapper(l.nom)}</span><span class="ligne-sous tronque" style="display:block">${echapper([(CATEGORIES_LIEN[l.categorie] || ''), l.environnement].filter(Boolean).join(' · '))}</span></span>
            <span class="t-3">${icone('externe')}</span></a>`).join('')}</div>` : vide({ icone: 'liens', titre: 'Aucune adresse', compact: true })}
        </section>
      </div>

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
    if (action === 'nouveau') {
      let defaut = {};
      try { defaut = JSON.parse(el.dataset.defaut || '{}'); } catch (e) { defaut = {}; }
      return editer(genre, env, { pid, defaut });
    }
    if (action === 'editer') return editer(genre, env, { pid, fiche: trouver(genre, el.dataset.id) });
    if (action === 'supprimer') return supprimer(genre, env, { pid, fiche: trouver(genre, el.dataset.id), libelle: el.dataset.libelle });
    return undefined;
  });

  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(() => rendre(false), 60); };
  cles.forEach((c) => lot.sur(c, planifier));
  planifier();

  return {
    fin: () => { clearTimeout(minuteur); gestes(); lot.fin(); },
    maj: () => rendre(true),
  };
};

void avatar; void encart; void joursAvant; void pluriel;
