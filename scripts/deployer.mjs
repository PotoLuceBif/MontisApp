// Preview Vercel en une commande (lot 0.8) : tests, build, déploiement, adresse habituelle de la branche.
//
//   npm run deployer              preview de la branche en cours
//   npm run deployer -- --alpha   et aussi https://montis-alpha.vercel.app (la version que montre le propriétaire)
//   npm run deployer -- --essai   tests et build seulement, puis ce qui serait envoyé, sans rien publier
//
// S'arrête au premier échec. Jamais de mise en production (--prod) : main ne change qu'à une version.
// Exige la CLI Vercel connectée au compte (`vercel login`). Le projet (luce-team/montisapp) est lu dans
// .vercel/project.json, ici ou dans le dossier principal du dépôt pour un worktree.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { adresseBranche } from './adresse-preview.mjs';

const ALPHA = 'montis-alpha.vercel.app';
const avecAlpha = process.argv.includes('--alpha');
const essai = process.argv.includes('--essai');
const surWindows = process.platform === 'win32';

function arreter(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

// Commande affichée en direct ; `capturer` : sa sortie standard est aussi renvoyée
function lancer(commande, args, { capturer = false, env } = {}) {
  console.log(`\n› ${commande} ${args.join(' ')}`);
  const resultat = spawnSync(commande, args, {
    stdio: capturer ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    shell: surWindows, // npm et vercel sont des .cmd sous Windows
    env: { ...process.env, ...env },
  });
  if (capturer && resultat.stdout) process.stdout.write(resultat.stdout);
  if (resultat.error) arreter(`${commande} introuvable (${resultat.error.message})`);
  if (resultat.status !== 0) arreter(`échec de « ${commande} ${args.join(' ')} »`);
  return resultat.stdout ?? '';
}

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim();

function projetVercel() {
  const ici = join('.vercel', 'project.json');
  if (existsSync(ici)) return null; // la CLI le lit elle-même
  // Worktree : le dossier principal du dépôt est le parent du dossier .git commun
  const principal = dirname(resolve(git('rev-parse', '--git-common-dir')));
  const fichier = join(principal, '.vercel', 'project.json');
  if (!existsSync(fichier)) arreter('projet Vercel introuvable : lance « vercel link » dans le dossier du dépôt');
  const { projectId, orgId } = JSON.parse(readFileSync(fichier, 'utf8'));
  return { VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: orgId };
}

const branche = git('rev-parse', '--abbrev-ref', 'HEAD');
if (!branche || branche === 'HEAD') arreter('pas de branche en cours (HEAD détachée)');
if (branche === 'main') arreter('la branche main est la production : pas de preview depuis main');
const adresse = adresseBranche(branche);
if (adresse.split('.')[0].length > 63) arreter(`nom de branche trop long pour une adresse (${adresse})`);
if (git('status', '--porcelain')) console.warn('⚠ Modifications non commitées : elles partent aussi dans la preview.');

lancer('npm', ['test']);
lancer('npm', ['run', 'build']);
const env = projetVercel() ?? {};
if (essai) {
  console.log(`
✓ Essai réussi. Sans --essai : preview de « ${branche} » sur https://${adresse}${avecAlpha ? ` et https://${ALPHA}` : ''}`);
  if (env.VERCEL_PROJECT_ID) console.log(`  (projet Vercel lu dans le dossier principal du dépôt : ${env.VERCEL_PROJECT_ID})`);
  process.exit(0);
}
const sortie = lancer('vercel', ['deploy', '--yes'], { capturer: true, env });
const deploiement = sortie.match(/https:\/\/[^\s]+\.vercel\.app/g)?.at(-1);
if (!deploiement) arreter('adresse du déploiement introuvable dans la réponse de Vercel');
lancer('vercel', ['alias', 'set', deploiement, adresse], { env });
if (avecAlpha) lancer('vercel', ['alias', 'set', deploiement, ALPHA], { env });

console.log(`\n✓ Preview prête : https://${adresse}`);
if (avecAlpha) console.log(`✓ Et sur https://${ALPHA}`);
