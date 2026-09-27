/* La fiche du testeur, obligatoire à sa première connexion : les suites
   qui font entrer un testeur neuf la remplissent ici, comme lui. Un
   testeur du semis (semer-campagne) l'a déjà validée : rien ne s'affiche,
   et l'aide rend tout de suite. */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const remplirFiche = async (page, { prenom = 'Testeur', nom = 'Du Banc', modele = 'Appareil du banc' } = {}) => {
  const champ = await page.waitForSelector('#ft-prenom', { timeout: 4000 }).catch(() => null);
  if (!champ) return false;
  if (!(await page.inputValue('#ft-prenom'))) await page.fill('#ft-prenom', prenom);
  await page.fill('#ft-nom', nom);
  await page.selectOption('#ft-sexe', 'homme');
  await page.selectOption('#ft-age', '25-34');
  await page.fill('#ft-expertise', 'Commerce');
  await page.selectOption('#ft-aisance', 'À l\'aise');
  await page.fill('#ft-modele', modele);
  await page.click('[data-valider]');
  await page.waitForSelector('#ft-prenom', { state: 'detached', timeout: 10000 }).catch(() => null);
  await pause(400);
  return true;
};

module.exports = { remplirFiche };
