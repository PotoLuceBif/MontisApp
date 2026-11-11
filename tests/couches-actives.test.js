import { describe, expect, it, vi } from 'vitest';
import { creerPastilleCouche } from '../src/couches-actives.js';

const visibles = () => [...document.querySelectorAll('.couche-pastille')].filter((e) => !e.hidden);

describe('pastilles regroupées par rubrique', () => {
  it('garde la pastille seule, puis la remplace par sa rubrique dès la deuxième', () => {
    const retirerA = vi.fn();
    const retirerB = vi.fn();
    const a = creerPastilleCouche({ nom: () => 'Sommets', rubrique: 'elements', onOuvrir() {}, onRetirer: retirerA });
    const b = creerPastilleCouche({ nom: () => 'Refuges', rubrique: 'elements', onOuvrir() {}, onRetirer: retirerB });
    const radar = creerPastilleCouche({ nom: () => 'Pluie', onOuvrir() {}, onRetirer() {} });
    radar.montrer(true);

    a.montrer(true);
    expect(visibles().map((e) => e.textContent.trim()).sort()).toEqual(['Pluie', 'Sommets']);

    b.montrer(true);
    const rubrique = document.querySelector('.couche-pastille-rubrique');
    expect(visibles()).toHaveLength(2); // le radar, à part, et la rubrique
    expect(rubrique.hidden).toBe(false);
    expect(rubrique.textContent).toContain('· 2');

    // La ✕ de la rubrique éteint ses deux couches, pas le radar
    a.retirer = () => { retirerA(); a.montrer(false); };
    b.retirer = () => { retirerB(); b.montrer(false); };
    rubrique.querySelector('.couche-pastille-retirer').click();
    expect(retirerA).toHaveBeenCalledOnce();
    expect(retirerB).toHaveBeenCalledOnce();
    expect(rubrique.hidden).toBe(true);
    expect(visibles().map((e) => e.textContent.trim())).toEqual(['Pluie']);
  });
});
