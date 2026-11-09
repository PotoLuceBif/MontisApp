// Décodeur FIT (format binaire des montres Garmin, Coros, Suunto, Wahoo), sans dépendance.
// Ne lit que ce dont Montis a besoin : points (message record), sport et date de création.

const EPOQUE_FIT = Date.UTC(1989, 11, 31); // les dates FIT comptent en secondes depuis cette date
const SEMICERCLE = 180 / 2 ** 31;

const MESSAGE = { fichier: 0, sport: 12, session: 18, point: 20 };

// Type de base (5 bits bas) : taille, lecture, valeur invalide
const TYPES = {
  0x00: { taille: 1, lire: (v, o) => v.getUint8(o), invalide: 0xff }, // enum
  0x01: { taille: 1, lire: (v, o) => v.getInt8(o), invalide: 0x7f },
  0x02: { taille: 1, lire: (v, o) => v.getUint8(o), invalide: 0xff },
  0x03: { taille: 2, lire: (v, o, le) => v.getInt16(o, le), invalide: 0x7fff },
  0x04: { taille: 2, lire: (v, o, le) => v.getUint16(o, le), invalide: 0xffff },
  0x05: { taille: 4, lire: (v, o, le) => v.getInt32(o, le), invalide: 0x7fffffff },
  0x06: { taille: 4, lire: (v, o, le) => v.getUint32(o, le), invalide: 0xffffffff },
  0x08: { taille: 4, lire: (v, o, le) => v.getFloat32(o, le), invalide: null },
  0x09: { taille: 8, lire: (v, o, le) => v.getFloat64(o, le), invalide: null },
  0x0a: { taille: 1, lire: (v, o) => v.getUint8(o), invalide: 0 },
  0x0b: { taille: 2, lire: (v, o, le) => v.getUint16(o, le), invalide: 0 },
  0x0c: { taille: 4, lire: (v, o, le) => v.getUint32(o, le), invalide: 0 },
};
const TYPE_TEXTE = 0x07;

function erreurFit() {
  const erreur = new Error('fit-invalide');
  erreur.code = 'invalide';
  return erreur;
}

function lireTexte(octets, debut, taille) {
  let fin = debut;
  while (fin < debut + taille && octets[fin] !== 0) fin++;
  return new TextDecoder().decode(octets.subarray(debut, fin)).trim();
}

// Renvoie { points: [{ t, lat, lng, alt, fc, cadence, puissance, temperature, vitesse }], sport, sousSport, nom, cree }
export function decoderFit(tampon) {
  const octets = tampon instanceof Uint8Array ? tampon : new Uint8Array(tampon);
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const resultat = { points: [], sport: null, sousSport: null, nom: null, cree: null };
  let position = 0;

  // Plusieurs fichiers FIT peuvent se suivre (fichiers chaînés)
  while (position + 12 <= octets.length) {
    const tailleEntete = octets[position];
    if (tailleEntete < 12 || position + tailleEntete > octets.length) break;
    if (lireTexte(octets, position + 8, 4) !== '.FIT') {
      if (position === 0) throw erreurFit();
      break;
    }
    const tailleDonnees = vue.getUint32(position + 4, true);
    const fin = Math.min(octets.length, position + tailleEntete + tailleDonnees);
    lireDonnees(octets, vue, position + tailleEntete, fin, resultat);
    position = fin + 2; // somme de contrôle finale
  }
  if (position === 0) throw erreurFit();
  return resultat;
}

function lireDonnees(octets, vue, debut, fin, resultat) {
  const definitions = new Map();
  let dernierHorodatage = null;
  let p = debut;

  while (p < fin) {
    const entete = octets[p++];
    let locale;
    let decalage = null;

    if (entete & 0x80) {
      // En-tête à horodatage compressé : message de données
      locale = (entete >> 5) & 0x03;
      decalage = entete & 0x1f;
    } else if (entete & 0x40) {
      // Message de définition
      locale = entete & 0x0f;
      const developpeur = (entete & 0x20) !== 0;
      if (p + 5 > fin) throw erreurFit();
      const petitBoutiste = octets[p + 1] === 0;
      const global = vue.getUint16(p + 2, petitBoutiste);
      const nombre = octets[p + 4];
      p += 5;
      const champs = [];
      for (let i = 0; i < nombre; i++) {
        champs.push({ numero: octets[p], taille: octets[p + 1], type: octets[p + 2] & 0x1f });
        p += 3;
      }
      let tailleDeveloppeur = 0;
      if (developpeur) {
        const nombreDev = octets[p++];
        for (let i = 0; i < nombreDev; i++) {
          tailleDeveloppeur += octets[p + 1];
          p += 3;
        }
      }
      if (p > fin) throw erreurFit();
      definitions.set(locale, { global, petitBoutiste, champs, tailleDeveloppeur });
      continue;
    } else {
      locale = entete & 0x0f;
    }

    const definition = definitions.get(locale);
    if (!definition) throw erreurFit();
    const valeurs = {};
    for (const champ of definition.champs) {
      if (p + champ.taille > fin) throw erreurFit();
      if (champ.type === TYPE_TEXTE) {
        valeurs[champ.numero] = lireTexte(octets, p, champ.taille);
      } else {
        const type = TYPES[champ.type];
        // Un champ tableau (taille plus grande que son type) ne sert pas à Montis
        if (type && champ.taille === type.taille) {
          const valeur = type.lire(vue, p, definition.petitBoutiste);
          if (valeur !== type.invalide && !Number.isNaN(valeur)) valeurs[champ.numero] = valeur;
        }
      }
      p += champ.taille;
    }
    p += definition.tailleDeveloppeur;

    // Horodatage : champ 253, ou 5 bits de l'en-tête compressé ajoutés au dernier connu
    if (valeurs[253] != null) {
      dernierHorodatage = valeurs[253];
    } else if (decalage != null && dernierHorodatage != null) {
      const bas = dernierHorodatage & 0x1f;
      dernierHorodatage = dernierHorodatage - bas + decalage + (decalage >= bas ? 0 : 0x20);
      valeurs[253] = dernierHorodatage;
    }

    traiterMessage(definition.global, valeurs, resultat);
  }
}

const date = (secondes) => EPOQUE_FIT + secondes * 1000;

function traiterMessage(global, v, resultat) {
  if (global === MESSAGE.point) {
    if (v[0] == null || v[1] == null) return; // sans position (GPS pas encore accroché)
    const altitude = v[78] ?? v[2];
    const vitesse = v[73] ?? v[6];
    resultat.points.push({
      t: v[253] != null ? date(v[253]) : null,
      lat: v[0] * SEMICERCLE,
      lng: v[1] * SEMICERCLE,
      alt: altitude != null ? altitude / 5 - 500 : null,
      fc: v[3] ?? null,
      cadence: v[4] ?? null,
      puissance: v[7] ?? null,
      temperature: v[13] ?? null,
      vitesse: vitesse != null ? vitesse / 1000 : null,
    });
  } else if (global === MESSAGE.sport) {
    resultat.sport ??= v[0] ?? null;
    resultat.sousSport ??= v[1] ?? null;
    if (v[3]) resultat.nom ??= v[3];
  } else if (global === MESSAGE.session) {
    resultat.sport ??= v[5] ?? null;
    resultat.sousSport ??= v[6] ?? null;
  } else if (global === MESSAGE.fichier) {
    if (v[4] != null) resultat.cree ??= date(v[4]);
  }
}
