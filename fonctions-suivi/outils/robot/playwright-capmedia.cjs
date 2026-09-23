/* ==========================================================================
   CAPMEDIA CLIENT HUB · le rapporteur Playwright, en direct

   Chaque test envoie son verdict au tableau dès qu'il tombe : on voit les
   cases passer du bleu au vert pendant que la suite tourne.

     // playwright.config
     reporter: [['list'], ['./playwright-capmedia.cjs', {
       url: 'https://europe-west1-capmedia-1f90d.cloudfunctions.net/suiviRobot',
       plateforme: 'web',
     }]],
     // et CAPMEDIA_ROBOT=cmr_... dans l'environnement

   Le titre de chaque test commence par la référence de son parcours
   (« R-05 Web : les quatre créations »). Un test rejoué qui finit au vert
   est rendu instable.
   ========================================================================== */

const REF = /(?:^|[\s[(/])([A-Z]{1,3}-R?\d{1,3})(?=[\s\]):.,_-]|$)/;
const refDe = (test) => {
  for (const t of [test.title, ...test.titlePath()]) { const m = String(t || '').match(REF); if (m) return m[1]; }
  return '';
};

class RapporteurCapmedia {
  constructor(options = {}) {
    this.url = options.url || process.env.CAPMEDIA_ROBOT_URL || '';
    this.plateforme = options.plateforme || 'web';
    this.jeton = process.env.CAPMEDIA_ROBOT || '';
    this.execution = options.execution || (process.env.GITHUB_RUN_ID
      ? `gh-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || 1}-playwright`
      : `playwright-${Date.now()}`);
    this.file = Promise.resolve();
    this.actif = Boolean(this.url && this.jeton);
    if (!this.actif) console.warn('[capmedia] CAPMEDIA_ROBOT ou url manquant : rien ne sera rendu au tableau.');
  }

  /* Les envois partent dans l'ordre, sans jamais bloquer la suite : un
     tableau injoignable ne doit pas faire échouer les tests. */
  envoyer(corps) {
    if (!this.actif) return;
    this.file = this.file.then(() => fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.jeton}` },
      body: JSON.stringify({ execution: this.execution, ...corps }),
    }).then(async (r) => { if (!r.ok) console.warn(`[capmedia] ${r.status} ${await r.text()}`); })
      .catch((e) => console.warn(`[capmedia] ${e.message}`)));
  }

  onBegin(config, suite) {
    const refs = [...new Set(suite.allTests().map(refDe).filter(Boolean))];
    this.envoyer({
      evenement: 'debut', outil: 'playwright', plateforme: this.plateforme, parcours: refs,
      branche: process.env.GITHUB_REF_NAME || '', commit: (process.env.GITHUB_SHA || '').slice(0, 40), machine: process.env.RUNNER_NAME || '',
    });
  }

  onTestEnd(test, result) {
    const ref = refDe(test);
    if (!ref) return;
    const dernierEssai = result.status === 'passed' || result.status === 'skipped' || result.retry >= test.retries;
    if (!dernierEssai) return;
    const resultat = result.status === 'passed' ? 'vert' : result.status === 'skipped' ? 'saute' : 'rouge';
    const erreur = (result.errors || [])[0] || result.error || {};
    this.envoyer({
      evenement: 'resultat', ref, resultat, plateforme: this.plateforme,
      essais: result.retry + 1, duree: Math.round(result.duration / 10) / 100,
      message: String(erreur.message || '').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 2000),
    });
  }

  async onEnd(result) {
    this.envoyer({ evenement: 'fin', interrompue: result.status === 'interrupted' });
    await this.file;
  }
}

module.exports = RapporteurCapmedia;
