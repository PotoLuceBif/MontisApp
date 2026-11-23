import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig } from 'vite';

// Pistes, massifs d’avalanche et itinéraires de ski de rando se chargent à la demande : pas à garder d’office
const EXCLUS_DU_SERVICE_WORKER = ['/data/pistes/', '/data/bike-parks/', '/data/avalanches/', '/data/skitour/', '/data/lune/', '/data/jeux/'];

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

// Les fonctions de api/ (relais) tournent sur Vercel ; en développement et en prévisualisation,
// le serveur de Vite les sert lui-même, avec la même signature (requête et réponse Node)
function relais() {
  const brancher = (serveur, charger) => {
    serveur.middlewares.use(async (req, res, suite) => {
      const lu = /^\/api\/([a-z-]+)(?:\?|$)/.exec(req.url ?? '');
      if (!lu) return suite();
      try {
        const module = await charger(`/api/${lu[1]}.js`);
        await module.default(req, res);
      } catch (erreur) {
        suite(erreur);
      }
    });
  };
  return {
    name: 'montis-relais',
    configureServer(serveur) {
      brancher(serveur, (chemin) => serveur.ssrLoadModule(chemin));
    },
    configurePreviewServer(serveur) {
      brancher(serveur, (chemin) => import(new URL(`.${chemin}`, import.meta.url).href));
    },
  };
}

// Seuls les textes de la langue choisie se chargent (i18n.js). Ils ne sont connus qu'en lisant les
// réglages : un petit script de index.html les demande tout de suite, en même temps que le reste du
// code, plutôt qu'une fois i18n.js lancé (un aller-retour réseau de plus, une demi-seconde en 4G lente).
// Même choix que langue() de preferences.js : réglage gardé, sinon langue du téléphone, sinon français.
function langueChoisie() {
  return {
    name: 'montis-langue-choisie',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        const fichiers = {};
        for (const morceau of Object.values(bundle ?? {})) {
          const langue = /[\\/]i18n[\\/](fr|en)\.json$/.exec(morceau.facadeModuleId ?? '')?.[1];
          if (langue) fichiers[langue] = `/${morceau.fileName}`;
        }
        if (!fichiers.fr || !fichiers.en) throw new Error('Fichiers de langue introuvables dans le build');
        const script = `(function(){var f=${JSON.stringify(fichiers)},l;try{l=JSON.parse(localStorage.getItem('montis.reglages')||'{}').langue}catch(e){}`
          + `if(!f[l]){l='fr';var n=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'fr'];`
          + `for(var i=0;i<n.length;i++){var c=String(n[i]).slice(0,2).toLowerCase();if(f[c]){l=c;break}}}`
          + `var k=document.createElement('link');k.rel='modulepreload';k.crossOrigin='anonymous';k.href=f[l];document.head.appendChild(k)})()`;
        return { html, tags: [{ tag: 'script', children: script, injectTo: 'head-prepend' }] };
      },
    },
  };
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig({
  plugins: [serviceWorker(), relais(), langueChoisie()],
  // Version affichée dans les Paramètres
  define: { __VERSION_MONTIS__: JSON.stringify(version) },
  // Les sessions parallèles travaillent dans .claude/worktrees/ : sans cela, chacune de leurs
  // constructions rechargeait la page du serveur principal (captures bloquées au chargement)
  server: { watch: { ignored: ['**/.claude/**', '**/captures/**'] } },
  optimizeDeps: { entries: ['index.html'] },
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
