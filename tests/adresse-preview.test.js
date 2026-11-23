import { describe, expect, it } from 'vitest';
import { adresseBranche } from '../scripts/adresse-preview.mjs';

describe('adresse de preview', () => {
  it('remplace « / » par « - », comme dans CLAUDE.md', () => {
    expect(adresseBranche('developpement')).toBe('montisapp-git-developpement-luce-team.vercel.app');
    expect(adresseBranche('claude/lot-0-8-perf-15aa19')).toBe('montisapp-git-claude-lot-0-8-perf-15aa19-luce-team.vercel.app');
  });

  it('met en minuscules et retire les caractères qu’une adresse refuse', () => {
    expect(adresseBranche('Lot_2.0/Pins')).toBe('montisapp-git-lot-2-0-pins-luce-team.vercel.app');
  });
});
