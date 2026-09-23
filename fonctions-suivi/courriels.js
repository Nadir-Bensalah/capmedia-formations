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

/* ==========================================================================
   2. Les libellés, alignés sur agence/suivi/assets/noyau.js
   ========================================================================== */

const STATUTS = {
  'nouveau': 'Nouveau',
  'en-cours': 'En cours',
  'en-attente-client': 'En attente de votre réponse',
  'a-valider': 'À valider',
  'resolu': 'Résolu',
  'ferme': 'Fermé',
  'refuse': 'Hors périmètre',
};

/** Le bout de phrase qui passe dans l'objet : « votre ticket ... ». */
const PHRASES_STATUT = {
  'nouveau': 'est revenu au statut nouveau',
  'en-cours': 'est passé en cours',
  'en-attente-client': 'attend votre réponse',
  'a-valider': 'attend votre validation',
  'resolu': 'est résolu',
  'ferme': 'est fermé',
  'refuse': 'est classé hors périmètre',
};

const URGENCES = {
  'bloquant': 'Bloquant',
  'critique': 'Critique',
  'important': 'Important',
  'mineur': 'Mineur',
};

const TYPES = {
  'bug': 'Anomalie',
  'demande': 'Demande',
  'question': 'Question',
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
        + "La connexion se fait sans mot de passe : saisissez votre adresse e-mail, un lien de connexion vous est envoyé, un clic ouvre la session.",
      faits: [
        ['Projet', projet],
        ['Votre adresse', valeurTexte(v.email)],
      ],
      bouton: { libelle: 'Ouvrir mon espace', url: valeurTexte(v.lien) || lienEspace() },
      note: "Utilisez bien l'adresse à laquelle vous avez reçu cet e-mail : c'est elle qui donne accès au projet.",
    }),
  };
}

/* 2. Ticket créé. Deux voix : l'accusé au client, l'alerte à l'équipe. */
function ticketCree(v) {
  const numero = valeurTexte(v.numero);
  const titre = valeurTexte(v.titre);
  const faits = [
    ['Ticket', numero],
    ['Projet', valeurTexte(v.projetNom)],
    ['Type', libelle(TYPES, v.type)],
    ['Urgence', libelle(URGENCES, v.urgence)],
    ['Plateforme', libelle(PLATEFORMES, v.plateforme)],
    ['Version', valeurTexte(v.version)],
  ];
  const lien = valeurTexte(v.lien) || lienEspace();

  if (valeurTexte(v.cote) === 'equipe') {
    return {
      objet: objetAvecNumero(numero, `Nouveau ticket : ${titre || 'sans titre'}`),
      ...rendreGabarit({
        titre: titre || 'Nouveau ticket',
        intro: `${valeurTexte(v.auteurNom).trim() || 'Un client'} vient d'ouvrir un ticket`
          + `${valeurTexte(v.projetNom).trim() ? ` sur ${valeurTexte(v.projetNom)}` : ''}.`,
        faits: faits.concat([['Ouvert par', valeurTexte(v.auteurNom)], ['Adresse', valeurTexte(v.auteurEmail)]]),
        citation: extrait(v.description, 900),
        bouton: { libelle: 'Traiter le ticket', url: lien },
      }),
    };
  }

  return {
    objet: objetAvecNumero(numero, 'Votre ticket est enregistré'),
    ...rendreGabarit({
      titre: 'Votre ticket est enregistré',
      intro: `Bonjour${valeurTexte(v.clientNom).trim() ? ` ${valeurTexte(v.clientNom)}` : ''},\n\n`
        + `Nous avons bien reçu votre ticket${numero ? ` ${numero}` : ''}`
        + `${titre ? `, « ${titre} »` : ''}. Il est en file, nous revenons vers vous dès sa prise en charge.`,
      faits,
      citation: extrait(v.description, 600),
      bouton: { libelle: 'Suivre le ticket', url: lien },
      note: "Tout se passe désormais dans votre espace : ajoutez une précision ou une capture d'écran depuis le ticket.",
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
      : `Votre ticket ${phrase}`),
    ...rendreGabarit({
      titre: pourEquipe ? 'Statut modifié par le client' : `Votre ticket ${phrase}`,
      intro: pourEquipe
        ? `Le ticket ${numero || 'concerné'}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''} a changé de statut depuis l'espace client.`
        : `Le ticket${numero ? ` ${numero}` : ''}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''} vient de changer d'état.`
          + (apres === 'en-attente-client' ? '\n\nNous avons besoin d\'une précision de votre part pour avancer.' : '')
          + (apres === 'a-valider' ? '\n\nLa correction est livrée. Vérifiez de votre côté, puis validez depuis le ticket.' : ''),
      faits: [
        ['Ticket', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Avant', libelle(STATUTS, v.statutAvant)],
        ['Maintenant', libelle(STATUTS, apres, apres)],
        ['Projet', valeurTexte(v.projetNom)],
      ],
      bouton: { libelle: 'Voir le ticket', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 4. Assignation, adressée à l'assigné. */
function assignation(v) {
  const numero = valeurTexte(v.numero);
  return {
    objet: objetAvecNumero(numero, `Ticket assigné : ${valeurTexte(v.titre) || 'sans titre'}`),
    ...rendreGabarit({
      titre: 'Un ticket vous est assigné',
      intro: `${valeurTexte(v.assigneNom).trim() ? `${valeurTexte(v.assigneNom)}, ce` : 'Ce'} ticket est désormais sous votre responsabilité.`,
      faits: [
        ['Ticket', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Type', libelle(TYPES, v.type)],
        ['Urgence', libelle(URGENCES, v.urgence)],
        ['Statut', libelle(STATUTS, v.statut)],
      ],
      bouton: { libelle: 'Traiter le ticket', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 5. Nouveau message sur un ticket, vers l'autre partie. */
function message(v) {
  const numero = valeurTexte(v.numero);
  const auteur = valeurTexte(v.auteurNom).trim();
  const versEquipe = valeurTexte(v.cote) === 'equipe';

  return {
    objet: objetAvecNumero(numero, versEquipe
      ? `Réponse du client${auteur ? ` (${auteur})` : ''}`
      : 'Nouveau message sur votre ticket'),
    ...rendreGabarit({
      titre: versEquipe ? 'Le client a répondu' : 'Nouveau message sur votre ticket',
      intro: `${auteur || (versEquipe ? 'Le client' : "L'équipe")} a écrit sur le ticket`
        + `${numero ? ` ${numero}` : ''}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''}.`,
      faits: [
        ['Ticket', numero],
        ['Projet', valeurTexte(v.projetNom)],
        ['Statut', libelle(STATUTS, v.statut)],
      ],
      citation: extrait(v.texte, 1200),
      bouton: { libelle: 'Répondre', url: valeurTexte(v.lien) || lienEspace() },
      note: "Répondez depuis l'espace de suivi : un e-mail de retour ne serait pas rattaché au ticket.",
    }),
  };
}

/* 6. Ticket résolu. */
function resolu(v) {
  const numero = valeurTexte(v.numero);
  return {
    objet: objetAvecNumero(numero, 'Votre ticket est résolu'),
    ...rendreGabarit({
      titre: 'Votre ticket est résolu',
      intro: `Le ticket${numero ? ` ${numero}` : ''}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''} est marqué comme résolu.\n\n`
        + 'Si le problème revient, vous pouvez rouvrir ce ticket depuis votre espace pendant sept jours. Passé ce délai, ouvrez un nouveau ticket, qui gardera le lien avec celui-ci.',
      faits: [
        ['Ticket', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Résolu le', dateFr(v.date)],
      ],
      bouton: { libelle: 'Voir le ticket', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/* 7. Ticket fermé. */
function ferme(v) {
  const numero = valeurTexte(v.numero);
  return {
    objet: objetAvecNumero(numero, 'Votre ticket est fermé'),
    ...rendreGabarit({
      titre: 'Votre ticket est fermé',
      intro: `Le ticket${numero ? ` ${numero}` : ''}${valeurTexte(v.titre) ? `, « ${valeurTexte(v.titre)} »` : ''} est clos. `
        + 'Il reste consultable dans votre espace, avec tout son historique.\n\n'
        + 'Un ticket fermé ne se rouvre pas. Si le sujet revient, ouvrez un nouveau ticket : nous y retrouverons le contexte.',
      faits: [
        ['Ticket', numero],
        ['Titre', valeurTexte(v.titre)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Fermé le', dateFr(v.date)],
      ],
      bouton: { libelle: 'Consulter le ticket', url: valeurTexte(v.lien) || lienEspace() },
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
        + `Le devis${numero ? ` ${numero}` : ''} est déposé dans votre espace. Vous pouvez le télécharger, puis l'accepter ou le refuser en un clic depuis la page du projet.`,
      faits: [
        ['Devis', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant', montantHT(v.montant)],
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
        ['Montant', montantHT(v.montant)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Réponse', accepte ? 'Accepté' : 'Refusé'],
        ['Répondu le', dateFr(v.date)],
      ],
      bouton: { libelle: 'Ouvrir le projet', url: valeurTexte(v.lien) || lienEspace() },
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
        + `La facture${numero ? ` ${numero}` : ''} est déposée dans votre espace, avec son fichier PDF.`
        + (echeance ? ` Son règlement est attendu au plus tard le ${echeance}.` : ''),
      faits: [
        ['Facture', numero],
        ['Objet', valeurTexte(v.libelle)],
        ['Montant', montantHT(v.montant)],
        ['Projet', valeurTexte(v.projetNom)],
        ['Échéance', echeance],
      ],
      bouton: { libelle: 'Voir la facture', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Une question sur cette facture : répondez directement à cet e-mail.',
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

const QUALIFS = { 'incluse': 'incluse au contrat', 'hors-perimetre': 'hors du perimetre prevu', 'a-chiffrer': 'a chiffrer', 'offerte': 'offerte' };
const CHANGEMENTS = { nouveau: 'Nouveau', amelioration: 'Amelioration', correction: 'Correction', technique: 'Technique' };

function tacheAttente(v) {
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: `${projet ? `${projet} · ` : ''}Nous attendons votre retour : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: 'Nous attendons votre retour',
      intro: `Bonjour,\n\nPour avancer sur ${projet || 'votre projet'}, nous avons besoin de vous sur le point suivant.`,
      faits: [['Tache', valeurTexte(v.titre)], ['Detail', valeurTexte(v.description)]],
      bouton: { libelle: 'Voir et repondre', url: valeurTexte(v.lien) || lienEspace() },
      note: 'Repondez depuis votre espace ou dans la conversation du projet.',
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
      note: v.lienStore ? `Le detail des changements est dans votre espace : ${valeurTexte(v.lien)}` : '',
    }),
  };
}

function fichier(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const versEquipe = v.cote === 'equipe';
  return {
    objet: versEquipe ? `${projet} · Fichier recu de ${valeurTexte(v.par)}` : `${projet ? `${projet} · ` : ''}Nouveau fichier disponible`,
    ...rendreGabarit({
      titre: versEquipe ? 'Un client a depose un fichier' : 'Un nouveau fichier vous attend',
      intro: versEquipe ? `${valeurTexte(v.par)} a depose un fichier sur ${projet}.` : `Bonjour,\n\nUn fichier vient d'etre ajoute a votre espace${projet ? ` ${projet}` : ''}.`,
      faits: [['Fichier', valeurTexte(v.nom)], ['Categorie', valeurTexte(v.categorie)]],
      bouton: { libelle: 'Ouvrir les fichiers', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

function reunion(v) {
  const projet = valeurTexte(v.projetNom).trim();
  return {
    objet: `${projet ? `${projet} · ` : ''}${v.deplacee ? 'Reunion deplacee' : 'Reunion programmee'} : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: v.deplacee ? 'Reunion deplacee' : 'Reunion programmee',
      intro: `Bonjour,\n\n${v.deplacee ? 'La reunion suivante change de date.' : 'Une reunion est programmee.'}`,
      faits: [['Objet', valeurTexte(v.titre)], ['Quand', valeurTexte(v.date)], ['Duree', v.duree ? `${valeurTexte(v.duree)} min` : ''], ['Visio', valeurTexte(v.lienVisio)], ['Ordre du jour', valeurTexte(v.ordreDuJour)]],
      bouton: { libelle: v.lienVisio ? 'Rejoindre la reunion' : 'Voir la reunion', url: valeurTexte(v.lienVisio) || valeurTexte(v.lien) || lienEspace() },
      note: `Le fichier d'agenda est disponible dans votre espace : ${valeurTexte(v.lien)}`,
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
      bouton: { libelle: 'Examiner et repondre', url: valeurTexte(v.lien) || lienEspace() },
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
      faits: [['Reponse', approuvee ? 'Approuvee' : 'Modifications demandees'], ['Commentaire', valeurTexte(v.commentaire)]],
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
      titre: `${valeurTexte(v.auteur)} vous ecrit`,
      intro: texte.length > 1200 ? `${texte.slice(0, 1200)}…` : texte,
      faits: v.pieces ? [['Pieces jointes', String(v.pieces)]] : [],
      bouton: { libelle: 'Repondre', url: valeurTexte(v.lien) || lienEspace() },
      note: versEquipe ? '' : 'Repondez depuis votre espace : la conversation y reste au complet.',
    }),
  };
}

function qualification(v) {
  const projet = valeurTexte(v.projetNom).trim();
  const q = QUALIFS[v.qualification] || valeurTexte(v.qualification);
  return {
    objet: `${projet ? `${projet} · ` : ''}${valeurTexte(v.numero)} : demande ${q}`,
    ...rendreGabarit({
      titre: v.qualification === 'a-chiffrer' ? 'Un devis va vous etre propose' : 'Cette demande sort du perimetre prevu',
      intro: `Bonjour,\n\nNous avons etudie votre demande « ${valeurTexte(v.titre)} ». Elle est ${q}. ${v.qualification === 'a-chiffrer' ? 'Nous vous proposons un devis avant tout developpement.' : 'Nous revenons vers vous pour en discuter ou vous proposer un chiffrage.'}`,
      faits: [['Demande', valeurTexte(v.numero)], ['Titre', valeurTexte(v.titre)]],
      bouton: { libelle: 'Voir la demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

function preprojet(v) {
  const versEquipe = v.cote === 'equipe';
  return {
    objet: versEquipe ? `Nouveau projet demande : ${valeurTexte(v.titre)}` : `Bien recu : ${valeurTexte(v.titre)}`,
    ...rendreGabarit({
      titre: versEquipe ? 'Un client decrit un nouveau projet' : 'Votre demande est bien recue',
      intro: versEquipe ? `${valeurTexte(v.par)} (${valeurTexte(v.email)}) vient de decrire un projet.` : `Bonjour ${valeurTexte(v.par)},\n\nMerci pour votre demande. Nous la lisons, puis nous en discutons ensemble dans votre espace.`,
      faits: versEquipe ? [['Titre', valeurTexte(v.titre)], ['Type', valeurTexte(v.type)], ['Budget', valeurTexte(v.budget)], ['Delai', valeurTexte(v.delai)], ['Idee', valeurTexte(v.idee).slice(0, 600)]] : [['Projet', valeurTexte(v.titre)]],
      bouton: { libelle: versEquipe ? 'Ouvrir la demande' : 'Suivre ma demande', url: valeurTexte(v.lien) || lienEspace() },
    }),
  };
}

/*
 * La maintenance continue. Vers l'equipe : le client demande un forfait,
 * ou propose une evolution. Vers le client : l'etat de son forfait change.
 */
function maintenance(v) {
  const projet = valeurTexte(v.projet);
  if (v.cote === 'equipe') {
    const evolution = v.evenement === 'evolution';
    return {
      objet: evolution ? `${projet} : une evolution proposee` : `${projet} : forfait de maintenance demande`,
      ...rendreGabarit({
        titre: evolution ? 'Le client propose une evolution' : 'Le client demande un forfait de maintenance',
        intro: `${valeurTexte(v.par)} (${valeurTexte(v.email)}) vient d'ecrire depuis son espace.`,
        faits: [['Projet', projet], evolution ? ['Evolution', valeurTexte(v.titre)] : ['Rythme souhaite', valeurTexte(v.rythme)]],
        citation: valeurTexte(v.message),
        bouton: { libelle: 'Ouvrir la maintenance', url: valeurTexte(v.lien) || lienEspace() },
      }),
    };
  }
  const TITRES = {
    proposition: 'Une proposition de maintenance vous attend',
    actif: 'Votre forfait de maintenance est en cours',
    suspendu: 'Votre forfait de maintenance est suspendu',
    termine: 'Votre forfait de maintenance est termine',
  };
  const INTROS = {
    proposition: "Nous avons pose les modalites d'un forfait de maintenance continue pour votre projet : ce qui est compris, le rythme, les delais. Tout se lit dans votre espace, et le devis vous y attend. Rien ne s'engage avant que vous l'ayez accepte.",
    actif: 'Le forfait tourne. Chaque jour travaille et chaque evolution livree apparaissent dans votre espace, au fur et a mesure.',
    suspendu: "Le forfait est mis en pause. Rien n'est perdu : les sequences et les evolutions restent dans votre espace, et il reprend quand vous le souhaitez.",
    termine: 'Le forfait est arrive a son terme. Son histoire reste consultable dans votre espace.',
  };
  const PERIODES = { mensuelle: 'mois', trimestrielle: 'trimestre', annuelle: 'an' };
  const periode = PERIODES[valeurTexte(v.periode)] || 'mois';
  const evenement = valeurTexte(v.evenement);
  return {
    objet: `${projet} : ${(TITRES[evenement] || 'votre forfait de maintenance').replace(/^Votre/, 'votre').replace(/^Une/, 'une')}`,
    ...rendreGabarit({
      titre: TITRES[evenement] || 'Votre forfait de maintenance',
      intro: INTROS[evenement] || 'Votre forfait de maintenance a change. Tout se lit dans votre espace.',
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
      ? `${valeurTexte(v.projet)} : ${n} points attendent votre reponse`
      : `${valeurTexte(v.projet)} : un point attend votre reponse`,
    ...rendreGabarit({
      titre: n > 1 ? `${n} points attendent votre reponse` : 'Un point attend votre reponse',
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
    objet: 'Une session du cockpit vient de s ouvrir',
    ...rendreGabarit({
      titre: 'Session du cockpit ouverte',
      intro: "Une session d'equipe vient d'etre ouverte avec votre adresse. Si c'est vous, il n'y a rien a faire.",
      faits: [['Quand', valeurTexte(v.quand)], ['Depuis', valeurTexte(v.ip)]],
      note: "Si ce n'est pas vous, changez l'acces a votre boite immediatement : c'est elle qui ouvre le cockpit.",
    }),
  };
}

const MODELES = {
  'invitation': invitation,
  'ticket-cree': ticketCree,
  'statut': statut,
  'assignation': assignation,
  'message': message,
  'resolu': resolu,
  'ferme': ferme,
  'devis': devis,
  'devis-reponse': devisReponse,
  'facture': facture,
  'tache-attente': tacheAttente,
  'release': release,
  'fichier': fichier,
  'reunion': reunion,
  'validation-demandee': validationDemandee,
  'validation-reponse': validationReponse,
  'message-projet': messageProjet,
  'qualification': qualification,
  'preprojet': preprojet,
  'maintenance': maintenance,
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
