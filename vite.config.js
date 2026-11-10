import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig } from 'vite';

// Les pistes se chargent station par station, les massifs d’avalanche en ski de rando : pas à garder d’office
const EXCLUS_DU_SERVICE_WORKER = ['/data/pistes/', '/data/bike-parks/', '/data/avalanches/'];

function fichiersPublics(dossier, racine = dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersPublics(chemin, racine);
    return [`/${relative(racine, chemin).split(sep).join('/')}`];
  });
}

// Publie /sw.js avec la liste des fichiers de ce build. Sa version change avec eux :
// c'est ce qui déclenche la mise à jour de l'application chez les utilisateurs.
function serviceWorker() {
  return {
    name: 'montis-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const publics = fichiersPublics('public').filter(
        (fichier) => !EXCLUS_DU_SERVICE_WORKER.some((exclu) => fichier.startsWith(exclu))
      );
      const construits = Object.keys(bundle).map((fichier) => `/${fichier}`);
      const fichiers = [...new Set(['/index.html', ...construits, ...publics])];
      const empreinte = createHash('sha256');
      fichiers.sort().forEach((fichier) => empreinte.update(fichier));
      publics.forEach((fichier) => empreinte.update(String(statSync(join('public', fichier)).size)));
      const modele = readFileSync('src/sw-modele.js', 'utf8');
      empreinte.update(modele);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: modele
          .replace('__VERSION__', empreinte.digest('hex').slice(0, 12))
          .replace('__FICHIERS__', JSON.stringify(fichiers)),
      });
    },
  };
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig({
  plugins: [serviceWorker()],
  // Version affichée dans les Paramètres
  define: { __VERSION_MONTIS__: JSON.stringify(version) },
  build: {
    // MapLibre (1,1 Mo) dans son propre fichier : il change rarement, le navigateur et le
    // service worker le gardent d'un déploiement à l'autre, seul le code de Montis se recharge
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl[\\/]/ }],
        },
      },
    },
    // MapLibre seul dépasse les 500 Ko par défaut et ne se découpe pas
    chunkSizeWarningLimit: 1200,
  },
});
