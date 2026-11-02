import { defineConfig } from 'vitest/config';

// Environnement de navigateur simulé : les modules lisent localStorage et navigator au chargement
export default defineConfig({
  define: { __VERSION_MONTIS__: '"test"' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/preparation.js'],
  },
});
