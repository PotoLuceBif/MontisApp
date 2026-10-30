import * as maplibregl from 'maplibre-gl';

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const MAX_KM = 40;
const PAS_M = 50;
const NB_RAYONS = 1440;
const TAILLE_MAX_GRILLE = 400;
const CLE_FINESSE = 'montis.finesse';

// Couleurs selon la hauteur au-dessus du sol (m) : rouge → bleu
const PALIERS = [
  [0, [229, 57, 53]],
  [50, [251, 140, 0]],
  [150, [253, 216, 53]],
  [300, [38, 166, 154]],
  [600, [30, 91, 216]],
];

function couleurAgl(h) {
  if (h <= PALIERS[0][0]) return PALIERS[0][1];
  for (let i = 1; i < PALIERS.length; i++) {
    if (h <= PALIERS[i][0]) {
      const [ha, ca] = PALIERS[i - 1];
      const [hb, cb] = PALIERS[i];
      const t = (h - ha) / (hb - ha);
      return [0, 1, 2].map((k) => Math.round(ca[k] + (cb[k] - ca[k]) * t));
    }
  }
  return PALIERS[PALIERS.length - 1][1];
}

// ---------- Lecture des altitudes (tuiles du relief décodées à la main) ----------
const cache = new Map();
const pret = new Map();
let derTx = -1;
let derTy = -1;
let derZ = -1;
let derData = null;

function tuileXY(lon, lat, z) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

function chargerTuile(z, x, y) {
  const cle = `${z}/${x}/${y}`;
  if (!cache.has(cle)) {
    cache.set(
      cle,
      (async () => {
        try {
          const url = DEM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
          const rep = await fetch(url);
          if (!rep.ok) throw new Error(`erreur ${rep.status}`);
          const bmp = await createImageBitmap(await rep.blob());
          const c = document.createElement('canvas');
          c.width = c.height = 256;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(bmp, 0, 0);
          pret.set(cle, ctx.getImageData(0, 0, 256, 256).data);
        } catch (err) {
          console.warn('Relief indisponible pour la tuile', cle, err);
          pret.set(cle, null);
        }
      })()
    );
  }
  return cache.get(cle);
}

async function preparerTuiles(lon, lat, rayonM, z) {
  const dLat = rayonM / 111320;
  const dLon = rayonM / (111320 * Math.cos((lat * Math.PI) / 180));
  const a = tuileXY(lon - dLon, lat + dLat, z);
  const b = tuileXY(lon + dLon, lat - dLat, z);
  const promesses = [];
  for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++) {
    for (let y = Math.floor(a.y); y <= Math.floor(b.y); y++) {
      promesses.push(chargerTuile(z, x, y));
    }
  }
  await Promise.all(promesses);
  derTx = -1; // on repart d'un cache de lecture propre
}

function altitude(lon, lat, z) {
  const { x, y } = tuileXY(lon, lat, z);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx !== derTx || ty !== derTy || z !== derZ) {
    derTx = tx;
    derTy = ty;
    derZ = z;
    derData = pret.get(`${z}/${tx}/${ty}`) || null;
  }
  if (!derData) return 0;
  const px = Math.min(255, Math.floor((x - tx) * 256));
  const py = Math.min(255, Math.floor((y - ty) * 256));
  const i = (py * 256 + px) * 4;
  return derData[i] * 256 + derData[i + 1] + derData[i + 2] / 256 - 32768; // encodage « terrarium »
}

// ---------- Calcul de la zone atteignable ----------
async function calculerPortee(lon, lat, finesse, h0) {
  const rayonM = Math.max(500, Math.min(MAX_KM * 1000, h0 * finesse));
  const z = rayonM <= 12000 ? 12 : 11;
  await preparerTuiles(lon, lat, rayonM, z);

  const kLat = 111320;
  const kLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const nPas = Math.floor(rayonM / PAS_M);

  // 1) Pour chaque rayon : finesse minimale nécessaire pour atteindre chaque pas
  const tables = new Array(NB_RAYONS);
  const longueurs = new Int32Array(NB_RAYONS);
  for (let r = 0; r < NB_RAYONS; r++) {
    const cap = (2 * Math.PI * r) / NB_RAYONS;
    const sx = Math.sin(cap);
    const cy = Math.cos(cap);
    const tab = new Float32Array(nPas);
    let fmax = 0;
    let n = 0;
    for (let k = 1; k <= nPas; k++) {
      const d = k * PAS_M;
      const sol = altitude(lon + (d * sx) / kLon, lat + (d * cy) / kLat, z);
      const dh = h0 - sol;
      if (dh <= 0) break; // le relief est plus haut que le départ
      const freq = d / dh;
      if (freq > fmax) fmax = freq;
      if (fmax > finesse) break; // hors de portée avec cette finesse
      tab[k - 1] = fmax;
      n = k;
    }
    tables[r] = tab;
    longueurs[r] = n;
  }

  // 2) Grille de cellules (une cellule = un pixel de l'image)
  const tailleCell = Math.max(40, (2 * rayonM) / TAILLE_MAX_GRILLE);
  const N = Math.ceil((2 * rayonM) / tailleCell);
  const dLat = tailleCell / kLat;
  const dLon = tailleCell / kLon;
  const west = lon - (N * dLon) / 2;
  const north = lat + (N * dLat) / 2;
  const east = west + N * dLon;
  const south = north - N * dLat;

  const agl = new Float32Array(N * N).fill(NaN);
  const fmin = new Float32Array(N * N);
  const solGrille = new Float32Array(N * N);
  const dist = new Float32Array(N * N);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(N, N);

  let nb = 0;
  let dMax = 0;
  let capMax = 0;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const lo = west + (i + 0.5) * dLon;
      const la = north - (j + 0.5) * dLat;
      const dx = (lo - lon) * kLon;
      const dy = (la - lat) * kLat;
      const d = Math.hypot(dx, dy);
      const k = Math.max(1, Math.round(d / PAS_M));
      if (k > nPas) continue;
      let b = Math.atan2(dx, dy);
      if (b < 0) b += 2 * Math.PI;
      const r = Math.round((b / (2 * Math.PI)) * NB_RAYONS) % NB_RAYONS;
      if (k > longueurs[r]) continue;

      const sol = altitude(lo, la, z);
      const hauteur = h0 - d / finesse - sol; // hauteur de la voile au-dessus du sol
      if (hauteur < 0) continue;

      const idx = j * N + i;
      agl[idx] = hauteur;
      fmin[idx] = tables[r][k - 1];
      solGrille[idx] = sol;
      dist[idx] = d;
      nb++;
      if (d > dMax) {
        dMax = d;
        capMax = (b * 180) / Math.PI;
      }

      const [rr, gg, bb] = couleurAgl(hauteur);
      const p = idx * 4;
      img.data[p] = rr;
      img.data[p + 1] = gg;
      img.data[p + 2] = bb;
      img.data[p + 3] = 255;
    }
  }

  if (nb === 0) return { vide: true };

  ctx.putImageData(img, 0, 0);

  return {
    vide: false,
    url: canvas.toDataURL('image/png'),
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    grille: { N, west, north, dLon, dLat, agl, fmin, sol: solGrille, dist },
    dMax,
    capMax,
    aireKm2: (nb * tailleCell * tailleCell) / 1e6,
  };
}

// ---------- Interface ----------
export function initPortee(map, conteneur, { onChoisirPoint } = {}) {
  conteneur.innerHTML = `
    <div class="outil">
      <h4>📏 Hike & Fly : portée en vol plané</h4>
      <label>Finesse <input id="pt-finesse" type="number" min="2" max="20" step="0.5" value="8"></label>
      <label>Altitude du sol (m) <input id="pt-sol" type="number" step="10"></label>
      <label>Hauteur au-dessus du sol (m) <input id="pt-haut" type="number" min="0" step="50" value="0"></label>
      <button id="pt-choisir">📍 Choisir le point de départ</button>
      <button id="pt-effacer">Effacer</button>
      <p id="pt-resultat">Choisis un point de départ.</p>
      <div class="pt-legende">
        <div class="pt-degrade"></div>
        <div class="pt-echelle"><span>0 m</span><span>600 m +</span></div>
        <small>Hauteur au-dessus du sol (survole la zone pour le détail)</small>
      </div>
      <p class="note">Calcul théorique, en air calme, en ligne droite, sans thermique ni vent.
      Utilise une finesse réaliste (finesse sol), pas celle du constructeur. Ce n'est pas un outil de décision de vol.
      Pour une transition en vol, ajoute la hauteur de départ au-dessus du sol.</p>
    </div>
  `;

  const inFinesse = conteneur.querySelector('#pt-finesse');
  const inSol = conteneur.querySelector('#pt-sol');
  const inHaut = conteneur.querySelector('#pt-haut');
  const resultat = conteneur.querySelector('#pt-resultat');

  try {
    const memo = localStorage.getItem(CLE_FINESSE);
    if (memo) inFinesse.value = memo;
  } catch {
    /* stockage indisponible : on ignore */
  }

  const infobulle = document.createElement('div');
  infobulle.className = 'pt-infobulle';
  document.body.appendChild(infobulle);

  let point = null;
  let marqueur = null;
  let attente = false;
  let compteur = 0;
  let grille = null;
  let h0 = 0;
  let finesseCalc = 8;

  function afficherImage(url, coordinates) {
    const src = map.getSource('portee');
    if (src) {
      src.updateImage({ url, coordinates });
      return;
    }
    map.addSource('portee', { type: 'image', url, coordinates });
    map.addLayer({
      id: 'portee-image',
      type: 'raster',
      source: 'portee',
      paint: { 'raster-opacity': 0.65, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
    });
  }

  function effacerImage() {
    if (map.getLayer('portee-image')) map.removeLayer('portee-image');
    if (map.getSource('portee')) map.removeSource('portee');
  }

  function masquerInfo() {
    infobulle.style.display = 'none';
  }

  function afficherInfo(e) {
    if (!grille) return masquerInfo();
    const g = grille;
    const i = Math.floor((e.lngLat.lng - g.west) / g.dLon);
    const j = Math.floor((g.north - e.lngLat.lat) / g.dLat);
    if (i < 0 || j < 0 || i >= g.N || j >= g.N) return masquerInfo();
    const idx = j * g.N + i;
    const agl = g.agl[idx];
    if (Number.isNaN(agl)) return masquerInfo();
    infobulle.innerHTML =
      `Hauteur / sol : <b>${Math.round(agl)} m</b><br>` +
      `Altitude : <b>${Math.round(g.sol[idx] + agl)} m</b><br>` +
      `Finesse mini : <b>${g.fmin[idx].toFixed(1)}</b><br>` +
      `Distance : ${(g.dist[idx] / 1000).toFixed(1)} km`;
    infobulle.style.left = `${e.originalEvent.clientX + 14}px`;
    infobulle.style.top = `${e.originalEvent.clientY + 14}px`;
    infobulle.style.display = 'block';
  }

  function reinitialiser() {
    point = null;
    attente = false;
    compteur++;
    grille = null;
    masquerInfo();
    map.getCanvas().style.cursor = '';
    if (marqueur) marqueur.remove();
    effacerImage();
    resultat.textContent = 'Choisis un point de départ.';
  }

  conteneur.querySelector('#pt-choisir').addEventListener('click', () => {
    attente = true;
    map.getCanvas().style.cursor = 'crosshair';
    resultat.textContent = 'Clique sur la carte pour placer le point de départ.';
    onChoisirPoint?.();
  });
  conteneur.querySelector('#pt-effacer').addEventListener('click', reinitialiser);

  map.on('click', async (e) => {
    if (!attente) {
      afficherInfo(e); // sur téléphone : un appui affiche le détail
      return;
    }
    attente = false;
    map.getCanvas().style.cursor = '';
    point = [e.lngLat.lng, e.lngLat.lat];
    if (!marqueur) marqueur = new maplibregl.Marker({ color: '#5a1fc0' });
    marqueur.setLngLat(point).addTo(map);
    resultat.textContent = 'Lecture du relief…';
    await preparerTuiles(point[0], point[1], 200, 12);
    inSol.value = Math.round(altitude(point[0], point[1], 12));
    recalculer();
  });
  map.on('mousemove', afficherInfo);
  map.on('mouseout', masquerInfo);

  inFinesse.addEventListener('change', () => {
    try {
      localStorage.setItem(CLE_FINESSE, inFinesse.value);
    } catch {
      /* ignoré */
    }
    recalculer();
  });
  inSol.addEventListener('change', recalculer);
  inHaut.addEventListener('change', recalculer);

  async function recalculer() {
    if (!point) return;
    const finesse = parseFloat(inFinesse.value);
    const sol = parseFloat(inSol.value);
    const haut = parseFloat(inHaut.value) || 0;
    if (!(finesse > 1) || isNaN(sol)) {
      resultat.textContent = 'Renseigne une finesse et une altitude valides.';
      return;
    }
    const mon = ++compteur;
    resultat.textContent = 'Calcul en cours…';
    try {
      const res = await calculerPortee(point[0], point[1], finesse, sol + haut);
      if (mon !== compteur) return;
      if (res.vide) {
        grille = null;
        effacerImage();
        resultat.textContent = 'Aucune zone atteignable depuis ce point avec cette finesse.';
        return;
      }
      grille = res.grille;
      h0 = sol + haut;
      finesseCalc = finesse;
      afficherImage(res.url, res.coordinates);
      resultat.textContent =
        `Portée max : ${(res.dMax / 1000).toFixed(1)} km (cap ${Math.round(res.capMax)}°) · ` +
        `surface : ${res.aireKm2.toFixed(0)} km²`;
    } catch (err) {
      console.warn('Portée :', err);
      resultat.textContent = 'Erreur de calcul (voir la console).';
    }
  }

  return { reinitialiser };
}