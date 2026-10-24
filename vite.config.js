import { defineConfig } from 'vite';

export default defineConfig({
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