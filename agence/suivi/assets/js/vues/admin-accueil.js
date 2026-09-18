/* ==========================================================================
   L'accueil du cockpit : que dois-je traiter aujourd'hui ?
   ========================================================================== */

import { echapper, prenom, nomAffiche, dateCourte, dateHeure, montant, pluriel, joursAvant, parDateDesc, parDateAsc, OUVERTS, ATTEND_EQUIPE, ATTEND_CLIENT, FACTURES_DUES, STATUTS_PROJET, URGENCES } from '../noyau.js';
import { icone, pastille, puce, avatarProjet, ligne, vide, squelette, titrePage, metrique, progression } from '../ui.js';
import * as magasin from '../magasin.js';
import { K, enAttenteDeNous, enAttenteDuClient, projetsActifs, prochaineReunion, progressionProjet, resteAPayer } from '../donnees.js';
import { filAriane } from '../coquille.js';
import { activiteHtml } from './accueil.js';

export const vue = async (ctx, env) => {
  const lot = magasin.lot();
  const sortie = ctx.sortie;
  titrePage('Cockpit');
  filAriane([{ libelle: 'Accueil' }]);
  sortie.innerHTML = `<div class="page">${squelette('page', 6)}</div>`;

  const rendre = () => {
    const projets = magasin.lire(K.projets) || [];
    const organisations = magasin.lire(K.organisations) || [];
    const tickets = (magasin.lire(K.ticketsTous) || []).filter((t) => !t.archive);
    const taches = (magasin.lire(K.tachesToutes) || []).filter((t) => !t.archive);
    const validations = magasin.lire(K.validationsToutes) || [];
    const documents = (magasin.lire(K.documentsTous) || []).filter((d) => !d.archive);
    const paiements = magasin.lire(K.paiementsTous) || [];
    const reunions = magasin.lire(K.reunionsToutes) || [];
    const blocages = magasin.lire(K.blocagesTous) || [];
    const activite = (magasin.lire(K.activiteToute) || []).slice().sort(parDateDesc('date'));
    const demandesProjet = magasin.lire(K.demandesProjet) || [];
    const jalons = magasin.lire(K.jalonsTous) || [];
    const nomProjet = (pid) => ((projets.find((p) => p.id === pid) || {}).nom || '');

    const actifs = projetsActifs(projets);
    const enRetard = actifs.filter((p) => p.cible && joursAvant(p.cible) < 0 && p.statut !== 'termine');
    const ouverts = tickets.filter((t) => OUVERTS.includes(t.statut));
    const nouvelles = tickets.filter((t) => t.statut === 'nouveau');
    const bloquants = ouverts.filter((t) => t.urgence === 'bloquant' || t.urgence === 'critique');
    const aFaire = taches.filter((t) => t.statut !== 'terminee');
    const tachesRetard = aFaire.filter((t) => t.echeance && joursAvant(t.echeance) < 0);
    const attendues = validations.filter((v) => v.statut === 'en-attente');
    const attendNous = enAttenteDeNous({ projets, tickets, validations, taches, blocages, demandesProjet });
    const attendClient = enAttenteDuClient({ projets, tickets, validations, documents, taches, blocages });
    const prochaines = reunions.filter((r) => joursAvant(r.date) >= 0).sort(parDateAsc('date')).slice(0, 4);
    const devisAttente = documents.filter((d) => d.type === 'devis' && ['envoye', 'consulte'].includes(d.statut));
    const { total: impaye, factures: impayees } = resteAPayer(documents, paiements);
    const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
    const facture = documents.filter((d) => d.type === 'facture' && !['brouillon', 'annulee', 'avoir'].includes(d.statut) && d.date && (d.date.toDate ? d.date.toDate() : new Date(d.date)) >= debutAnnee).reduce((s, d) => s + (Number(d.montant) || 0), 0);
    const recents = paiements.slice().sort(parDateDesc('date')).slice(0, 4);
    const aujourdhui = attendNous.filter((a) => a.genre === 'demande' && (a.urgence === 'bloquant' || a.urgence === 'critique')).concat(attendNous.filter((a) => a.genre === 'tache' || a.genre === 'blocage')).concat(attendNous.filter((a) => a.genre === 'demande' && !(a.urgence === 'bloquant' || a.urgence === 'critique'))).concat(attendNous.filter((a) => a.genre === 'preprojet')).slice(0, 10);

    sortie.innerHTML = `<div class="page">
      <div class="page-tete"><div><p class="surtitre">${echapper(dateCourte(new Date()))}</p><h1>Bonjour ${echapper(prenom(nomAffiche(env.session)))}</h1><p class="chapo">${pluriel(actifs.length, 'projet actif', 'projets actifs')} pour ${pluriel(organisations.length, 'client')}. ${attendNous.length ? `${pluriel(attendNous.length, 'point à traiter', 'points à traiter')} de notre côté.` : 'Rien n\'attend de notre côté.'}</p></div>
        <div class="actions"><a class="btn btn-secondaire" href="#/projets/nouveau">${icone('plus')} Projet</a><a class="btn btn-secondaire" href="#/clients/nouveau">${icone('entreprise')} Client</a><a class="btn btn-principal" href="#/demandes">${icone('inbox')} Demandes${nouvelles.length ? ` <span class="badge badge--vif" style="background:#fff;color:var(--accent)">${nouvelles.length}</span>` : ''}</a></div></div>

      <div class="metriques">
        ${metrique(nouvelles.length, 'Demandes reçues', { ton: nouvelles.length ? 'accent' : '', nuance: `${ouverts.length} ouvertes` })}
        ${metrique(bloquants.length, 'Bloquantes ou critiques', { ton: bloquants.length ? 'rouge' : '' })}
        ${metrique(tachesRetard.length, 'Tâches en retard', { ton: tachesRetard.length ? 'rouge' : '', nuance: `${aFaire.length} à faire` })}
        ${metrique(attendClient.length, 'Attendent le client', { ton: attendClient.length ? 'ambre' : '' })}
        ${metrique(attendues.length, 'Validations attendues')}
        ${metrique(montant(impaye), 'Impayé', { ton: impaye > 0 ? 'ambre' : 'vert', nuance: impayees.length ? pluriel(impayees.length, 'facture') : '' })}
        ${metrique(montant(facture), `Facturé HT en ${new Date().getFullYear()}`)}
      </div>

      <div class="grille grille-tiers section">
        <div class="pile" style="gap:var(--e-7)">
          <section>
            <div class="section-tete"><h2>À traiter maintenant</h2><a class="lien" href="#/demandes">Toutes les demandes</a></div>
            ${aujourdhui.length ? `<div class="liste">${aujourdhui.map((a) => ligne({ href: `#${a.chemin}`, icone: a.icone, ton: a.ton, titre: echapper(a.titre), sous: echapper(a.sous), fin: a.urgence ? puce(URGENCES, a.urgence) : '' })).join('')}</div>` : vide({ icone: 'check', titre: 'Rien à traiter', texte: 'La boîte est vide. Profitez-en pour avancer les tâches.', compact: true })}
          </section>
          <section>
            <div class="section-tete"><h2>Projets</h2><a class="lien" href="#/projets">Tous</a></div>
            ${actifs.length ? `<div class="liste">${actifs.slice(0, 8).map((p) => { const prog = progressionProjet(p, jalons.filter((j) => j.projet === p.id)); const ouvertsP = ouverts.filter((t) => t.projet === p.id).length; return ligne({ href: `#/projets/${echapper(p.id)}`, titre: `<span class="rang" style="gap:10px">${avatarProjet(p.nom, 'petit')} ${echapper(p.nom)}</span>`, sous: `${echapper((p.client || {}).entreprise || (p.client || {}).nom || '')}${p.pulse && p.pulse.enCours ? ` · ${echapper(p.pulse.enCours)}` : ''}${ouvertsP ? ` · ${pluriel(ouvertsP, 'demande ouverte', 'demandes ouvertes')}` : ''}`, fin: `<span style="width:90px">${progression(prog.valeur)}</span>${pastille(STATUTS_PROJET, p.statut || 'en-cours')}${p.cible && joursAvant(p.cible) < 0 ? '<span class="puce puce--rouge"><i></i>Retard</span>' : ''}` }); }).join('')}</div>` : vide({ icone: 'projets', titre: 'Aucun projet actif', action: '<a class="btn btn-principal" href="#/projets/nouveau">Créer un projet</a>', compact: true })}
            ${enRetard.length ? `<p class="t-petit t-2" style="margin-top:8px">${pluriel(enRetard.length, 'projet a dépassé sa date cible', 'projets ont dépassé leur date cible')}.</p>` : ''}
          </section>
          <section>
            <div class="section-tete"><h2>Activité récente</h2><a class="lien" href="#/activite">Tout</a></div>
            ${activiteHtml(activite.slice(0, 10).map((a) => ({ ...a, projetNom: nomProjet(a.projet) })), { avecProjet: true })}
          </section>
        </div>
        <aside class="pile" style="gap:var(--e-5)">
          <div class="carte carte--creuse"><p class="surtitre">Attendent le client</p>${attendClient.length ? `<div class="pile" style="margin-top:10px;gap:8px">${attendClient.slice(0, 6).map((a) => `<a class="rang" style="gap:10px;color:inherit;align-items:flex-start" href="#${echapper(a.chemin)}"><span class="ligne-icone ligne-icone--${a.ton || 'ambre'}" style="width:28px;height:28px;border-radius:8px">${icone(a.icone)}</span><span style="min-width:0"><span class="t-petit t-fort tronque" style="display:block">${echapper(a.titre)}</span><span class="t-micro t-3">${echapper(a.sous)}</span></span></a>`).join('')}</div>` : '<p class="t-petit t-2" style="margin-top:8px">Rien en attente côté client.</p>'}</div>
          <div class="carte carte--creuse"><p class="surtitre">Prochaines réunions</p>${prochaines.length ? `<div class="pile" style="margin-top:10px;gap:10px">${prochaines.map((r) => `<a class="rang" style="gap:10px;color:inherit;align-items:flex-start" href="#/projets/${echapper(r.projet)}/reunions"><span class="ligne-icone ligne-icone--bleu" style="width:28px;height:28px;border-radius:8px">${icone('reunions')}</span><span style="min-width:0"><span class="t-petit t-fort tronque" style="display:block">${echapper(r.titre)}</span><span class="t-micro t-3">${echapper(dateHeure(r.date))} · ${echapper(nomProjet(r.projet))}</span></span></a>`).join('')}</div>` : '<p class="t-petit t-2" style="margin-top:8px">Aucune réunion programmée.</p>'}<p style="margin-top:10px"><a class="t-petit" href="#/planning">Planning</a></p></div>
          <div class="carte carte--creuse"><p class="surtitre">Devis en attente</p>${devisAttente.length ? `<div class="pile" style="margin-top:10px;gap:8px">${devisAttente.map((d) => `<a class="rang-espace" style="color:inherit" href="#/finances/${echapper(d.id)}"><span class="t-petit tronque">${echapper(d.numero || '')} ${echapper(nomProjet(d.projet))}</span><span class="t-petit t-fort nb">${echapper(montant(d.montant))}</span></a>`).join('')}</div>` : '<p class="t-petit t-2" style="margin-top:8px">Aucun devis en attente.</p>'}</div>
          <div class="carte carte--creuse"><p class="surtitre">Paiements récents</p>${recents.length ? `<div class="pile" style="margin-top:10px;gap:8px">${recents.map((p) => `<div class="rang-espace"><span class="t-petit">${echapper(dateCourte(p.date))} · ${echapper(nomProjet(p.projet))}</span><span class="t-petit t-fort nb" style="color:var(--ok)">${echapper(montant(p.montant))}</span></div>`).join('')}</div>` : '<p class="t-petit t-2" style="margin-top:8px">Aucun paiement enregistré.</p>'}<p style="margin-top:10px"><a class="t-petit" href="#/finances">Finances</a></p></div>
        </aside>
      </div>
    </div>`;
  };

  let minuteur = null;
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(rendre, 40); };
  [K.projets, K.organisations, K.ticketsTous, K.tachesToutes, K.validationsToutes, K.documentsTous, K.paiementsTous, K.reunionsToutes, K.blocagesTous, K.activiteToute, K.demandesProjet, K.jalonsTous].forEach((c) => lot.sur(c, planifier));
  planifier();
  return () => { clearTimeout(minuteur); lot.fin(); };
};

void ATTEND_EQUIPE; void ATTEND_CLIENT; void FACTURES_DUES; void prochaineReunion;
