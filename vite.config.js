import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig } from 'vite';

// Les pistes se chargent station par station : elles n'ont pas à être gardées d'office
const EXCLUS_DU_SERVICE_WORKER = ['/data/pistes/', '/data/bike-parks/'];

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

export default defineConfig({
  plugins: [serviceWorker()],
  server: {
    proxy: {
      '/ffvl': {
        target: 'https://data.ffvl.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ffvl/, ''),
      },
    },
  },
});
