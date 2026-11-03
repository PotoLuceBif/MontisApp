// Calcul pur de la portée de vol : aucune dépendance au navigateur, pour pouvoir le tester.

// 16 directions (dont les « sauts de cavalier ») : l'écart avec la ligne droite reste sous 3 %,
// contre 8 % avec les seules 8 cases voisines. Un saut long traverse d'autres cellules : elles
// doivent être franchissables aussi, sinon la voile passerait à travers une crête fine.
// `traversees` : cellules coupées par le segment ; `une` : il suffit d'une (coin d'une diagonale).
const VOISINS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
].map(([di, dj]) => {
  let traversees = [];
  let une = false;
  if (Math.abs(di) === 1 && Math.abs(dj) === 1) {
    traversees = [[di, 0], [0, dj]];
    une = true;
  } else if (Math.abs(di) === 2) {
    traversees = [[di / 2, 0], [di / 2, dj]];
  } else if (Math.abs(dj) === 2) {
    traversees = [[0, dj / 2], [di, dj / 2]];
  }
  return { di, dj, longueur: Math.hypot(di, dj), traversees, une };
});

// File de priorité minimale (tas binaire) sur des indices de cellules
function creerTas(capacite) {
  let cles = new Float64Array(capacite);
  let valeurs = new Int32Array(capacite);
  let n = 0;
  const agrandir = () => {
    const c = new Float64Array(cles.length * 2);
    const v = new Int32Array(cles.length * 2);
    c.set(cles);
    v.set(valeurs);
    cles = c;
    valeurs = v;
  };
  return {
    get taille() {
      return n;
    },
    ajouter(valeur, cle) {
      if (n === cles.length) agrandir();
      let k = n++;
      while (k > 0) {
        const parent = (k - 1) >> 1;
        if (cles[parent] <= cle) break;
        cles[k] = cles[parent];
        valeurs[k] = valeurs[parent];
        k = parent;
      }
      cles[k] = cle;
      valeurs[k] = valeur;
    },
    extraire() {
      const sommet = valeurs[0];
      n -= 1;
      const cle = cles[n];
      const valeur = valeurs[n];
      let k = 0;
      for (;;) {
        let enfant = 2 * k + 1;
        if (enfant >= n) break;
        if (enfant + 1 < n && cles[enfant + 1] < cles[enfant]) enfant += 1;
        if (cles[enfant] >= cle) break;
        cles[k] = cles[enfant];
        valeurs[k] = valeurs[enfant];
        k = enfant;
      }
      cles[k] = cle;
      valeurs[k] = valeur;
      return sommet;
    },
  };
}

// Chemin le plus court en vol plané (Dijkstra) sur une grille N × N d'altitudes `sol`.
// Renvoie, pour chaque cellule, la distance parcourue (`dist`), la finesse minimale exigée
// sur le chemin (`fmin`) et si elle est atteinte (`fige`).
export function cheminsPlanes({ sol, N, tailleCell, depart, h0, finesse, rayonM }) {
  const dist = new Float32Array(N * N).fill(Infinity);
  const fmin = new Float32Array(N * N);
  const fige = new Uint8Array(N * N);
  const tas = creerTas(N * N);
  const passe = (d, dh) => dh > 0 && d / dh <= finesse;
  dist[depart] = 0;
  tas.ajouter(depart, 0);
  while (tas.taille) {
    const idx = tas.extraire();
    if (fige[idx]) continue;
    fige[idx] = 1;
    const i = idx % N;
    const j = (idx - i) / N;
    const d0 = dist[idx];
    for (const { di, dj, longueur, traversees, une } of VOISINS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const voisin = nj * N + ni;
      if (fige[voisin]) continue;
      const d = d0 + longueur * tailleCell;
      if (d > rayonM || !(d < dist[voisin])) continue;
      const dh = h0 - sol[voisin];
      if (!passe(d, dh)) continue; // la voile toucherait le sol
      if (traversees.length) {
        // Hauteur jugée en fin de segment : un peu prudent pour les cellules intermédiaires
        let passees = 0;
        for (const [ti, tj] of traversees) if (passe(d, h0 - sol[(j + tj) * N + i + ti])) passees++;
        if (une ? passees === 0 : passees < traversees.length) continue;
      }
      dist[voisin] = d;
      fmin[voisin] = Math.max(fmin[idx], d / dh);
      tas.ajouter(voisin, d);
    }
  }
  return { dist, fmin, fige };
}
