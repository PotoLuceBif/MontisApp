// Profil d'altitude (lu dans les tuiles de relief), dénivelé, durée, export GPX

// ---------- Lecture des altitudes dans les tuiles de relief ----------
const tuiles = new Map();

function tuile(z, x, y) {
  const cle = `${z}/${x}/${y}`;
  if (!tuiles.has(cle)) {
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        resolve(g.getImageData(0, 0, 256, 256).data);
      };
      img.onerror = () => reject(new Error('Tuile de relief indisponible'));
      img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
    });
    p.catch(() => tuiles.delete(cle));
    tuiles.set(cle, p);
    if (tuiles.size > 120) tuiles.delete(tuiles.keys().next().value);
  }
  return tuiles.get(cle);
}

function position(lng, lat, z) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return {
    xf: ((lng + 180) / 360) * n,
    yf: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n,
  };
}

// Altitude interpolée entre les quatre pixels voisins
async function altitude(lng, lat, z) {
  const { xf, yf } = position(lng, lat, z);
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  const donnees = await tuile(z, x, y);

  const fx = (xf - x) * 256 - 0.5;
  const fy = (yf - y) * 256 - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const v = (px, py) => {
    const i = (Math.min(255, Math.max(0, py)) * 256 + Math.min(255, Math.max(0, px))) * 4;
    return donnees[i] * 256 + donnees[i + 1] + donnees[i + 2] / 256 - 32768; // encodage « terrarium »
  };
  return (
    v(x0, y0) * (1 - tx) * (1 - ty) +
    v(x0 + 1, y0) * tx * (1 - ty) +
    v(x0, y0 + 1) * (1 - tx) * ty +
    v(x0 + 1, y0 + 1) * tx * ty
  );
}

// Plus l'itinéraire est long, plus on prend des tuiles grossières (moins de téléchargements)
const zoomPour = (total) => (total < 15000 ? 13 : total < 120000 ? 12 : 11);

export async function altitudesDuTrace(points, total) {
  const z = zoomPour(total);
  const cles = new Map();
  for (const p of points) {
    const { xf, yf } = position(p.lng, p.lat, z);
    const x = Math.floor(xf);
    const y = Math.floor(yf);
    cles.set(`${x}/${y}`, [x, y]);
  }

  // On charge les tuiles nécessaires, six à la fois
  const aCharger = [...cles.values()];
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < aCharger.length) {
      const [x, y] = aCharger[suivant++];
      await tuile(z, x, y);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, aCharger.length) }, ouvrier));

  return Promise.all(points.map((p) => altitude(p.lng, p.lat, z)));
}

// ---------- Calculs ----------
export function lisser(alts, fenetre = 2) {
  return alts.map((_, i) => {
    let somme = 0;
    let n = 0;
    for (let j = Math.max(0, i - fenetre); j <= Math.min(alts.length - 1, i + fenetre); j++) {
      somme += alts[j];
      n++;
    }
    return somme / n;
  });
}

// Dénivelé cumulé, en ignorant les variations inférieures au seuil (bruit des données)
export function denivele(alts, seuil = 3) {
  let ref = alts[0];
  let plus = 0;
  let moins = 0;
  for (let i = 1; i < alts.length; i++) {
    const ecart = alts[i] - ref;
    if (ecart >= seuil) {
      plus += ecart;
      ref = alts[i];
    } else if (ecart <= -seuil) {
      moins += -ecart;
      ref = alts[i];
    }
  }
  return { plus, moins };
}

// Estimation indicative : 4 km/h à plat, 300 m/h en montée, 500 m/h en descente (méthode type DIN 33466)
export function dureeEstimee(distanceMetres, plus, moins) {
  const horizontal = distanceMetres / 1000 / 4;
  const vertical = plus / 300 + moins / 500;
  return Math.max(horizontal, vertical) + Math.min(horizontal, vertical) / 2;
}

export function formaterDuree(heures) {
  const minutes = Math.max(5, Math.round((heures * 60) / 5) * 5);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

// ---------- Export GPX ----------
const echapper = (s) =>
  String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

const nomFichier = (nom) =>
  nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'itineraire';

export function telechargerGpx(nom, points, alts) {
  const trkpts = points
    .map((p, i) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><ele>${Math.round(alts[i])}</ele></trkpt>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Montis" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${echapper(nom)}</name>
    <desc>Tracé : © contributeurs OpenStreetMap (ODbL). Altitudes : tuiles de relief, approximatives.</desc>
  </metadata>
  <trk>
    <name>${echapper(nom)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
  const blob = new Blob([xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomFichier(nom)}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Profil d'altitude (graphique SVG interactif) ----------
const NS = 'http://www.w3.org/2000/svg';

function svgEl(nom, attributs = {}, texte) {
  const e = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attributs)) e.setAttribute(k, v);
  if (texte != null) e.textContent = texte;
  return e;
}

// profil = { points, alts, total } ; surSurvol(point | null) est appelé quand on survole le graphique
export function creerProfil(profil, surSurvol) {
  const { points, alts, total } = profil;
  const L = 600;
  const H = 150;
  const G = 46; // marge gauche (étiquettes d'altitude)
  const D = 8;
  const Ht = 10;
  const B = 20; // marge basse (étiquettes de distance)

  const min = Math.min(...alts);
  const max = Math.max(...alts);
  const marge = Math.max(10, (max - min) * 0.08);
  const bas = Math.floor((min - marge) / 10) * 10;
  const haut = Math.ceil((max + marge) / 10) * 10;

  const x = (d) => G + (d / total) * (L - G - D);
  const y = (a) => Ht + (1 - (a - bas) / (haut - bas)) * (H - Ht - B);

  const boite = document.createElement('div');
  boite.className = 'rando-profil';
  const info = document.createElement('div');
  info.className = 'rando-profil-info';
  const texteInitial = 'Survolez le profil pour lire la distance et l’altitude';
  info.textContent = texteInitial;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${L} ${H}`,
    class: 'rando-profil-svg',
    role: 'img',
    'aria-label': 'Profil d’altitude',
  });

  // Grille horizontale et étiquettes d'altitude
  for (const v of [bas, (bas + haut) / 2, haut]) {
    svg.append(
      svgEl('line', { x1: G, x2: L - D, y1: y(v), y2: y(v), class: 'prof-grille' }),
      svgEl('text', { x: G - 6, y: y(v) + 3, 'text-anchor': 'end', class: 'prof-texte' }, `${Math.round(v)} m`)
    );
  }

  // Repères de distance
  const pasKm = [1, 2, 5, 10, 20, 50, 100, 200].find((p) => total / 1000 / p <= 6) || 500;
  for (let km = 0; km * 1000 <= total; km += pasKm) {
    svg.append(
      svgEl('text', { x: x(km * 1000), y: H - 5, 'text-anchor': km === 0 ? 'start' : 'middle', class: 'prof-texte' }, `${km} km`)
    );
  }

  // Courbe et surface
  const pts = points.map((p, i) => `${x(p.d).toFixed(1)},${y(alts[i]).toFixed(1)}`);
  svg.append(svgEl('path', { d: `M${x(0)},${y(bas)} L${pts.join(' L')} L${x(total)},${y(bas)} Z`, class: 'prof-aire' }));
  svg.append(svgEl('path', { d: `M${pts.join(' L')}`, class: 'prof-ligne', fill: 'none' }));

  // Curseur de survol
  const trait = svgEl('line', { y1: Ht, y2: H - B, class: 'prof-curseur', visibility: 'hidden' });
  const rond = svgEl('circle', { r: 4, class: 'prof-point', visibility: 'hidden' });
  svg.append(trait, rond);

  const survol = (e) => {
    const r = svg.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * L;
    const frac = Math.min(1, Math.max(0, (fx - G) / (L - G - D)));
    const i = Math.round(frac * (points.length - 1));
    const p = points[i];
    trait.setAttribute('x1', x(p.d));
    trait.setAttribute('x2', x(p.d));
    rond.setAttribute('cx', x(p.d));
    rond.setAttribute('cy', y(alts[i]));
    trait.setAttribute('visibility', 'visible');
    rond.setAttribute('visibility', 'visible');
    info.textContent =
      `${(p.d / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km · ` +
      `${Math.round(alts[i]).toLocaleString('fr-FR')} m`;
    surSurvol(p);
  };
  const sortie = () => {
    trait.setAttribute('visibility', 'hidden');
    rond.setAttribute('visibility', 'hidden');
    info.textContent = texteInitial;
    surSurvol(null);
  };
  svg.addEventListener('pointermove', survol);
  svg.addEventListener('pointerdown', survol);
  svg.addEventListener('pointerleave', sortie);

  boite.append(info, svg);
  return boite;
}
