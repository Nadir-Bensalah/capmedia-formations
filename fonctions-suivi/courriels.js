/* ==========================================================================
   ESPACE DE SUIVI CLIENT · les gabarits d'e-mail
   Contrat : docs/suivi.md, section 6.

   Un seul gabarit, sobre, tout en ligne : les clients de messagerie
   jettent les feuilles de style externes, et beaucoup jettent aussi les
   balises <style>. Donc chaque couleur, chaque marge est portée par un
   attribut « style » sur la balise qui en a besoin.

   Les couleurs viennent de agence/assets/css/tokens.css, en dur ici parce
   qu'un e-mail ne sait pas lire une variable CSS. Elles sont regroupées
   dans TEINTES : c'est le seul endroit à corriger si le site change.

   Chaque modèle renvoie { objet, html, texte }. Toujours les deux corps :
   un client de messagerie en mode texte doit rester lisible.
   ========================================================================== */

/* --- Les couleurs du site, figées pour la messagerie -------------------- */
const TEINTES = {
  fond: '#F6F5F4',      // --bg-3, le fond de la fenêtre autour de la lettre
  lettre: '#FFFFFF',    // --bg
  texte: '#000000',     // --texte
  texte2: '#615D59',    // --texte-2, gris chaud
  texte3: '#A39E98',    // --texte-3, le pied de page
  trait: '#E8E6E4',     // --trait, en opaque : le rgba passe mal partout
  action: '#0075DE',    // --action, réservé à l'unique bouton
  voile: '#F9F9F8',     // --bg-2, le fond d'une citation
};

const POLICE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const LARGEUR = 600;

const SITE = 'https://capmedia.app';
const BASE = `${SITE}/suivi/`;
const SIGNATURE = 'Capmedia Digital';

/* --- Les liens directs, une seule source ------------------------------- */
const lienEspace = () => BASE;
const lienTicket = (ticketId) => `${BASE}ticket?t=${encodeURIComponent(String(ticketId || ''))}`;
const lienProjet = (projetId) => `${BASE}projet?p=${encodeURIComponent(String(projetId || ''))}`;

/* ==========================================================================
   1. Les garde-fous de valeur
   ========================================================================== */

/**
 * Ramène n'importe quelle valeur à du texte présentable. Un objet ou un
 * indéfini deviennent une chaîne vide : personne ne doit lire « undefined »
 * ni « [object Object] » dans un e-mail signé de l'agence.
 */
function valeurTexte(valeur) {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'object') return '';
  if (typeof valeur === 'number' && !Number.isFinite(valeur)) return '';
  return String(valeur);
}

/**
 * Échappe avant toute insertion dans le HTML. Aucune exception, pas même
 * pour un champ « sûr » : le titre d'un ticket est saisi par un client, et
 * un e-mail d'agence ne doit jamais devenir un vecteur d'injection.
 */
function echapper(valeur) {
  return valeurTexte(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texte libre rendu avec ses retours à la ligne, sans HTML injecté. */
function enParagraphes(texteLibre, style) {
  const blocs = echapper(texteLibre).split(/\n{2,}/).filter((b) => b.trim());
  if (!blocs.length) return '';
  return blocs
    .map((bloc) => `<p style="${style}">${bloc.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Coupe un texte long pour l'aperçu d'un e-mail, sans couper un mot. */
function extrait(texteLibre, maximum = 600) {
  const brut = valeurTexte(texteLibre).trim();
  if (brut.length <= maximum) return brut;
  const coupe = brut.slice(0, maximum);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > maximum * 0.6 ? coupe.slice(0, espace) : coupe).trim()}...`;
}

/** Une date Firestore, une Date, ou une chaîne : vers « 14 mars 2026 ». */
function dateFr(valeur) {
  const date = enDate(valeur);
  if (!date) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function enDate(valeur) {
  if (!valeur) return null;
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? null : valeur;
  if (typeof valeur.toDate === 'function') {
    try { return enDate(valeur.toDate()); } catch (e) { return null; }
  }
  if (typeof valeur === 'object') {
    const secondes = valeur.seconds ?? valeur._seconds;
    return typeof secondes === 'number' ? new Date(secondes * 1000) : null;
  }
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Un montant hors taxes, en euros. Une valeur absente ne s'affiche pas. */
function montantHT(valeur) {
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return '';
  const chiffres = nombre.toLocaleString('fr-FR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${chiffres} EUR hors taxes`;
}

/** Un montant toutes taxes, en euros, avec le hors taxes entre parenthèses
 *  quand il en diffère. C'est le TTC que le client doit : c'est lui que la
 *  lettre annonce en premier. Sans TTC connu, le HT seul. */
function montantTTC(ttc, ht) {
  const toutes = Number(ttc);
  const hors = Number(ht);
  if (!Number.isFinite(toutes)) return montantHT(ht);
  const chiffres = toutes.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const detail = Number.isFinite(hors) && Math.abs(hors - toutes) >= 0.01 ? ` (${montantHT(hors)})` : '';
  return `${chiffres} EUR TTC${detail}`;
}

/* ==========================================================================
   2. Les libellés, alignés sur agence/suivi/assets/noyau.js
   ========================================================================== */

const STATUTS = {
  'nouveau': 'Reçue',
  'a-analyser': 'À analyser',
  'en-attente-client': "Besoin d'information",
  'acceptee': 'Acceptée',
  'planifiee': 'Planifiée',
  'en-cours': 'En cours',
  'en-revue': 'En revue',
  'a-valider': 'À valider',
  'resolu': 'Terminée',
  'refuse': 'Refusée',
  'annulee': 'Annulée',
  'ferme': 'Fermée',
};

/** Le bout de phrase qui passe dans l'objet : « votre demande ... ». */
const PHRASES_STATUT = {
  'nouveau': 'est revenue au statut reçue',
  'a-analyser': 'est à analyser',
  'en-attente-client': 'attend votre réponse',
  'acceptee': 'est acceptée',
  'planifiee': 'est planifiée',
  'en-cours': 'est passée en cours',
  'en-revue': 'est en relecture chez nous',
  'a-valider': 'attend votre validation',
  'resolu': 'est terminée',
  'refuse': 'est refusée',
  'annulee': 'est annulée',
  'ferme': 'est fermée',
};

const URGENCES = {
  'bloquant': 'Bloquant',
  'critique': 'Critique',
  'important': 'Important',
  'mineur': 'Mineur',
};

/* Les neuf types du formulaire, et « autre ». Trois seulement étaient
   connus ici : la ligne « Type » manquait dans l'accusé des six autres. */
const TYPES = {
  'bug': 'Anomalie',
  'modification': 'Modification',
  'fonctionnalite': 'Nouvelle fonctionnalité',
  'amelioration': 'Amélioration',
  'question': 'Question',
  'technique': 'Demande technique',
  'contenu': 'Demande de contenu',
  'devis': 'Demande de devis',
  'demande': 'Demande',
  'autre': 'Autre',
};

const PLATEFORMES = {
  'ios': 'iPhone',
  'android': 'Android',
  'web': 'Web',
  'admin': 'Tableau de bord',
  'backend': 'Serveur',
  'landing': 'Site vitrine',
};

const libelle = (table, cle, defaut = '') => table[valeurTexte(cle)] || defaut;

/* ==========================================================================
   3. Le gabarit

   rendreGabarit reçoit du texte brut et l'échappe lui-même. Aucun appelant
   ne lui passe de HTML : c'est ce qui garantit qu'aucun champ ne peut
   échapper au nettoyage, même après une modification distraite.
   ========================================================================== */

const S = {
  titre: `margin:0 0 16px;font:600 22px/1.3 ${POLICE};color:${TEINTES.texte};letter-spacing:-0.01em;`,
  corps: `margin:0 0 16px;font:400 16px/1.6 ${POLICE};color:${TEINTES.texte2};`,
  fort: `margin:0 0 16px;font:400 16px/1.6 ${POLICE};color:${TEINTES.texte};`,
  cle: `padding:6px 0;font:400 14px/1.5 ${POLICE};color:${TEINTES.texte3};vertical-align:top;white-space:nowrap;`,
  val: `padding:6px 0 6px 16px;font:500 14px/1.5 ${POLICE};color:${TEINTES.texte};vertical-align:top;`,
  note: `margin:16px 0 0;font:400 14px/1.6 ${POLICE};color:${TEINTES.texte3};`,
  pied: `margin:0;font:400 13px/1.6 ${POLICE};color:${TEINTES.texte3};`,
  lienPied: `color:${TEINTES.texte3};text-decoration:underline;`,
};

/**
 * @param {object} bloc
 *   titre    string          le titre de la lettre
 *   intro    string          un ou plusieurs paragraphes (séparés par \n\n)
 *   faits    array           [[clé, valeur]], les valeurs vides sont retirées
 *   citation string          un message repris tel quel, encadré
 *   bouton   { libelle, url } l'unique bouton bleu
 *   note     string          la précision en petits caractères
 */
function rendreGabarit(bloc) {
  const faits = (bloc.faits || [])
    .map(([cle, valeur]) => [valeurTexte(cle), valeurTexte(valeur).trim()])
    .filter(([cle, valeur]) => cle && valeur);

  const tableFaits = faits.length ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                     style="border-collapse:collapse;margin:0 0 24px;border-top:1px solid ${TEINTES.trait};border-bottom:1px solid ${TEINTES.trait};">
                ${faits.map(([cle, valeur]) => `<tr>
                  <td style="${S.cle}">${echapper(cle)}</td>
                  <td style="${S.val}">${echapper(valeur)}</td>
                </tr>`).join('\n                ')}
              </table>` : '';

  const citation = valeurTexte(bloc.citation).trim() ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                     style="border-collapse:collapse;margin:0 0 24px;">
                <tr><td style="background:${TEINTES.voile};border-left:2px solid ${TEINTES.trait};padding:16px 20px;">
                  ${enParagraphes(bloc.citation, `margin:0 0 8px;font:400 15px/1.6 ${POLICE};color:${TEINTES.texte};`)}
                </td></tr>
              </table>` : '';

  const bouton = (bloc.bouton && valeurTexte(bloc.bouton.url)) ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 8px;">
                <tr><td style="background:${TEINTES.action};border-radius:4px;">
                  <a href="${echapper(bloc.bouton.url)}"
                     style="display:inline-block;padding:12px 22px;font:600 15px/1 ${POLICE};color:#FFFFFF;text-decoration:none;">${echapper(bloc.bouton.libelle || 'Ouvrir mon espace')}</a>
                </td></tr>
              </table>` : '';

  const note = valeurTexte(bloc.note).trim()
    ? `<p style="${S.note}">${echapper(bloc.note)}</p>` : '';

  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="border-collapse:collapse;background:${TEINTES.fond};margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR}"
             style="border-collapse:collapse;width:100%;max-width:${LARGEUR}px;background:${TEINTES.lettre};border:1px solid ${TEINTES.trait};border-radius:6px;">
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font:600 14px/1 ${POLICE};color:${TEINTES.texte};letter-spacing:0.02em;">${echapper(SIGNATURE)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="height:1px;background:${TEINTES.trait};line-height:1px;font-size:0;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px;">
            <h1 style="${S.titre}">${echapper(bloc.titre)}</h1>
            ${enParagraphes(bloc.intro, S.corps)}${tableFaits}${citation}${bouton}${note}
          </td>
        </tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LARGEUR}"
             style="border-collapse:collapse;width:100%;max-width:${LARGEUR}px;">
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="${S.pied}">${echapper(SIGNATURE)} · <a href="${SITE}" style="${S.lienPied}">capmedia.app</a><br>
            Cet e-mail vous est adressé au titre du suivi de votre projet.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  return { html, texte: rendreTexte(bloc, faits) };
}

/** La même lettre, en texte brut. Jamais vide : l'objet sert de secours. */
function rendreTexte(bloc, faits) {
  const lignes = [valeurTexte(SIGNATURE).toUpperCase(), ''];

  const titre = valeurTexte(bloc.titre).trim();
  if (titre) lignes.push(titre, '');

  const intro = valeurTexte(bloc.intro).trim();
  if (intro) lignes.push(intro, '');

  for (const [cle, valeur] of faits) lignes.push(`${cle} : ${valeur}`);
  if (faits.length) lignes.push('');

  const citation = valeurTexte(bloc.citation).trim();
  if (citation) {
    lignes.push(...citation.split('\n').map((l) => `> ${l}`), '');
  }

  if (bloc.bouton && valeurTexte(bloc.bouton.url)) {
    lignes.push(`${valeurTexte(bloc.bouton.libelle) || 'Ouvrir mon espace'} : ${valeurTexte(bloc.bouton.url)}`, '');
  }

  const note = valeurTexte(bloc.note).trim();
  if (note) lignes.push(note, '');

  lignes.push(`${SIGNATURE} · ${SITE}`);
  return lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* --- L'objet : le numéro du ticket d'abord, quand il y en a un --------- */
function objetAvecNumero(numero, suite) {
  const num = valeurTexte(numero).trim();
  return num ? `${num} · ${suite}` : suite;
}

/* ==========================================================================
   4. Les dix modèles

   Chacun reçoit les « variables » de son document d'envoi et renvoie
   { objet, html, texte }. Aucune lecture de base ici : tout ce qui est
   nécessaire a été figé au moment de la mise en file, ce qui rend l'e-mail
   fidèle à l'instant de l'événement même s'il part une heure plus tard.
   ========================================================================== */

/* 1. Invitation d'un client sur son espace. */
function invitation(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const prenom = valeurTexte(v.clientNom).trim();
  return {
    objet: projet ? `Votre espace de suivi ${projet} est ouvert` : 'Votre espace de suivi est ouvert',
    ...rendreGabarit({
      titre: 'Votre espace de suivi est ouvert',
      intro: `${prenom ? `Bonjour ${prenom},` : 'Bonjour,'}\n\n`
        + `Votre espace de suivi${projet ? ` pour ${projet}` : ''} est en ligne. Vous y déclarez une anomalie ou une demande, `
        + 'vous suivez son avancement, vous échangez avec nous et vous retrouvez vos devis et vos factures.\n\n'
        + "La connexion se fait sans mot de passe : saisissez votre adresse e-mail, un code à six chiffres vous est envoyé, et il ouvre la session. Il est valable dix minutes et ne sert qu'une fois.",
      faits: [
        ['Projet', projet],
        ['Votre adresse', valeurTexte(v.email)],
        ['Votre rôle', valeurTexte(v.role) === 'responsable' ? 'Responsable du projet' : (valeurTexte(v.role) === 'collaborateur' ? 'Collaborateur' : '')],
      ],
      bouton: { libelle: 'Ouvrir mon espace', url: valeurTexte(v.lien) || lienEspace() },
      note: "Utilisez bien l'adresse à laquelle vous avez reçu cet e-mail : c'est elle qui donne accès au projet.",
    }),
  };
}

/* 1 bis. L'invitation d'un testeur.

   Elle était absente : inscrire un testeur créait son compte en silence, et
   personne ne lui disait ni qu'il était attendu, ni où aller. Il ne pouvait
   donc pas entrer, même avec un compte valide.

   Un testeur n'est membre d'aucun projet : il ne voit que les scénarios
   qu'on lui confie, jamais le reste. La lettre le dit, parce que son écran
   ne ressemble à rien de ce qu'il connaît. */
function invitationTesteur(v) {
  const prenom = valeurTexte(v.prenom).trim();
  const projet = valeurTexte(v.projetNom).trim();
  const plateformes = (Array.isArray(v.plateformes) ? v.plateformes : [])
    .map((p) => libelle(PLATEFORMES, p, p)).filter(Boolean).join(', ');
  return {
    objet: projet ? `Vous testez ${projet} : votre espace est ouvert` : 'Votre espace de test est ouvert',
    ...rendreGabarit({
      titre: 'Votre espace de test est ouvert',
      intro: `${prenom ? `Bonjour ${prenom},` : 'Bonjour,'}\n\n`
        + `Nous vous avons inscrit comme testeur${projet ? ` sur ${projet}` : ''}. Votre travail consiste à dérouler des scénarios précis, `
        + "écrits pas à pas, et à dire pour chacun ce que vous avez obtenu : cela a marché, cela n'a pas marché, ou cela ne s'appliquait pas.\n\n"
        + "Quand quelque chose ne marche pas, une capture d'écran est demandée : c'est elle qui permet de reproduire le problème, donc de le corriger.\n\n"
        + "La connexion se fait sans mot de passe : saisissez votre adresse e-mail, un code à six chiffres vous est envoyé, et il ouvre la session. Il est valable quinze minutes et ne sert qu'une fois.",
      faits: [
        ['Projet', projet],
        ['Votre adresse', valeurTexte(v.email)],
        ['Ce que vous testez', plateformes],
      ],
      bouton: { libelle: 'Ouvrir mon espace de test', url: valeurTexte(v.lien) || lienEspace() },
      note: "Utilisez bien l'adresse à laquelle vous avez reçu cet e-mail : c'est elle qui ouvre votre espace. Vous ne voyez que les scénarios qui vous sont confiés, et vous n'avez accès à rien d'autre du projet.",
    }),
  };
}

/* 1 ter. L'ouverture d'un projet.

   La première fois qu'un projet s'ouvre au client, une seule lettre part à
   chaque interlocuteur : l'invitation, et ce qui l'attend déjà dans son
   espace. Pas une lettre par événement accumulé pendant la préparation :
   un résumé, puis l'espace. */
function ouverture(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const prenom = valeurTexte(v.clientNom).trim().split(/\s+/)[0] || '';
  const points = (Array.isArray(v.points) ? v.points : []).slice(0, 8)
    .map((p) => [valeurTexte(p && p.quoi), valeurTexte(p && p.detail)]);
  return {
    objet: projet ? `${projet} : votre espace de suivi est ouvert` : 'Votre espace de suivi est ouvert',
    ...rendreGabarit({
      titre: 'Votre espace de suivi est ouvert',
      intro: `${prenom ? `Bonjour ${prenom},` : 'Bonjour,'}\n\n`
        + `Votre espace de suivi${projet ? ` pour ${projet}` : ''} est prêt. Vous y suivez l'avancement, vous posez vos demandes, `
        + "vous échangez avec nous et vous retrouvez ce qui attend votre avis.\n\n"
        + (points.length ? 'Voici ce qui vous y attend déjà.' : "La connexion se fait sans mot de passe : saisissez votre adresse, un code à six chiffres vous est envoyé, il ouvre la session."),
      faits: [
        ['Votre rôle', valeurTexte(v.role) === 'responsable' ? 'Responsable du projet' : 'Collaborateur'],
        ...points,
        ['Votre adresse', valeurTexte(v.email)],
      ],
      bouton: { libelle: 'Ouvrir mon espace', url: valeurTexte(v.lien) || lienEspace() },
      note: "La connexion se fait sans mot de passe : un code à six chiffres, valable dix minutes, arrive à l'adresse qui a reçu cet e-mail.",
    }),
  };
}

/* 1 quater. L'arrivée dans l'équipe. */
function invitationEquipe(v) {
  const prenom = valeurTexte(v.nom).trim().split(/\s+/)[0] || '';
  const admin = valeurTexte(v.role) === 'admin';
  return {
    objet: "Votre accès au cockpit Capmedia",
    ...rendreGabarit({
      titre: "Bienvenue dans l'équipe",
      intro: `${prenom ? `Bonjour ${prenom},` : 'Bonjour,'}\n\n`
        + `Un accès au cockpit Capmedia vient de vous être ouvert, avec le rôle ${admin ? 'administrateur' : 'agent'}. `
        + (admin ? "Vous voyez tous les projets et vous administrez l'équipe." : 'Vous voyez les projets sur lesquels vous travaillez.')
        + "\n\nLa connexion se fait sans mot de passe : saisissez votre adresse, un code à six chiffres, valable cinq minutes, vous est envoyé.",
      faits: [['Votre adresse', valeurTexte(v.email)], ['Rôle', admin ? 'Administrateur' : 'Agent']],
      bouton: { libelle: 'Ouvrir le cockpit', url: valeurTexte(v.lien) || lienEspace() },
      note: "Si vous n'attendiez pas cet accès, ignorez ce message et prévenez-nous.",
    }),
  };
}

/* 2. Demande créée. Deux voix : l'accusé au client, l'alerte à l'équipe. */
function ticketCree(v) {
  const numero = valeurTexte(v.numero);
  const titre = valeurTexte(v.titre);
  const faits = [
    ['Demande', numero],
    ['Projet', valeurTexte(v.projetNom)],
    ['Type', libelle(TYPES, v.type)],
    ['Urgence', libelle(URGENCES, v.urgence)],
    ['Plateforme', libelle(PLATEFORMES, v.plateforme)],
    ['Version', valeurTexte(v.version)],
  ];
  const lien = valeurTexte(v.lien) || lienEspace();

  if (valeurTexte(v.cote) === 'equipe') {
    return {
      objet: objetAvecNumero(numero, `Nouvelle demande : ${titre || 'sans titre'}`),
      ...rendreGabarit({
        titre: titre || 'Nouvelle demande',
        intro: `${valeurTexte(v.auteurNom).trim() || 'Un client'} vient d'ouvrir une demande`
          + `${valeurTexte(v.projetNom).trim() ? ` sur ${valeurTexte(v.projetNom)}` : ''}.`,
        faits: faits.concat([['Ouvert par', valeurTexte(v.auteurNom)], ['Adresse', valeurTexte(v.auteurEmail)]]),
        citation: extrait(v.description, 900),
        bouton: { libelle: 'Traiter la demande', url: lien },
      }),
    };
  }

  /* Une demande ouverte par l'équipe pour le compte du client ne peut pas
     lui être accusée comme si c'était lui qui l'avait écrite : il lisait
     « Bonjour Équipe Capmedia, nous avons bien reçu votre demande ». */
  const parLEquipe = v.parLEquipe === true || valeurTexte(v.parLEquipe) === 'true';
  /* « par » est le destinataire de CETTE lettre (une par personne, voir
     communication.ecrireAuxClients, parDestinataire) ; « clientNom » reste
     le nom de l'auteur, pour les envois d'avant. */
  const salue = valeurTexte(v.par).trim() || valeurTexte(v.clientNom).trim();
  const bonjour = `Bonjour${salue ? ` ${salue}` : ''},\n\n`;

  if (parLEquipe) {
    return {
      objet: objetAvecNumero(numero, 'Une demande a été ouverte pour vous'),
      ...rendreGabarit({
        titre: 'Une demande a été ouverte pour vous',
        intro: `${bonjour}Nous avons ouvert une demande${numero ? ` ${numero}` : ''}`
          + `${titre ? `, « ${titre} »` : ''} à la suite de nos échanges. Vous la suivez depuis votre espace, et vous pouvez y répondre.`,
        faits,
        citation: extrait(v.description, 600),
        bouton: { libelle: 'Suivre la demande', url: lien },
        note: "Si nous avons mal compris votre besoin, dites-le dans la demande : nous corrigeons.",
      }),
    };
  }

  return {
    objet: objetAvecNumero(numero, 'Votre demande est enregistrée'),
    ...rendreGabarit({
      titre: 'Votre demande est enregistrée',
      intro: `${bonjour}Nous avons bien reçu votre demande${numero ? ` ${numero}` : ''}`
        + `${titre ? `, « ${titre} »` : ''}. Elle est en file, nous revenons vers vous dès sa prise en charge.`,
      faits,
      citation: extrait(v.description, 600),
      bouton: { libelle: 'Suivre la demande', url: lien },
      note: "Tout se passe désormais dans votre espace : ajoutez une précision ou une capture d'écran depuis la demande.",
    }),
  };
}

/* 3. Changement de statut. */
function statut(v) {
  const numero = valeurTexte(v.numero);
  const apres = valeurTexte(v.statutApres);
  /* Un statut hors nomenclature ne doit pas produire une phrase tronquée. */
  const phrase = PHRASES_STATUT[apres]
    || (apres ? `est passé au statut ${libelle(STATUTS, apres, apres)}` : "a changé d'état");
  const pourEquipe = valeurTexte(v.cote) === 'equipe';

  return {
    objet: objetAvecNumero(numero, pourEquipe
      ? `Statut modifié : ${libelle(STATUTS, apres, apres) || 'inconnu'}`
      : `Votre demande ${phrase}`),
    ...rendreGabarit({
      titre: pourEquipe ? 'Statut modifié par le client' : `Votre demande ${phrase}`,
      intro: pourEquipe
        ? `La demande ${numero || 'concernée'}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''} a changé de statut depuis l'espace client.`
        : `La demande${numero ? ` ${numero}` : ''}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''} vient de changer d'état.`
          + (apres === 'en-attente-client' ? '\n\nNous avons besoin d\'une précision de votre part pour avancer.' : '')
          + (apres === 'a-valider' ? '\n\nLa correction est livrée. Vérifiez de votre côté, puis validez depuis la demande.' : ''),
      faits: [
        ['Demande', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Avant', libelle(STATUTS, v.statutAvant)],
        ['Maintenant', libelle(STATUTS, apres, apres)],
        ['Projet', valeurTexte(v.projetNom)],
      ],
      bouton: { libelle: 'Voir la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 4. Assignation, adressée à l'assigné. */
function assignation(v) {
  const numero = valeurTexte(v.numero);
  return {
    objet: objetAvecNumero(numero, `Demande assignée : ${valeurTexte(v.titre) || 'sans titre'}`),
    ...rendreGabarit({
      titre: 'Une demande vous est assignée',
      intro: `${valeurTexte(v.assigneNom).trim() ? `${valeurTexte(v.assigneNom)}, cette` : 'Cette'} demande est désormais sous votre responsabilité.`,
      faits: [
        ['Demande', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Type', libelle(TYPES, v.type)],
        ['Urgence', libelle(URGENCES, v.urgence)],
        ['Statut', libelle(STATUTS, v.statut)],
      ],
      bouton: { libelle: 'Traiter la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 5. Nouveau message sur une demande, vers l'autre partie. */
function message(v) {
  const numero = valeurTexte(v.numero);
  const auteur = valeurTexte(v.auteurNom).trim();
  const versEquipe = valeurTexte(v.cote) === 'equipe';

  return {
    objet: objetAvecNumero(numero, versEquipe
      ? `Réponse du client${auteur ? ` (${auteur})` : ''}`
      : 'Nouveau message sur votre demande'),
    ...rendreGabarit({
      titre: versEquipe ? 'Le client a répondu' : 'Nouveau message sur votre demande',
      intro: `${auteur || (versEquipe ? 'Le client' : "L'équipe")} a écrit sur la demande`
        + `${numero ? ` ${numero}` : ''}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''}.`,
      faits: [
        ['Demande', numero],
        ['Projet', valeurTexte(v.projetNom)],
        ['Statut', libelle(STATUTS, v.statut)],
      ],
      citation: extrait(v.texte, 1200),
      bouton: { libelle: 'Répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: "Répondez depuis l'espace de suivi : un e-mail de retour ne serait pas rattaché à la demande.",
    }),
  };
}

/* 6. Demande terminée. */
function resolu(v) {
  const numero = valeurTexte(v.numero);
  return {
    objet: objetAvecNumero(numero, 'Votre demande est terminée'),
    ...rendreGabarit({
      titre: 'Votre demande est terminée',
      intro: `La demande${numero ? ` ${numero}` : ''}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''} est marquée comme terminée.\n\n`
        + 'Si le problème revient, vous pouvez la rouvrir depuis votre espace pendant sept jours. Passé ce délai, ouvrez une nouvelle demande depuis sa fiche : elle gardera le lien avec celle-ci.',
      faits: [
        ['Demande', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Résolu le', dateFr(v.date)],
      ],
      bouton: { libelle: 'Voir la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 7. Demande fermée. */
function ferme(v) {
  const numero = valeurTexte(v.numero);
  return {
    objet: objetAvecNumero(numero, 'Votre demande est fermée'),
    ...rendreGabarit({
      titre: 'Votre demande est fermée',
      intro: `La demande${numero ? ` ${numero}` : ''}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''} est close. `
        + 'Il reste consultable dans votre espace, avec tout son historique.\n\n'
        + 'Une demande fermée ne se rouvre pas. Si le sujet revient, ouvrez une nouvelle demande : nous y retrouverons le contexte.',
      faits: [
        ['Demande', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Fermé le', dateFr(v.date)],
      ],
      bouton: { libelle: 'Consulter la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 8. Devis déposé, vers le client. */
function devis(v) {
  const numero = valeurTexte(v.numero);
  return {
    objet: objetAvecNumero(numero, `Votre devis : ${valeurTexte(v.libelle) || 'prestation'}`),
    ...rendreGabarit({
      titre: 'Votre devis est disponible',
      intro: `Bonjour${valeurTexte(v.clientNom).trim() ? ` ${valeurTexte(v.clientNom)}` : ''},\n\n`
        + `Le devis${numero ? ` ${numero}` : ''} est déposé dans votre espace, dans « Devis et factures ». Vous pouvez le télécharger, puis l'accepter ou le refuser depuis sa fiche.`,
      faits: [
        ['Devis', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant', montantTTC(v.ttc, v.montant)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Valable jusqu\'au', dateFr(v.echeance)],
      ],
      bouton: { libelle: 'Voir le devis', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Votre réponse est horodatée dans votre espace : elle vaut accord ou refus, sans autre formalité.',
    }),
  };
}

/* 9. Réponse du client à un devis, vers l'équipe. */
function devisReponse(v) {
  const numero = valeurTexte(v.numero);
  const accepte = valeurTexte(v.reponse) === 'accepte';
  const verdict = accepte ? 'accepté' : 'refusé';
  return {
    objet: objetAvecNumero(numero, `Devis ${verdict}${valeurTexte(v.projetNom) ? ` · ${valeurTexte(v.projetNom)}` : ''}`),
    ...rendreGabarit({
      titre: `Devis ${verdict}`,
      intro: `${valeurTexte(v.clientNom).trim() || 'Le client'} a ${verdict} le devis${numero ? ` ${numero}` : ''}`
        + `${valeurTexte(v.projetNom) ? ` du projet ${valeurTexte(v.projetNom)}` : ''}.`,
      faits: [
        ['Devis', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant HT', montantHT(v.montant)],
        ['Montant TTC', montantTTC(v.ttc, v.montant)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Réponse', accepte ? 'Accepté' : 'Refusé'],
        ['Répondu le', dateFr(v.date)],
        /* Le motif d'un refus, ou le mot laissé avec l'acceptation. */
        valeurTexte(v.commentaire).trim() ? [accepte ? 'Un mot du client' : 'Motif', valeurTexte(v.commentaire)] : ['', ''],
      ],
      bouton: { libelle: 'Ouvrir dans le Cockpit', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 10. Facture déposée, vers le client. */
function facture(v) {
  const numero = valeurTexte(v.numero);
  const echeance = dateFr(v.echeance);
  return {
    objet: objetAvecNumero(numero, `Votre facture : ${valeurTexte(v.libelle) || 'prestation'}`),
    ...rendreGabarit({
      titre: 'Votre facture est disponible',
      intro: `Bonjour${valeurTexte(v.clientNom).trim() ? ` ${valeurTexte(v.clientNom)}` : ''},\n\n`
        + `La facture${numero ? ` ${numero}` : ''} est déposée dans votre espace${v.avecPdf ? ', avec son fichier PDF' : ''}.`
        + (echeance ? ` Son règlement est attendu au plus tard le ${echeance}.` : ''),
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant', montantTTC(v.ttc, v.montant)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Échéance', echeance],
      ],
      bouton: { libelle: 'Voir la facture', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Une question sur cette facture : ouvrez une demande depuis votre espace, nous regardons.',
    }),
  };
}

/* 10 bis. L'échéance approche : trois jours avant, une fois. */
function factureEcheance(v) {
  const numero = valeurTexte(v.numero);
  const echeance = dateFr(v.echeance);
  return {
    objet: objetAvecNumero(numero, `Facture à régler avant le ${echeance}`),
    ...rendreGabarit({
      titre: `Facture à régler avant le ${echeance}`,
      intro: `Bonjour${valeurTexte(v.clientNom).trim() ? ` ${valeurTexte(v.clientNom)}` : ''},\n\n`
        + `La facture${numero ? ` ${numero}` : ''} arrive à échéance le ${echeance}. Si le règlement est déjà parti, merci de le déclarer depuis la fiche de la facture : nous le confirmons dès réception.`,
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Reste à payer', montantTTC(v.reste, v.reste)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Échéance', echeance],
      ],
      bouton: { libelle: 'Voir la facture', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Les coordonnées de règlement sont sur la fiche de la facture, dans votre espace.',
    }),
  };
}

/* 10 ter. L'échéance est passée : la facture est en retard, une fois. */
function factureRetard(v) {
  const numero = valeurTexte(v.numero);
  const echeance = dateFr(v.echeance);
  return {
    objet: objetAvecNumero(numero, 'Facture en retard'),
    ...rendreGabarit({
      titre: 'Une facture a dépassé son échéance',
      intro: `Bonjour${valeurTexte(v.clientNom).trim() ? ` ${valeurTexte(v.clientNom)}` : ''},\n\n`
        + `La facture${numero ? ` ${numero}` : ''} était à régler${echeance ? ` avant le ${echeance}` : ''} et nous n'avons pas reçu son règlement. Si le virement est parti, déclarez-le depuis la fiche de la facture ; sinon, merci de le faire au plus tôt. Un souci ? Ouvrez une demande, on en parle.`,
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Reste à payer', montantTTC(v.reste, v.reste)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Échéance dépassée', echeance],
      ],
      bouton: { libelle: 'Voir la facture', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 10 quater. Le client déclare avoir réglé, vers l'équipe. */
function reglementDeclare(v) {
  const numero = valeurTexte(v.numero);
  return {
    objet: objetAvecNumero(numero, `Règlement déclaré${valeurTexte(v.projetNom) ? ` · ${valeurTexte(v.projetNom)}` : ''}`),
    ...rendreGabarit({
      titre: 'Un règlement déclaré par le client',
      intro: `${valeurTexte(v.par).trim() || 'Le client'} déclare avoir réglé la facture${numero ? ` ${numero}` : ''}${valeurTexte(v.projetNom) ? ` du projet ${valeurTexte(v.projetNom)}` : ''}. Dès réception, enregistrez le paiement dans le Cockpit : la déclaration passe alors en « Confirmé » chez lui.`,
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant déclaré', montantTTC(v.montant, v.montant)],
        ['Réglé le', dateFr(v.date)],
        ['Moyen', valeurTexte(v.moyen)],
        ['Référence', valeurTexte(v.reference)],
        ['Reste à payer avant ce règlement', montantTTC(v.reste, v.reste)],
      ],
      bouton: { libelle: 'Ouvrir dans le Cockpit', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* ==========================================================================
   5. Le point d'entrée unique

   Le facteur ne connaît que le nom du modèle, tel qu'il a été écrit dans
   le document d'envoi. Un nom inconnu lève : c'est une erreur de code, et
   elle doit se voir dans les journaux plutôt que partir chez un client.
   ========================================================================== */


/* ==========================================================================
   5. Les modeles du hub : taches, versions, fichiers, reunions, validations,
   conversation, qualification, nouveaux projets
   ========================================================================== */

const QUALIFS = { 'incluse': 'incluse au contrat', 'hors-perimetre': 'hors du périmètre prévu', 'a-chiffrer': 'à chiffrer', 'offerte': 'offerte' };
const CHANGEMENTS = { nouveau: 'Nouveau', amelioration: 'Amélioration', correction: 'Correction', technique: 'Technique' };

function tacheAttente(v) {
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: `${projet ? `${projet} · ` : ''}Nous attendons votre retour : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: 'Nous attendons votre retour',
      intro: `Bonjour,\n\nPour avancer sur ${projet || 'votre projet'}, nous avons besoin de vous sur le point suivant.`,
      faits: [['Tâche', valeurTexte(v.titre)], ['Détail', valeurTexte(v.description)]],
      bouton: { libelle: 'Voir et répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Répondez directement depuis la fiche de la tâche, avec un fichier si besoin : la tâche revient chez nous aussitôt.',
    }),
  };
}

/* La réponse du client sur une tâche, vers l'équipe. */
function tacheReponse(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const par = valeurTexte(v.par).trim();
  return {
    objet: `${projet ? `${projet} · ` : ''}Réponse du client sur une tâche : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: 'Le client a répondu sur une tâche',
      intro: `${par || 'Le client'} a répondu sur la tâche « ${valeurTexte(v.titre)} »${projet ? ` (${projet})` : ''}. Elle est passée « Réponse reçue » : à vous de la reprendre.`,
      faits: [['Tâche', valeurTexte(v.titre)], ['Pièces jointes', Number(v.pieces) > 0 ? String(v.pieces) : '']],
      citation: valeurTexte(v.texte),
      bouton: { libelle: 'Ouvrir la tâche', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* Un point bloquant de son côté : ce qu'on attend de lui, pour quand, et
   la fiche où dire « C'est fait ». Avant, seule une notification partait,
   sans consigne. */
function blocageClient(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const prenom = valeurTexte(v.par).trim();
  return {
    objet: `${projet ? `${projet} · ` : ''}Un point bloque de votre côté : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: 'Un point bloque de votre côté',
      intro: `${prenom ? `Bonjour ${prenom},` : 'Bonjour,'}\n\nPour avancer sur ${projet || 'votre projet'}, un point dépend de vous. Voici ce que nous attendons, et pour quand.`,
      faits: [
        ['Point bloquant', valeurTexte(v.titre)],
        ['Ce qu\'on attend de vous', valeurTexte(v.attendu)],
        ['Attendu pour le', dateFr(v.echeance)],
        ['Détail', valeurTexte(v.description)],
      ],
      bouton: { libelle: 'Voir le point bloquant', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Depuis la fiche, dites-nous « C\'est fait » quand c\'est réglé, ou répondez-nous si quelque chose vous bloque.',
    }),
  };
}

function release(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const notes = Array.isArray(v.notes) ? v.notes : [];
  return {
    objet: `${projet ? `${projet} · ` : ''}Version ${valeurTexte(v.version)} disponible`,
    ...rendreGabarit({
      titre: `Version ${valeurTexte(v.version)} disponible`,
      intro: `Bonjour,\n\nUne nouvelle version${projet ? ` de ${projet}` : ''} est en ligne${v.titre ? ` : ${valeurTexte(v.titre)}` : ''}.`,
      faits: notes.slice(0, 12).map((n) => [CHANGEMENTS[n.type] || 'Changement', valeurTexte(n.texte)]),
      bouton: { libelle: v.lienStore ? 'Ouvrir dans le store' : 'Voir les changements', url: valeurTexte(v.lienStore) || valeurTexte(v.lien) || lienEspace() },
      note: v.lienStore ? `Le détail des changements est dans votre espace : ${valeurTexte(v.lien)}` : '',
    }),
  };
}

function fichier(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const versEquipe = v.cote === 'equipe';
  return {
    objet: versEquipe ? `${projet} · Fichier reçu de ${valeurTexte(v.par)}` : `${projet ? `${projet} · ` : ''}Nouveau fichier disponible`,
    ...rendreGabarit({
      titre: versEquipe ? 'Un client a déposé un fichier' : 'Un nouveau fichier vous attend',
      intro: versEquipe ? `${valeurTexte(v.par)} a déposé un fichier sur ${projet}.` : `Bonjour,\n\nUn fichier vient d'être ajoute a votre espace${projet ? ` ${projet}` : ''}.`,
      faits: [['Fichier', valeurTexte(v.nom)], ['Catégorie', valeurTexte(v.categorie)]],
      bouton: { libelle: 'Ouvrir les fichiers', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

function reunion(v) {
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: `${projet ? `${projet} · ` : ''}${v.deplacee ? 'Réunion déplacée' : 'Réunion programmée'} : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: v.deplacee ? 'Réunion déplacée' : 'Réunion programmée',
      intro: `Bonjour,\n\n${v.deplacee ? 'La réunion suivante change de date.' : 'Une réunion est programmée.'}`,
      faits: [['Objet', valeurTexte(v.titre)], ['Quand', valeurTexte(v.date)], ['Durée', v.duree ? `${valeurTexte(v.duree)} min` : ''], ['Lieu', valeurTexte(v.lieu)], ['Visio', valeurTexte(v.lienVisio)], ['Ordre du jour', valeurTexte(v.ordreDuJour)]],
      bouton: { libelle: v.lienVisio ? 'Rejoindre la réunion' : 'Voir la réunion', url: valeurTexte(v.lienVisio) || valeurTexte(v.lien) || lienEspace() },
      note: `Le fichier d'agenda est disponible dans votre espace : ${valeurTexte(v.lien)}`,
    }),
  };
}

/* La veille d'une réunion, à 17 h : un rappel, une seule fois. Il redit
   l'heure, le lieu ou la visio, l'ordre du jour, et mène à la fiche, d'où
   le fichier d'agenda se prend en un clic. */
function reunionRappel(v) {
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: `${projet ? `${projet} · ` : ''}Demain : ${valeurTexte(v.titre)}${v.heure ? ` à ${valeurTexte(v.heure)}` : ''}`,
    ...rendreGabarit({
      titre: 'Votre réunion, c\'est demain',
      intro: `Bonjour,\n\nUn rappel pour la réunion de demain${projet ? ` sur ${projet}` : ''}.`,
      faits: [['Objet', valeurTexte(v.titre)], ['Quand', valeurTexte(v.date)], ['Durée', v.duree ? `${valeurTexte(v.duree)} min` : ''], ['Lieu', valeurTexte(v.lieu)], ['Visio', valeurTexte(v.lienVisio)], ['Ordre du jour', valeurTexte(v.ordreDuJour)]],
      bouton: { libelle: v.lienVisio ? 'Rejoindre la réunion' : 'Voir la réunion', url: valeurTexte(v.lienVisio) || valeurTexte(v.lien) || lienEspace() },
      note: `La fiche de la réunion, avec le fichier d'agenda : ${valeurTexte(v.lien)}`,
    }),
  };
}

function validationDemandee(v) {
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: `${projet ? `${projet} · ` : ''}Votre validation est attendue : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: 'Votre validation est attendue',
      intro: `Bonjour,\n\nNous avons besoin de votre accord pour continuer.`,
      faits: [['A valider', valeurTexte(v.titre)], ['Ce qu\'il faut regarder', valeurTexte(v.description)]],
      bouton: { libelle: 'Examiner et répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Vous pouvez approuver, ou demander des modifications en un commentaire.',
    }),
  };
}

function validationReponse(v) {
  const approuvee = v.statut === 'approuvee';
  return {
    objet: `${valeurTexte(v.projetNom)} · ${approuvee ? 'Validation approuvee' : 'Modifications demandees'} : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: approuvee ? 'Validation approuvee' : 'Modifications demandees',
      intro: `${valeurTexte(v.par) || 'Le client'} a repondu sur « ${valeurTexte(v.titre)} ».`,
      faits: [['Réponse', approuvee ? 'Approuvee' : 'Modifications demandees'], ['Commentaire', valeurTexte(v.commentaire)]],
      bouton: { libelle: 'Ouvrir dans le cockpit', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

function messageProjet(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const versEquipe = v.cote === 'equipe';
  const texte = valeurTexte(v.texte);
  return {
    objet: `${projet ? `${projet} · ` : ''}Message de ${valeurTexte(v.auteur)}`,
    ...rendreGabarit({
      titre: `${valeurTexte(v.auteur)} vous écrit`,
      intro: texte.length > 1200 ? `${texte.slice(0, 1200)}…` : texte,
      faits: v.pieces ? [['Pièces jointes', String(v.pieces)]] : [],
      bouton: { libelle: 'Répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: versEquipe ? '' : 'Répondez depuis votre espace : la conversation y reste au complet.',
    }),
  };
}

function qualification(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const q = QUALIFS[v.qualification] || valeurTexte(v.qualification);
  return {
    objet: `${projet ? `${projet} · ` : ''}${valeurTexte(v.numero)} : demande ${q}`,
    ...rendreGabarit({
      titre: v.qualification === 'a-chiffrer' ? 'Un devis va vous être proposé' : 'Cette demande sort du périmètre prévu',
      intro: `Bonjour,\n\nNous avons étudié votre demande « ${valeurTexte(v.titre)} ». Elle est ${q}. ${v.qualification === 'a-chiffrer' ? 'Nous vous proposons un devis avant tout développement.' : 'Nous revenons vers vous pour en discuter ou vous proposer un chiffrage.'}`,
      faits: [['Demande', valeurTexte(v.numero)], ['Titre', valeurTexte(v.titre)]],
      bouton: { libelle: 'Voir la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

function preprojet(v) {
  const versEquipe = v.cote === 'equipe';
  return {
    objet: versEquipe ? `Nouveau projet demandé : ${valeurTexte(v.titre)}` : `Bien reçu : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: versEquipe ? 'Un client décrit un nouveau projet' : 'Votre demande est bien reçue',
      intro: versEquipe ? `${valeurTexte(v.par)} (${valeurTexte(v.email)}) vient de décrire un projet.` : `Bonjour ${valeurTexte(v.par)},\n\nMerci pour votre demande. Nous la lisons, puis nous en discutons ensemble dans votre espace.`,
      faits: versEquipe ? [['Titre', valeurTexte(v.titre)], ['Type', valeurTexte(v.type)], ['Budget', valeurTexte(v.budget)], ['Délai', valeurTexte(v.delai)], ['Idée', valeurTexte(v.idee).slice(0, 600)]] : [['Projet', valeurTexte(v.titre)]],
      bouton: { libelle: versEquipe ? 'Ouvrir la demande' : 'Suivre ma demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/*
 * La maintenance continue. Vers l'équipe : le client demande un forfait,
 * ou propose une évolution. Vers le client : l'état de son forfait change.
 */
function maintenance(v) {
  const projet = valeurTexte(v.projet);
  if (v.cote === 'equipe') {
    const evolution = v.evenement === 'evolution';
    return {
      objet: evolution ? `${projet} : une évolution proposée` : `${projet} : forfait de maintenance demandé`,
      ...rendreGabarit({
        titre: evolution ? 'Le client propose une évolution' : 'Le client demande un forfait de maintenance',
        intro: `${valeurTexte(v.par)} (${valeurTexte(v.email)}) vient d'écrire depuis son espace.`,
        faits: [['Projet', projet], evolution ? ['Évolution', valeurTexte(v.titre)] : ['Rythme souhaité', valeurTexte(v.rythme)]],
        citation: valeurTexte(v.message),
        bouton: { libelle: 'Ouvrir la maintenance', url: valeurTexte(v.lien) || lienEspace() },
      }),
    };
  }
  const TITRES = {
    proposition: 'Une proposition de maintenance vous attend',
    actif: 'Votre forfait de maintenance est en cours',
    suspendu: 'Votre forfait de maintenance est suspendu',
    termine: 'Votre forfait de maintenance est terminé',
  };
  const INTROS = {
    proposition: "Nous avons posé les modalités d'un forfait de maintenance continue pour votre projet : ce qui est compris, le rythme, les délais. Tout se lit dans votre espace, et le devis vous y attend. Rien ne s'engage avant que vous l'ayez accepté.",
    actif: 'Le forfait tourne. Chaque jour travaillé et chaque évolution livrée apparaissent dans votre espace, au fur et à mesure.',
    suspendu: "Le forfait est mis en pause. Rien n'est perdu : les séquences et les évolutions restent dans votre espace, et il reprend quand vous le souhaitez : le bouton « Reprendre le forfait » est sur votre page Maintenance.",
    termine: 'Le forfait est arrivé à son terme. Son histoire reste consultable dans votre espace, et vous pouvez le reprendre quand vous le souhaitez.',
  };
  const PERIODES = { mensuelle: 'mois', trimestrielle: 'trimestre', annuelle: 'an' };
  const periode = PERIODES[valeurTexte(v.periode)] || 'mois';
  const evenement = valeurTexte(v.evenement);
  return {
    objet: `${projet} : ${(TITRES[evenement] || 'votre forfait de maintenance').replace(/^Votre/, 'votre').replace(/^Une/, 'une')}`,
    ...rendreGabarit({
      titre: TITRES[evenement] || 'Votre forfait de maintenance',
      intro: INTROS[evenement] || 'Votre forfait de maintenance a changé. Tout se lit dans votre espace.',
      faits: [
        ['Projet', projet],
        ['Formule', valeurTexte(v.formule)],
        Number(v.montant) ? ['Montant', `${montantHT(v.montant)} par ${periode}`] : ['', ''],
        Number(v.jours) ? ['Jours de travail', `${valeurTexte(v.jours)} par ${periode}`] : ['', ''],
      ],
      bouton: { libelle: 'Voir la maintenance', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/*
 * Une évolution de maintenance change de sort : acceptée, planifiée, livrée,
 * écartée. Le client l'apprenait par une notification dans le Hub, jamais
 * par une lettre. Préférence « Vie du projet ».
 */
function evolutionStatut(v) {
  const projet = valeurTexte(v.projet).trim();
  const TITRES = {
    acceptee: 'Votre évolution est acceptée',
    planifiee: 'Votre évolution est planifiée',
    livree: 'Votre évolution est livrée',
    refusee: 'Votre évolution est écartée',
    proposee: 'Votre évolution est remise à l\'étude',
  };
  const INTROS = {
    acceptee: 'Nous la ferons. Reste à dire dans quelle séquence : vous le lirez sur votre page Maintenance.',
    planifiee: 'Elle a sa séquence. Chaque jour travaillé dessus apparaîtra dans votre espace.',
    livree: 'Elle est dans l\'application. Si quelque chose ne va pas, ouvrez une demande depuis votre espace.',
    refusee: 'Nous ne la ferons pas, et nous vous disons pourquoi ci-dessous.',
    proposee: 'Elle revient à l\'étude. Rien n\'est décidé pour l\'instant.',
  };
  const statut = valeurTexte(v.statut);
  return {
    objet: `${projet ? `${projet} · ` : ''}${(TITRES[statut] || 'Votre évolution a changé').replace(/^Votre/, 'votre')}`,
    ...rendreGabarit({
      titre: TITRES[statut] || 'Votre évolution a changé',
      intro: INTROS[statut] || 'Son sort a changé. Tout se lit dans votre espace.',
      faits: [['Projet', projet], ['Évolution', valeurTexte(v.titre)], v.sequence ? ['Séquence', valeurTexte(v.sequence)] : ['', ''], v.version ? ['Version', valeurTexte(v.version)] : ['', '']],
      citation: valeurTexte(v.reponse),
      bouton: { libelle: 'Voir la maintenance', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/*
 * La relance hebdomadaire. Rien dans l'espace n'allait chercher le client :
 * tout attendait qu'il vienne. S'il n'ouvre pas le hub pendant trois
 * semaines, personne ne lui dit que six choses l'attendent. Cette lettre
 * ne part que s'il y a vraiment quelque chose, et elle liste quoi.
 */
function relance(v) {
  const lignes = Array.isArray(v.points) ? v.points : [];
  const n = lignes.length;
  return {
    objet: n > 1
      ? `${valeurTexte(v.projet)} : ${n} points attendent votre réponse`
      : `${valeurTexte(v.projet)} : un point attend votre réponse`,
    ...rendreGabarit({
      titre: n > 1 ? `${n} points attendent votre réponse` : 'Un point attend votre réponse',
      intro: `Bonjour ${valeurTexte(v.par)},\n\nRien d'urgent de notre cote, mais ces points sont bloques tant qu'ils n'ont pas votre retour. Tout se traite depuis votre espace, en quelques minutes.`,
      faits: lignes.slice(0, 8).map((l) => [valeurTexte(l.quoi), valeurTexte(l.detail)]),
      bouton: { libelle: 'Voir ce qui vous attend', url: valeurTexte(v.lien) || lienEspace() },
      note: "Vous recevez cette lettre une fois par semaine au maximum, et seulement s'il y a quelque chose. Elle s'arrete des que la liste est vide.",
    }),
  };
}

/*
 * Le code de connexion. Rien d'autre dans la lettre : pas de lien à
 * cliquer, donc rien à détourner. Le code se lit, se recopie, et meurt.
 */
function code(v) {
  const chiffres = valeurTexte(v.code);
  const minutes = Number(v.minutes) || 10;
  return {
    objet: `${chiffres} est votre code de connexion`,
    ...rendreGabarit({
      titre: 'Votre code de connexion',
      intro: `Saisissez ce code dans la page de connexion, sur l'appareil ou vous venez de le demander.\n\n`
        + `Il est valable ${minutes} minutes et ne sert qu'une fois.`,
      faits: [['Code', chiffres.split('').join(' ')]],
      note: "Si vous n'avez rien demande, ignorez ce message : sans ce code, personne n'entre. Ne le transmettez a personne, nous ne vous le demanderons jamais.",
    }),
  };
}

/* L'alerte d'ouverture d'une session d'equipe : le cockpit voit tous les
   projets, une ouverture qu'on n'a pas faite doit se remarquer. */
function connexionEquipe(v) {
  return {
    objet: "Une session du cockpit vient de s'ouvrir",
    ...rendreGabarit({
      titre: 'Session du cockpit ouverte',
      intro: "Une session d'équipe vient d'être ouverte avec votre adresse. Si c'est vous, il n'y a rien à faire.",
      faits: [['Quand', valeurTexte(v.quand)], ['Depuis', valeurTexte(v.ip)]],
      note: "Si ce n'est pas vous, changez l'accès à votre boîte immédiatement : c'est elle qui ouvre le cockpit.",
    }),
  };
}

/* La fin de test d'un testeur : son bilan à l'équipe, tout compté. La
   lettre nomme le testeur, parce qu'elle ne va qu'à l'équipe. Les échecs
   sont repris en citation, un par ligne, pour être relus d'un coup. */
function testeurTermine(v) {
  const echecs = (Array.isArray(v.echecs) ? v.echecs : []).map(valeurTexte).filter(Boolean);
  const qui = valeurTexte(v.testeur) || 'Un testeur';
  return {
    objet: `${qui} a terminé le test : ${valeurTexte(v.campagne)}`,
    ...rendreGabarit({
      titre: 'Un testeur a terminé',
      intro: `${qui} vient de dire « j'ai terminé » sur ${valeurTexte(v.campagne) || 'la campagne'}${v.projetNom ? ` (${valeurTexte(v.projetNom)})` : ''}. Ses résultats sont figés ; il garde sept jours pour ajouter une remarque.`,
      faits: [
        ['Testeur', `${qui}${v.email ? ` · ${valeurTexte(v.email)}` : ''}`],
        ['Réussis', valeurTexte(v.ok)],
        ['Échecs', valeurTexte(v.ko)],
        ['Sans objet', valeurTexte(v.na)],
        ['Scénarios déroulés', valeurTexte(v.total)],
        ['Temps donné', valeurTexte(v.temps)],
        ['Avis sur l\'application', valeurTexte(v.avisDonne)],
        ['Note du test', valeurTexte(v.noteTest)],
        ['Accès jusqu\'au', valeurTexte(v.finAcces)],
      ],
      citation: [v.noteTestCommentaire ? `Sur le test : ${valeurTexte(v.noteTestCommentaire)}` : '', ...echecs].filter(Boolean).join('\n'),
      bouton: { libelle: 'Ouvrir la campagne dans le Cockpit', url: valeurTexte(v.lien) },
      note: 'Le client lit qu\'un testeur a terminé, sans son nom. Ses réponses et ses échecs sont dans la campagne.',
    }),
  };
}

/* Une remarque ajoutée après la fin du test, reprise telle quelle. */
function testeurRemarque(v) {
  const remarques = (Array.isArray(v.remarques) ? v.remarques : []).map(valeurTexte).filter(Boolean);
  const qui = valeurTexte(v.testeur) || 'Un testeur';
  return {
    objet: `Remarque de ${qui} après son test : ${valeurTexte(v.campagne)}`,
    ...rendreGabarit({
      titre: 'Une remarque après le test',
      intro: `${qui} a ajouté ce qui suit sur ${valeurTexte(v.campagne) || 'la campagne'}${v.projetNom ? ` (${valeurTexte(v.projetNom)})` : ''}, après avoir terminé.`,
      faits: [['Testeur', `${qui}${v.email ? ` · ${valeurTexte(v.email)}` : ''}`]],
      citation: remarques.join('\n\n'),
      bouton: { libelle: 'Ouvrir la campagne dans le Cockpit', url: valeurTexte(v.lien) },
    }),
  };
}

/* Un message d'un testeur à l'équipe, repris tel quel. */
function messageTesteur(v) {
  const qui = valeurTexte(v.testeur) || 'Un testeur';
  return {
    objet: `${qui} (testeur) vous écrit`,
    ...rendreGabarit({
      titre: 'Un testeur vous écrit',
      intro: `${qui}${v.email ? ` (${valeurTexte(v.email)})` : ''} a laissé ce message depuis son espace de test.`,
      citation: valeurTexte(v.texte),
      bouton: { libelle: 'Répondre dans le Cockpit', url: valeurTexte(v.lien) },
      note: 'Votre réponse lui arrive dans sa bulle, en direct, et par e-mail.',
    }),
  };
}

/* La réponse de l'équipe au testeur. */
function messageTesteurReponse(v) {
  const prenom = valeurTexte(v.prenom).trim();
  return {
    objet: `${valeurTexte(v.auteur) || 'Capmedia'} vous a répondu`,
    ...rendreGabarit({
      titre: 'Une réponse de Capmedia',
      intro: `${prenom ? `Bonjour ${prenom},` : 'Bonjour,'}\n\n${valeurTexte(v.auteur) || 'Capmedia'} vous a répondu dans votre espace de test.`,
      citation: valeurTexte(v.texte),
      bouton: { libelle: 'Ouvrir la conversation', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Vous pouvez répondre depuis la bulle en bas à droite de votre espace.',
    }),
  };
}

/* Les tests avant la sortie, vus du client : une anomalie trouvée par les
   testeurs ou corrigée, une campagne ouverte ou close. Le client ne voit
   jamais le nom d'un testeur, seulement le scénario et la gravité. */
const GRAVITES_ANOMALIE = { bloquant: 'Bloquante', critique: 'Critique', important: 'Importante', mineur: 'Mineure' };

function anomalie(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const corrigee = v.evenement === 'corrigee';
  const gravite = GRAVITES_ANOMALIE[valeurTexte(v.gravite)] || valeurTexte(v.gravite);
  return {
    objet: `${projet ? `${projet} · ` : ''}${corrigee ? 'Anomalie corrigée' : 'Une anomalie a été trouvée par les testeurs'} : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: corrigee ? 'Anomalie corrigée' : 'Une anomalie a été trouvée par les testeurs',
      intro: corrigee
        ? `Bonjour,\n\nL'anomalie « ${valeurTexte(v.titre)} » est corrigée. Les testeurs vont rejouer le scénario pour le confirmer.`
        : `Bonjour,\n\nEn testant ${projet || 'votre application'}, les testeurs ont constaté un défaut. Nous le reproduisons, puis nous le corrigeons.`,
      faits: [['Scénario', valeurTexte(v.scenario)], ['Gravité', gravite], ['Ce qu\'on sait', valeurTexte(v.description)]],
      bouton: { libelle: 'Voir l\'anomalie', url: valeurTexte(v.lien) || lienEspace() },
      note: corrigee ? '' : 'Vous pouvez en faire une demande depuis sa fiche, pour la suivre comme n\'importe quel signalement.',
    }),
  };
}

function campagne(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const close = v.evenement === 'close';
  return {
    objet: `${projet ? `${projet} · ` : ''}${close ? 'Campagne de tests close' : 'Campagne de tests ouverte'} : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: close ? 'Campagne de tests close' : 'Campagne de tests ouverte',
      intro: close
        ? `Bonjour,\n\nLa campagne « ${valeurTexte(v.titre)} » est terminée : ses résultats sont figés. Une validation « Bon pour sortie » vous attend dans votre espace : en l'approuvant, vous donnez votre accord pour la mise en ligne.`
        : `Bonjour,\n\nLa campagne « ${valeurTexte(v.titre)} » commence : les testeurs déroulent les scénarios, et vous suivez les résultats en direct dans votre espace.`,
      faits: [['Scénarios', valeurTexte(v.scenarios)], ['Testeurs', valeurTexte(v.testeurs)], ['Anomalies ouvertes', close ? valeurTexte(v.anomalies) : '']],
      bouton: { libelle: close ? 'Donner mon feu vert' : 'Suivre les tests', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

const MODELES = {
  'invitation': invitation,
  'anomalie': anomalie,
  'campagne': campagne,
  'testeur-termine': testeurTermine,
  'testeur-remarque': testeurRemarque,
  'message-testeur': messageTesteur,
  'message-testeur-reponse': messageTesteurReponse,
  'invitation-testeur': invitationTesteur,
  'invitation-equipe': invitationEquipe,
  'ouverture': ouverture,
  'ticket-cree': ticketCree,
  'statut': statut,
  'assignation': assignation,
  'message': message,
  'resolu': resolu,
  'ferme': ferme,
  'devis': devis,
  'devis-reponse': devisReponse,
  'facture': facture,
  'facture-echeance': factureEcheance,
  'facture-retard': factureRetard,
  'reglement-declare': reglementDeclare,
  'tache-attente': tacheAttente,
  'tache-reponse': tacheReponse,
  'blocage-client': blocageClient,
  'release': release,
  'fichier': fichier,
  'reunion': reunion,
  'reunion-rappel': reunionRappel,
  'validation-demandee': validationDemandee,
  'validation-reponse': validationReponse,
  'message-projet': messageProjet,
  'qualification': qualification,
  'preprojet': preprojet,
  'maintenance': maintenance,
  'evolution-statut': evolutionStatut,
  'relance': relance,
  'code': code,
  'connexion-equipe': connexionEquipe,
};

/**
 * @param {string} modele      une clé de MODELES
 * @param {object} variables   ce qui a été figé à la mise en file
 * @returns {{objet: string, html: string, texte: string}}
 */
function rendre(modele, variables) {
  const fabrique = MODELES[valeurTexte(modele)];
  if (!fabrique) throw new Error(`Modèle d'e-mail inconnu : ${valeurTexte(modele) || '(vide)'}`);
  return fabrique(variables && typeof variables === 'object' ? variables : {});
}

module.exports = {
  rendre,
  MODELES,
  echapper,
  valeurTexte,
  dateFr,
  montantHT,
  STATUTS,
  URGENCES,
  TYPES,
  PLATEFORMES,
  SITE,
  BASE,
  lienEspace,
  lienTicket,
  lienProjet,
};
