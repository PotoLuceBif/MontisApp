import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cleRecord, ecart, formatChrono, index, indexCapitales, meilleur, melanger, nomPays, normaliser, paysDeZone, proposerChoix, reconnaitre, suggerer,
} from '../src/jeu-calcul.js';

const intl = (langue) => {
  const noms = new Intl.DisplayNames(langue, { type: 'region' });
  return (code) => noms.of(code);
};
const donnees = JSON.parse(readFileSync('public/data/jeux/pays.json', 'utf8'));
const pays = donnees.features.map((f) => f.properties);
const codes = pays.map((p) => p.code);
const entreesFr = index(codes, 'fr', intl('fr'));
const entreesEn = index(codes, 'en', intl('en'));
const capitalesFr = indexCapitales(pays, 'fr');

// Suite pseudo-aléatoire reproductible
function graine(n) {
  let x = n;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

describe('données du quiz', () => {
  it('197 pays : ONU, Kosovo, Taïwan, Palestine, Vatican', () => {
    expect(codes).toHaveLength(197);
    expect(new Set(codes).size).toBe(197);
    for (const code of ['XK', 'TW', 'PS', 'VA', 'FR', 'TV']) expect(codes).toContain(code);
    for (const code of ['GL', 'PR', 'EH', 'NC']) expect(codes).not.toContain(code);
  });

  it('chaque pays a une zone, un centre et une emprise', () => {
    for (const p of pays) {
      expect(p.zones.length).toBeGreaterThan(0);
      expect(p.centre).toHaveLength(2);
      expect(p.emprise).toHaveLength(4);
    }
    expect(paysDeZone(pays, 'europe')).toContain('RU');
    expect(paysDeZone(pays, 'asie')).toContain('RU');
    expect(paysDeZone(pays, 'monde')).toHaveLength(197);
  });

  it('la France se cadre sur la métropole', () => {
    const [ouest, sud, est, nord] = pays.find((p) => p.code === 'FR').emprise;
    expect(ouest).toBeGreaterThan(-6);
    expect(sud).toBeGreaterThan(41);
    expect(est).toBeLessThan(10);
    expect(nord).toBeLessThan(52);
  });
});

describe('saisie des noms', () => {
  it('ignore accents, majuscules, tirets et articles', () => {
    expect(normaliser('  La Côte-d’Ivoire ')).toBe('cote d ivoire');
    expect(normaliser('The Bahamas', 'en')).toBe('bahamas');
    expect(normaliser('Bosnia & Herzegovina', 'en')).toBe('bosnia and herzegovina');
  });

  it('reconnaît le nom officiel et les noms courants', () => {
    expect(reconnaitre('Tchéquie', entreesFr)).toBe('CZ');
    expect(reconnaitre('république tchèque', entreesFr)).toBe('CZ');
    expect(reconnaitre('RDC', entreesFr)).toBe('CD');
    expect(reconnaitre('Congo', entreesFr)).toBe('CG');
    expect(reconnaitre('etats-unis', entreesFr)).toBe('US');
    expect(reconnaitre('Vatican', entreesFr)).toBe('VA');
    expect(reconnaitre('Palestine', entreesFr)).toBe('PS');
    expect(reconnaitre('ivory coast', entreesEn, { langue: 'en' })).toBe('CI');
    expect(reconnaitre('St Lucia', entreesEn, { langue: 'en' })).toBe('LC');
  });

  it('accepte une faute de frappe seulement en mode tolérant et sur un nom long', () => {
    expect(reconnaitre('Allemagen', entreesFr)).toBeNull();
    expect(reconnaitre('Allemagen', entreesFr, { tolerant: true })).toBe('DE');
    expect(reconnaitre('Nigr', entreesFr, { tolerant: true })).toBeNull();
    expect(reconnaitre('', entreesFr)).toBeNull();
  });

  it('chaque écriture désigne un seul pays', () => {
    for (const entrees of [entreesFr, entreesEn]) {
      const vues = new Map();
      for (const e of entrees) {
        for (const ecriture of e.ecritures) {
          expect(vues.get(ecriture) ?? e.code, ecriture).toBe(e.code);
          vues.set(ecriture, e.code);
        }
      }
    }
  });

  it('suggère d’abord les noms qui commencent par la saisie', () => {
    const s = suggerer('gui', entreesFr);
    expect(s.slice(0, 3)).toEqual(['GN', 'GQ', 'GW']);
    expect(suggerer('', entreesFr)).toEqual([]);
  });

  it('noms fixés par Montis', () => {
    expect(nomPays('PS', 'fr', intl('fr'))).toBe('Palestine');
    expect(nomPays('FR', 'fr', intl('fr'))).toBe('France');
  });

  it('écart de saisie', () => {
    expect(ecart('suisse', 'suisse')).toBe(0);
    expect(ecart('suise', 'suisse')).toBe(1);
    expect(ecart('abc', 'xyzxyz', 2)).toBe(3);
  });
});

describe('capitales', () => {
  it('chaque pays a sa capitale, avec sa position', () => {
    for (const p of pays) {
      expect(p.capitale.fr, p.code).toBeTruthy();
      expect(p.capitale.en, p.code).toBeTruthy();
      const [lng, lat] = p.capitale.position;
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });

  it('noms en français, l’anglais et les autres noms acceptés', () => {
    expect(capitalesFr.find((e) => e.code === 'AT').nom).toBe('Vienne');
    expect(reconnaitre('Vienna', capitalesFr)).toBe('AT');
    expect(reconnaitre('pekin', capitalesFr)).toBe('CN');
    expect(reconnaitre('Kiev', capitalesFr)).toBe('UA');
    expect(reconnaitre('La Paz', capitalesFr)).toBe('BO');
    expect(reconnaitre('Le Cap', capitalesFr)).toBe('ZA');
    expect(reconnaitre('Astana', capitalesFr)).toBe('KZ');
    expect(reconnaitre('Nukualofa', capitalesFr, { tolerant: true })).toBe('TO');
  });

  it('chaque écriture désigne une seule capitale', () => {
    const vues = new Map();
    for (const e of capitalesFr) {
      for (const ecriture of e.ecritures) {
        expect(vues.get(ecriture) ?? e.code, ecriture).toBe(e.code);
        vues.set(ecriture, e.code);
      }
    }
  });
});

describe('tirages et scores', () => {
  it('mélange sans perdre ni dupliquer', () => {
    const m = melanger(codes, graine(3));
    expect([...m].sort()).toEqual([...codes].sort());
  });

  it('quatre choix distincts dont la bonne réponse, de la même zone', () => {
    const europe = paysDeZone(pays, 'europe');
    const choix = proposerChoix('FR', europe, codes, { aleatoire: graine(7) });
    expect(choix).toHaveLength(4);
    expect(new Set(choix).size).toBe(4);
    expect(choix).toContain('FR');
    for (const c of choix) expect(europe).toContain(c);
  });

  it('ne propose jamais deux drapeaux jumeaux ensemble (Monaco et Indonésie)', () => {
    for (let n = 1; n < 200; n += 1) {
      const choix = proposerChoix('MC', codes, codes, { aleatoire: graine(n) });
      expect(choix).not.toContain('ID');
      expect(proposerChoix('TD', codes, codes, { aleatoire: graine(n) })).not.toContain('RO');
    }
  });

  it('complète avec le monde si la zone est trop petite', () => {
    const choix = proposerChoix('FR', ['FR', 'DE'], codes, { aleatoire: graine(2) });
    expect(choix).toHaveLength(4);
    expect(new Set(choix).size).toBe(4);
  });

  it('garde le meilleur résultat', () => {
    expect(meilleur(null, { bonnes: 3, duree: 40 })).toEqual({ bonnes: 3, duree: 40 });
    expect(meilleur({ bonnes: 5, duree: 90 }, { bonnes: 4, duree: 20 })).toEqual({ bonnes: 5, duree: 90 });
    expect(meilleur({ bonnes: 5, duree: 90 }, { bonnes: 5, duree: 60 })).toEqual({ bonnes: 5, duree: 60 });
  });

  it('clé de record par mode', () => {
    expect(cleRecord({ mode: 'liste', zone: 'europe' })).toBe('liste-europe');
    expect(cleRecord({ mode: 'drapeaux', zone: 'monde', longueur: 'courte', niveau: 'choix', sens: 'drapeau' }))
      .toBe('drapeaux-drapeau-choix-courte-monde');
  });

  it('clé de record des capitales', () => {
    expect(cleRecord({ mode: 'capitales', zone: 'asie', longueur: 'complete', niveau: 'expert', sens: 'pays' }))
      .toBe('capitales-pays-expert-complete-asie');
  });

  it('chrono', () => {
    expect(formatChrono(0)).toBe('0:00');
    expect(formatChrono(125.4)).toBe('2:05');
  });
});

describe('liste chrono : saisie prise au vol', async () => {
  const { priseAuVol } = await import('../src/jeu-calcul.js');
  it('UK attend tant que l’Ukraine reste à trouver', () => {
    expect(priseAuVol('uk', entreesFr)).toBeNull();
    expect(priseAuVol('ukraine', entreesFr)).toBe('UA');
    expect(priseAuVol('uk', entreesFr, ['UA'])).toBe('GB');
  });

  it('Niger, Guinée, Soudan, Congo attendent la suite ou Entrée', () => {
    expect(priseAuVol('niger', entreesFr)).toBeNull();
    expect(priseAuVol('nigeria', entreesFr)).toBe('NG');
    expect(priseAuVol('niger', entreesFr, ['NG'])).toBe('NE');
    expect(priseAuVol('guinee', entreesFr)).toBeNull();
    expect(priseAuVol('soudan', entreesFr)).toBeNull();
    expect(priseAuVol('congo', entreesFr)).toBeNull();
    expect(priseAuVol('dominica', entreesEn, [], 'en')).toBeNull();
  });

  it('un pays déjà trouvé ne coupe pas la saisie', () => {
    expect(priseAuVol('uk', entreesFr, ['GB'])).toBeNull();
    expect(priseAuVol('france', entreesFr, ['FR'])).toBeNull();
    expect(priseAuVol('france', entreesFr)).toBe('FR');
  });
});
