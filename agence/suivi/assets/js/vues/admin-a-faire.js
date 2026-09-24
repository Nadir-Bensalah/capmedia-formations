/* ==========================================================================
   Les projets à faire : les idées à ne pas perdre, et les projets mis de
   côté. Un projet à faire est un projet comme les autres, rangé à part par
   un simple drapeau (« aFaire ») : le basculer ne touche ni à son contenu,
   ni à l'accès d'un client. Sa note vit hors du projet, dans « idees »,
   là où seule l'équipe lit.
   ========================================================================== */

import { echapper, depuis, pluriel, bdd, collection, TYPES_PROJET, PLATEFORMES } from '../noyau.js';
import { icone, avatarProjet, pucePlateforme, vide, squelette, titrePage, sur, agir, confirmer, menu, modale, lireForme, valider, obligatoire, longueurMax, optionsDe, choixPlateformes } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, ecrire } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { naviguer } from '../routeur.js';
import { appelServeur } from '../serveur.js';
import { noteHtml, extrait, lecture } from '../note.js';

const AIDE_NOTE = '## un titre, ### un sous-titre, - une liste, > une phrase mise en avant, --- un séparateur, **du gras**.';
const MAX_NOTE = 60000;

const idees = () => new Map((magasin.lire(K.idees) || []).map((i) => [i.id, i]));
const quand = (v) => (v && typeof v.seconds === 'number' ? v.seconds : 0);

/* ==========================================================================
   Le geste qui range, et celui qui ressort
   ========================================================================== */

/**
 * Range un projet dans les projets à faire, ou l'en sort. Une idée qui
 * démarre quitte la préparation pour le cadrage : sinon elle arriverait
 * dans le portefeuille marquée « brouillon », sans que rien n'ait changé.
 */
export const basculerAFaire = async (projet, versAFaire) => {
  const clientDedans = !projet.interne && projet.ouvert === true;
  const ok = await confirmer({
    titre: versAFaire ? 'Ranger ce projet dans les projets à faire ?' : 'Passer ce projet dans vos projets actuels ?',
    texte: versAFaire
      ? `Il quitte les projets en cours et l'accueil. Rien n'est perdu : étapes, tâches et fichiers restent en place, et un geste le ramène.${clientDedans ? ' Le client garde son accès.' : ''}`
      : `Il rejoint vos projets en cours, avec sa note.${projet.statut === 'brouillon' ? ' Il passe en cadrage.' : ''}`,
    ok: versAFaire ? 'Ranger' : 'Passer en projet actuel',
  });
  if (!ok) return false;
  const changements = { aFaire: versAFaire };
  if (!versAFaire && projet.statut === 'brouillon') changements.statut = 'cadrage';
  return agir(null, () => ecrire.majProjet(projet.id, changements), versAFaire ? 'Rangé dans les projets à faire.' : 'Projet passé dans vos projets actuels.');
};

/* ==========================================================================
   La feuille : noter une idée, ou reprendre sa note
   ========================================================================== */

/* Une référence tirée du nom : le premier mot s'il est assez long, sinon
   les premières lettres. Le serveur refuse un doublon, on essaie alors
   la suivante. */
const refDepuis = (nom, rang = 0) => {
  const mots = String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let base = (mots[0] && mots[0].length >= 4 ? mots[0] : mots.join('')).slice(0, 12);
  if (!/^[A-Z]/.test(base)) base = `I${base}`;
  if (base.length < 2) base = `${base}IDEE`.slice(0, 12);
  return rang ? `${base.slice(0, 13)}${rang + 1}` : base;
};

const ouvrirFeuille = ({ env, projet = null, texte = '' }) => {
  const neuf = !projet;
  const p = projet || { nom: '', description: '', type: 'application-mobile', plateformes: [] };
  const m = modale({
    titre: neuf ? 'Noter une idée' : 'La note',
    sousTitre: neuf ? 'Elle se range dans vos projets à faire.' : p.nom,
    feuille: true,
    corps: `<form class="forme" id="af-forme" novalidate>
      <div class="groupe"><label class="etiquette-champ" for="af-nom">Nom</label><input class="champ" id="af-nom" name="nom" value="${echapper(p.nom)}" maxlength="120" placeholder="Ex. Wealth Simulator"></div>
      <div class="groupe"><label class="etiquette-champ" for="af-description">En une phrase <span class="facultatif">(facultatif)</span></label><input class="champ" id="af-description" name="description" value="${echapper(p.description || '')}" maxlength="240" placeholder="Ce que c'est, pour qui"></div>
      <div class="forme-rang">
        <div class="groupe"><label class="etiquette-champ" for="af-type">Type</label><select class="select" id="af-type" name="type">${optionsDe(TYPES_PROJET, p.type || 'application-mobile')}</select></div>
      </div>
      <div class="groupe"><span class="etiquette-champ">Plateformes <span class="facultatif">(facultatif)</span></span>${choixPlateformes('plateformes', p.plateformes || [])}</div>
      <div class="groupe"><label class="etiquette-champ" for="af-texte">La note</label><textarea class="zone af-zone" id="af-texte" name="texte" rows="16" maxlength="${MAX_NOTE}" placeholder="L'idée, telle qu'elle vous vient.">${echapper(texte)}</textarea><p class="aide">${echapper(AIDE_NOTE)}</p></div>
    </form>`,
    pied: `<button class="btn btn-secondaire" type="button" data-fermer>Annuler</button><button class="btn btn-principal" type="submit" form="af-forme">${neuf ? 'Noter' : 'Enregistrer'}</button>`,
  });
  const forme = m.el.querySelector('#af-forme');
  forme.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valider(forme, { nom: obligatoire('Donnez-lui un nom, même provisoire.'), texte: longueurMax(MAX_NOTE) })) return;
    const v = lireForme(forme);
    const plateformes = Array.from(forme.querySelectorAll('[name="plateformes"]:checked')).map((c) => c.value).filter((c) => PLATEFORMES[c]);
    const bouton = m.pied.querySelector('[type="submit"]');
    let id = p.id;
    const ok = await agir(bouton, async () => {
      if (neuf) {
        for (let rang = 0; ; rang += 1) {
          try {
            const r = await appelServeur('creerProjet', {
              interne: true, aFaire: true, silence: true, statut: 'brouillon',
              nom: v.nom, ref: refDepuis(v.nom, rang), description: v.description, type: v.type, plateformes,
              responsable: env.session.equipe.uid, idee: v.texte,
            });
            id = r.id;
            break;
          } catch (err) {
            if (rang < 8 && /deja prise/.test(String(err && err.message))) continue;
            throw err;
          }
        }
      } else {
        await ecrire.majProjet(id, { nom: v.nom, description: v.description, type: v.type, plateformes });
        await ecrire.noterIdee(id, v.texte, env.session.utilisateur.uid);
      }
    }, neuf ? 'Idée notée.' : 'Note enregistrée.');
    if (!ok) return;
    m.fermer(id);
    if (neuf && id) naviguer(`/a-faire/${id}`);
  });
  return m.fin;
};

export const noterIdee = (env) => ouvrirFeuille({ env });

/* ==========================================================================
   La liste
   ========================================================================== */

const carte = (p, idee) => {
  const texte = (idee && idee.texte) || '';
  const n = texte ? noteHtml(texte) : null;
  const client = !p.interne ? ((p.client || {}).entreprise || (p.client || {}).nom || 'un client') : '';
  const pied = [
    client ? `Mis de côté · ${client}` : '',
    `Noté ${depuis(p.cree)}`,
    n && n.sommaire.length ? pluriel(n.sommaire.length, 'partie') : '',
    n && n.mots ? `${lecture(n.mots)} min de lecture` : '',
  ].filter(Boolean);
  return `<a class="af-carte" href="#/a-faire/${echapper(p.id)}" data-projet="${echapper(p.id)}">
    <div class="af-carte-tete">${avatarProjet(p)}<span class="af-plateformes">${(p.plateformes || []).map((c) => pucePlateforme(c, { court: false, titre: true })).join('')}</span></div>
    <h2 class="af-carte-nom">${echapper(p.nom)}</h2>
    ${p.description ? `<p class="af-carte-phrase">${echapper(p.description)}</p>` : ''}
    ${texte ? `<p class="af-carte-extrait">${echapper(extrait(texte))}</p>` : '<p class="af-carte-extrait af-carte-extrait--vide">Pas encore de note.</p>'}
    <p class="af-carte-pied">${pied.map(echapper).join(' · ')}</p>
  </a>`;
};

export const liste = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Projets à faire');
  filAriane([{ libelle: 'Projets à faire' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;
  lot.abonner(K.idees, () => collection(bdd, 'idees'));

  const rendre = () => {
    if (!magasin.chargee(K.projets)) return;
    const notes = idees();
    const projets = (magasin.lire(K.projets) || []).filter((p) => p.aFaire && !p.archive)
      .sort((a, b) => Math.max(quand((notes.get(b.id) || {}).maj), quand(b.maj)) - Math.max(quand((notes.get(a.id) || {}).maj), quand(a.maj)));
    const bouton = `<button class="btn btn-principal" type="button" data-noter>${icone('plus')} Noter une idée</button>`;
    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><h1>Projets à faire</h1><p class="chapo">Les idées à ne pas perdre, et les projets mis de côté. Un geste les fait passer dans vos projets actuels, un autre les y ramène.</p></div><div class="actions">${projets.length ? bouton : ''}</div></div>
      ${projets.length
        ? `<div class="af-grille">${projets.map((p) => carte(p, notes.get(p.id))).join('')}</div>`
        : vide({ icone: 'ampoule', titre: 'Rien de noté pour l\'instant', texte: 'Une idée qui vous vient, un projet à reprendre plus tard : notez-le ici, il vous attendra.', action: bouton })}
    </div>`;
  };
  const gestes = sur(sortie, 'click', '[data-noter]', () => noterIdee(env));
  [K.projets, K.idees].forEach((c) => lot.sur(c, rendre));
  rendre();
  /* « Noter une idée » depuis la recherche : la feuille s'ouvre sur la page,
     et l'adresse perd sa demande sans renaviguer, ce qui refermerait tout. */
  if (ctx.requete && ctx.requete.noter) {
    try { history.replaceState(null, '', '#/a-faire'); } catch (e) { /* adresse laissée telle quelle */ }
    noterIdee(env);
  }
  return () => { gestes(); lot.fin(); };
};

/* ==========================================================================
   Une idée, à lire
   ========================================================================== */

export const detail = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  const pid = ctx.params.id;
  sortie.innerHTML = `<div class="page">${squelette('page', 4)}</div>`;
  lot.abonner(K.idees, () => collection(bdd, 'idees'));

  const rendre = () => {
    if (!magasin.chargee(K.projets)) return;
    const p = (magasin.lire(K.projets) || []).find((x) => x.id === pid);
    if (!p) {
      titrePage('Projets à faire');
      filAriane([{ libelle: 'Projets à faire', chemin: '/a-faire' }]);
      sortie.innerHTML = `<div class="page">${vide({ icone: 'ampoule', titre: 'Cette idée est introuvable', texte: 'Elle a peut-être été archivée.', action: '<a class="btn btn-secondaire" href="#/a-faire">Retour aux projets à faire</a>' })}</div>`;
      return;
    }
    titrePage(p.nom);
    filAriane([{ libelle: 'Projets à faire', chemin: '/a-faire' }, { libelle: p.nom }]);
    const idee = idees().get(pid);
    const texte = (idee && idee.texte) || '';
    const n = noteHtml(texte);
    const etat = p.archive ? 'Projet archivé' : p.aFaire ? (p.interne ? 'Projet à faire' : 'Projet client mis de côté') : 'Projet en cours';
    const meta = [
      `Noté ${depuis(p.cree)}`,
      /* La note posée à la création n'a pas été « reprise » : on ne le dit
         qu'à partir d'une vraie reprise, une minute au moins après. */
      idee && idee.maj && quand(idee.maj) - quand(p.cree) > 60 ? `note reprise ${depuis(idee.maj)}` : '',
      n.mots ? `${lecture(n.mots)} min de lecture` : '',
    ].filter(Boolean).join(' · ');
    const sommaire = n.sommaire.length > 2 ? `<nav class="af-sommaire" aria-label="Sommaire de la note">
      <p class="af-sommaire-titre">Sommaire</p>
      <ol>${n.sommaire.map((s) => `<li><button type="button" data-ancre="${s.ancre}">${echapper(s.titre)}</button></li>`).join('')}</ol>
    </nav>` : '';
    sortie.innerHTML = `<div class="page">
      <header class="page-tete page-tete--projet af-tete">
        <div class="rang" style="gap:16px;align-items:flex-start;min-width:0">
          ${avatarProjet(p, 'grand')}
          <div style="min-width:0">
            <p class="surtitre">${echapper(etat)}</p>
            <h1>${echapper(p.nom)}</h1>
            ${p.description ? `<p class="chapo">${echapper(p.description)}</p>` : ''}
            <div class="rang af-tete-puces">${(p.plateformes || []).map((c) => pucePlateforme(c)).join('')}<span class="t-micro t-3">${echapper(meta)}</span></div>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-secondaire" type="button" data-modifier>${icone('edit')} ${texte ? 'Modifier' : 'Écrire la note'}</button>
          ${p.archive ? '' : p.aFaire
            ? `<button class="btn btn-principal" type="button" data-basculer="actuel">${icone('fleche')} Passer en projet actuel</button>`
            : `<a class="btn btn-principal" href="#/projets/${echapper(pid)}">Ouvrir le projet</a>`}
          <button class="btn-icone" type="button" data-plus aria-label="Plus">${icone('points')}</button>
        </div>
      </header>
      ${texte
        ? `<div class="af-lecture${sommaire ? '' : ' af-lecture--seule'}">${sommaire}<article class="af-note">${n.html}</article></div>`
        : vide({ icone: 'note', titre: 'Pas encore de note', texte: 'Écrivez l\'idée telle qu\'elle vous vient. Elle ne se montre à aucun client.', action: '<button class="btn btn-principal" type="button" data-modifier>Écrire la note</button>' })}
    </div>`;
  };

  const gestes = sur(sortie, 'click', '[data-modifier], [data-basculer], [data-plus], [data-ancre]', async (el) => {
    const p = (magasin.lire(K.projets) || []).find((x) => x.id === pid);
    if (!p) return;
    if (el.dataset.ancre) {
      /* Pas de lien « #ancre » : le routeur lit le fragment comme une page. */
      const cible = sortie.querySelector(`#${CSS.escape(el.dataset.ancre)}`);
      if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (el.hasAttribute('data-modifier')) { await ouvrirFeuille({ env, projet: p, texte: (idees().get(pid) || {}).texte || '' }); return; }
    if (el.dataset.basculer === 'actuel') { if (await basculerAFaire(p, false)) naviguer(`/projets/${pid}`); return; }
    if (el.hasAttribute('data-plus')) {
      menu(el, [
        { libelle: 'Ouvrir la fiche du projet', icone: 'projets', action: () => naviguer(`/projets/${pid}`) },
        ...(!p.archive && !p.aFaire ? [{ libelle: 'Ranger dans les projets à faire', icone: 'ampoule', action: () => basculerAFaire(p, true) }] : []),
        ...(!p.archive ? [{ libelle: 'Archiver', icone: 'archive', action: async () => {
          if (await confirmer({ titre: 'Archiver cette idée ?', texte: 'Elle rejoint les archives, avec sa note. Rien n\'est effacé.', ok: 'Archiver' })) {
            if (await agir(null, () => ecrire.majProjet(pid, { archive: true, statut: 'archive' }), 'Idée archivée.')) naviguer('/a-faire');
          }
        } }] : []),
      ]);
    }
  });
  [K.projets, K.idees].forEach((c) => lot.sur(c, rendre));
  rendre();
  return () => { gestes(); lot.fin(); };
};

