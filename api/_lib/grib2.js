// Lecture des fichiers GRIB2 de la NOAA (GFS, grille régulière en latitude et longitude), côté relais.
// Gabarits de données 5.0 (simple) et 5.3 (groupes et différences spatiales, celui de GFS).
// Calculs purs, testés (tests/grib2.test.js).

function lecteurBits(octets) {
  let position = 0;
  return {
    lire(n) {
      let valeur = 0;
      for (let i = 0; i < n; i += 1) {
        const octet = octets[position >> 3];
        valeur = valeur * 2 + ((octet >> (7 - (position & 7))) & 1);
        position += 1;
      }
      return valeur;
    },
    alignerOctet() {
      position = Math.ceil(position / 8) * 8;
    },
  };
}

// GRIB code le signe par son premier bit, pas en complément à deux
function signe(octets, i, n) {
  let valeur = octets[i] & 0x7f;
  for (let k = 1; k < n; k += 1) valeur = valeur * 256 + octets[i + k];
  return octets[i] & 0x80 ? -valeur : valeur;
}
const entier = (octets, i, n) => {
  let valeur = 0;
  for (let k = 0; k < n; k += 1) valeur = valeur * 256 + octets[i + k];
  return valeur;
};

// Gabarit 5.3 : valeurs rangées par groupes (référence, largeur, longueur), puis différences d'ordre 1 ou 2
function decoderGroupes(donnees, p) {
  const lecteur = lecteurBits(donnees);
  const premieres = [];
  let minimum = 0;
  if (p.ordre > 0) {
    for (let k = 0; k < p.ordre; k += 1) premieres.push(signe(Uint8Array.from({ length: p.octetsExtra }, () => lecteur.lire(8)), 0, p.octetsExtra));
    minimum = signe(Uint8Array.from({ length: p.octetsExtra }, () => lecteur.lire(8)), 0, p.octetsExtra);
  }
  const references = Array.from({ length: p.groupes }, () => lecteur.lire(p.bits));
  lecteur.alignerOctet();
  const largeurs = Array.from({ length: p.groupes }, () => p.refLargeur + lecteur.lire(p.bitsLargeur));
  lecteur.alignerOctet();
  const longueurs = Array.from({ length: p.groupes }, () => p.refLongueur + lecteur.lire(p.bitsLongueur) * p.pasLongueur);
  longueurs[p.groupes - 1] = p.derniereLongueur;
  lecteur.alignerOctet();
  if (p.manquants) throw new Error('GRIB2 : valeurs manquantes non prises en charge');
  const valeurs = new Float64Array(p.n);
  let k = 0;
  for (let g = 0; g < p.groupes; g += 1) {
    for (let i = 0; i < longueurs[g] && k < p.n; i += 1) valeurs[k++] = references[g] + (largeurs[g] ? lecteur.lire(largeurs[g]) : 0);
  }
  if (p.ordre === 1) {
    valeurs[0] = premieres[0];
    for (let i = 1; i < p.n; i += 1) valeurs[i] += minimum + valeurs[i - 1];
  } else if (p.ordre === 2) {
    valeurs[0] = premieres[0];
    valeurs[1] = premieres[1];
    for (let i = 2; i < p.n; i += 1) valeurs[i] += minimum + 2 * valeurs[i - 1] - valeurs[i - 2];
  }
  return valeurs;
}

// Tous les messages d'un fichier : grille (gabarit 3.0), paramètre (discipline, catégorie, numéro) et valeurs
export function lireGrib2(octets) {
  const messages = [];
  for (let debut = 0; debut + 16 <= octets.length;) {
    if (octets[debut] !== 0x47 || octets[debut + 1] !== 0x52 || octets[debut + 2] !== 0x49 || octets[debut + 3] !== 0x42) {
      throw new Error('GRIB2 : en-tête absent');
    }
    const total = entier(octets, debut + 8, 8);
    const message = { discipline: octets[debut + 6] };
    let paquet = null;
    let donnees = null;
    for (let i = debut + 16; i < debut + total - 4;) {
      const longueur = entier(octets, i, 4);
      const section = octets[i + 4];
      if (section === 1) {
        message.date = Date.UTC(entier(octets, i + 12, 2), octets[i + 14] - 1, octets[i + 15], octets[i + 16], octets[i + 17]);
      } else if (section === 3) {
        if (entier(octets, i + 12, 2) !== 0) throw new Error('GRIB2 : grille non régulière');
        message.ni = entier(octets, i + 30, 4);
        message.nj = entier(octets, i + 34, 4);
        message.lat1 = signe(octets, i + 46, 4) / 1e6;
        message.lon1 = signe(octets, i + 50, 4) / 1e6;
        message.lat2 = signe(octets, i + 55, 4) / 1e6;
        message.lon2 = signe(octets, i + 59, 4) / 1e6;
        message.balayage = octets[i + 71];
      } else if (section === 4) {
        message.categorie = octets[i + 9];
        message.numero = octets[i + 10];
      } else if (section === 5) {
        paquet = {
          n: entier(octets, i + 5, 4),
          gabarit: entier(octets, i + 9, 2),
          r: new DataView(octets.buffer, octets.byteOffset + i + 11, 4).getFloat32(0),
          e: signe(octets, i + 15, 2),
          d: signe(octets, i + 17, 2),
          bits: octets[i + 19],
        };
        if (paquet.gabarit === 3) {
          Object.assign(paquet, {
            manquants: octets[i + 22],
            groupes: entier(octets, i + 31, 4),
            refLargeur: octets[i + 35],
            bitsLargeur: octets[i + 36],
            refLongueur: entier(octets, i + 37, 4),
            pasLongueur: octets[i + 41],
            derniereLongueur: entier(octets, i + 42, 4),
            bitsLongueur: octets[i + 46],
            ordre: octets[i + 47],
            octetsExtra: octets[i + 48],
          });
        }
      } else if (section === 6) {
        if (octets[i + 5] !== 255) throw new Error('GRIB2 : masque de bits non pris en charge');
      } else if (section === 7) {
        donnees = octets.subarray(i + 5, i + longueur);
      }
      i += longueur;
    }
    if (!paquet || !donnees || !message.ni) throw new Error('GRIB2 : sections manquantes');
    let entiers;
    if (paquet.gabarit === 3) entiers = decoderGroupes(donnees, paquet);
    else if (paquet.gabarit === 0) {
      const lecteur = lecteurBits(donnees);
      entiers = Float64Array.from({ length: paquet.n }, () => (paquet.bits ? lecteur.lire(paquet.bits) : 0));
    } else throw new Error(`GRIB2 : gabarit de données ${paquet.gabarit} non pris en charge`);
    const facteur = 2 ** paquet.e;
    const diviseur = 10 ** paquet.d;
    message.valeurs = Float32Array.from(entiers, (x) => (paquet.r + x * facteur) / diviseur);
    messages.push(message);
    debut += total;
  }
  return messages;
}
