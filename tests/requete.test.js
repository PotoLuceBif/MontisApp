import { afterEach, describe, expect, it, vi } from 'vitest';
import { erreurHttp, messageErreur, requete } from '../src/requete.js';

// fetch simulé qui ne répond jamais, sauf annulation
const fetchSansReponse = (adresse, { signal }) => new Promise((_, rejeter) => {
  signal.addEventListener('abort', () => rejeter(new DOMException('annulée', 'AbortError')));
});

afterEach(() => vi.unstubAllGlobals());

describe('requete', () => {
  it('lève TimeoutError quand le service ne répond pas à temps', async () => {
    vi.stubGlobal('fetch', vi.fn(fetchSansReponse));
    await expect(requete('https://exemple.test', {}, 20)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('garde AbortError pour une annulation voulue', async () => {
    vi.stubGlobal('fetch', vi.fn(fetchSansReponse));
    const controleur = new AbortController();
    const promesse = requete('https://exemple.test', { signal: controleur.signal }, 1000);
    controleur.abort();
    await expect(promesse).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rend la réponse obtenue à temps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    await expect(requete('https://exemple.test', {}, 1000)).resolves.toMatchObject({ ok: true });
  });
});

describe('messageErreur', () => {
  it('donne un message lisible plutôt que le détail technique', () => {
    expect(messageErreur(new TypeError('Failed to fetch'))).toBe('le service ne répond pas pour l’instant.');
    expect(messageErreur(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('le service met trop de temps à répondre.');
    expect(messageErreur(erreurHttp({ status: 429 }))).toMatch(/trop de demandes/);
  });
});
