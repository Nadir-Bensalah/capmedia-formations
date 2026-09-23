#!/usr/bin/env node
/* ==========================================================================
   CAPMEDIA CLIENT HUB · rendre les verdicts d'un outil de test

   Lit un ou plusieurs rapports JUnit (Maestro --format junit, Jest avec
   jest-junit, Playwright --reporter=junit, Test Lab) et les envoie au
   tableau des tests : début, résultats, fin. Le nom de chaque test doit
   commencer par la référence de son parcours (« R-01 Créer un rappel »).

     CAPMEDIA_ROBOT=cmr_... node robot-rapport.mjs \
       --url https://europe-west1-capmedia-1f90d.cloudfunctions.net/suiviRobot \
       --outil maestro --plateforme ios rapport.xml [autre.xml...]

   Un test rejoué qui finit au vert est rendu INSTABLE : c'est
   l'information la plus utile que le rapport contienne, et la plus souvent
   perdue.

   Le jeton se passe par la variable CAPMEDIA_ROBOT, jamais sur la ligne
   de commande : elle finit dans l'historique et dans les journaux.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/* La référence : en tête du nom, ou du nom de classe. */
export const REF = /(?:^|[\s[(/])([A-Z]{1,3}-R?\d{1,3})(?=[\s\]):.,_-]|$)/;
const refDe = (...textes) => { for (const t of textes) { const m = String(t || '').match(REF); if (m) return m[1]; } return ''; };

const attr = (balise, nom) => { const m = balise.match(new RegExp(`\\s${nom}="([^"]*)"`)); return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''; };

/** Les cas d'un rapport JUnit, sans dépendance : { ref, statut, duree, message }. */
export const lireJunit = (xml) => {
  const cas = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const tete = `<testcase${m[1]}>`;
    const corps = m[3] || '';
    const echec = corps.match(/<(failure|error)\b([^>]*)>?([\s\S]*?)(?:<\/\1>|$)/);
    const saute = /<skipped\b/.test(corps);
    cas.push({
      ref: refDe(attr(tete, 'name'), attr(tete, 'classname')),
      nom: attr(tete, 'name'),
      statut: echec ? 'rouge' : (saute ? 'saute' : 'vert'),
      duree: Number(attr(tete, 'time')) || null,
      message: echec ? (attr(`<x${echec[2]}>`, 'message') || echec[3] || '').trim().slice(0, 2000) : '',
    });
  }
  return cas;
};

/* Plusieurs cas pour une même référence : des essais, ou plusieurs
   étapes d'un même parcours. Rouge si le dernier essai échoue, instable
   si un échec précède un vert. */
export const regrouper = (cas) => {
  const par = new Map();
  cas.filter((c) => c.ref).forEach((c) => { if (!par.has(c.ref)) par.set(c.ref, []); par.get(c.ref).push(c); });
  return [...par.entries()].map(([ref, liste]) => {
    const joues = liste.filter((c) => c.statut !== 'saute');
    if (!joues.length) return { ref, resultat: 'saute', essais: 1 };
    const rouges = joues.filter((c) => c.statut === 'rouge');
    const dernier = joues[joues.length - 1];
    const duree = joues.reduce((n, c) => n + (c.duree || 0), 0);
    return {
      ref, resultat: dernier.statut === 'rouge' ? 'rouge' : 'vert',
      essais: rouges.length && dernier.statut === 'vert' ? rouges.length + 1 : 1,
      duree: Math.round(duree * 100) / 100,
      message: (rouges[rouges.length - 1] || {}).message || '',
    };
  });
};


const principal = async () => {
  const args = process.argv.slice(2);
  const option = (nom, defaut = '') => {
    const i = args.indexOf(`--${nom}`);
    return i >= 0 ? args.splice(i, 2)[1] : defaut;
  };
  const drapeau = (nom) => { const i = args.indexOf(`--${nom}`); if (i >= 0) { args.splice(i, 1); return true; } return false; };

  const url = option('url', process.env.CAPMEDIA_ROBOT_URL || '');
  const outil = option('outil', 'autre');
  const plateforme = option('plateforme', '');
  const git = (cmd) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
  const execution = option('execution', process.env.GITHUB_RUN_ID ? `gh-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || 1}-${outil}${plateforme ? `-${plateforme}` : ''}` : `${outil}-${Date.now()}`);
  const branche = option('branche', process.env.GITHUB_REF_NAME || git('git rev-parse --abbrev-ref HEAD'));
  const commit = option('commit', (process.env.GITHUB_SHA || git('git rev-parse HEAD')).slice(0, 40));
  const essai = drapeau('essai');
  const jeton = process.env.CAPMEDIA_ROBOT || '';
  const fichiers = args;

  if (!url || !jeton || !fichiers.length) {
    console.error('Usage : CAPMEDIA_ROBOT=cmr_... node robot-rapport.mjs --url <suiviRobot> --outil maestro|playwright|jest|testlab [--plateforme ios|android|web] rapport.xml');
    process.exit(2);
  }

  const envoyer = async (corps) => {
    if (essai) { console.log(JSON.stringify(corps).slice(0, 300)); return { ok: true }; }
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` }, body: JSON.stringify(corps) });
    const texte = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${texte}`);
    try { return JSON.parse(texte); } catch (e) { return {}; }
  };

  const cas = fichiers.flatMap((f) => lireJunit(readFileSync(f, 'utf8')));
  const sansRef = cas.filter((c) => !c.ref);
  const resultats = regrouper(cas);
  if (sansRef.length) console.warn(`${sansRef.length} test(s) sans référence de parcours, ignoré(s) : ${sansRef.slice(0, 5).map((c) => c.nom).join(' | ')}`);

  const debut = await envoyer({ evenement: 'debut', execution, outil, plateforme, branche, commit, machine: process.env.RUNNER_NAME || '', parcours: resultats.map((r) => r.ref) });
  if (debut.inconnus && debut.inconnus.length) console.warn(`Parcours inconnus du hub : ${debut.inconnus.join(', ')}`);
  for (let i = 0; i < resultats.length; i += 200) {
    await envoyer({ evenement: 'resultats', execution, resultats: resultats.slice(i, i + 200).map((r) => ({ ...r, plateforme })) });
  }
  await envoyer({ evenement: 'fin', execution });
  const instables = resultats.filter((r) => r.essais > 1 && r.resultat === 'vert').length;
  const n = (k) => resultats.filter((r) => r.resultat === k).length;
  console.log(`Rendu : ${resultats.length} parcours · ${n('vert') - instables} verts · ${instables} instables · ${n('rouge')} rouges`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
