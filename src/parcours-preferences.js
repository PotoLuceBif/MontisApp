// Préférences de routage (« Privilégier ») : jamais une interdiction, seulement un coût.
// Une voie qui ne correspond à aucune préférence cochée coûte PENALITE fois sa longueur,
// une grande route un peu plus : si elle est le seul passage, le tracé la prend quand même.
// Le profil BRouter standard est complété de variables montis_*, réglées par l'adresse de la requête.

export const PREFERENCES = {
  sentiers: { cle: 'preference.sentiers', valhalla: { pedestrian: { walkway_factor: 0.6 }, bicycle: { use_roads: 0.2 } } },
  chemins: { cle: 'preference.chemins', valhalla: { pedestrian: { use_tracks: 1 }, bicycle: { avoid_bad_surfaces: 0 } } },
  balises: { cle: 'preference.balises', valhalla: { pedestrian: { walkway_factor: 0.8 } } },
  routes: { cle: 'preference.routes', valhalla: { pedestrian: { use_living_streets: 0.8 }, bicycle: { use_roads: 0.6 } } },
  cyclables: { cle: 'preference.cyclables', valhalla: { bicycle: { use_roads: 0.1 } } },
};

const PENALITE = 2.5;

// Réglages propres à une pratique, toujours envoyés avec elle (pratique.reglages)
export const REGLAGES_PRATIQUE = { skitour: true };
const COUT_TRACE_SKI = 0.7;

// Ne garde que des préférences connues, sans doublon, dans l'ordre de la liste proposée
export function nettoyerPreferences(valeur, proposees = Object.keys(PREFERENCES)) {
  const choisies = new Set(Array.isArray(valeur) ? valeur : []);
  return proposees.filter((id) => PREFERENCES[id] && choisies.has(id));
}

export function parametresBrouter(preferences, reglages = []) {
  const choisis = [...nettoyerPreferences(preferences), ...reglages.filter((id) => REGLAGES_PRATIQUE[id])];
  return Object.fromEntries(choisis.map((id) => [`profile:montis_${id}`, '1']));
}

// Les options de Valhalla se cumulent : la plus forte préférence gagne (valeur la plus basse pour un facteur)
export function optionsValhalla(base, preferences) {
  const costing = base?.costing;
  const options = { ...(base?.costing_options?.[costing] ?? {}) };
  for (const id of nettoyerPreferences(preferences)) {
    for (const [cle, valeur] of Object.entries(PREFERENCES[id].valhalla[costing] ?? {})) {
      const plusFort = cle === 'use_tracks' || cle === 'use_living_streets' ? Math.max : Math.min;
      options[cle] = cle in options ? plusFort(options[cle], valeur) : valeur;
    }
  }
  if (!Object.keys(options).length) return base;
  return { ...base, costing_options: { ...(base.costing_options ?? {}), [costing]: options } };
}

const BLOC_WAY = `
assign montis_revetu surface=paved|asphalt|concrete|paving_stones|sett|cobblestone
assign montis_grande highway=motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link
assign montis_sentier and highway=path|footway|bridleway|steps not montis_revetu
assign montis_chemin and ( not montis_revetu ) ( or highway=track and ( not surface= ) ( not or montis_grande highway=path|footway|bridleway|steps ) )
assign montis_petite and ( not montis_grande ) highway=tertiary|tertiary_link|unclassified|residential|living_street|service|road|track
assign montis_balise or route_hiking_iwn=yes or route_hiking_nwn=yes or route_hiking_rwn=yes route_hiking_lwn=yes
assign montis_tour piste:type=skitour
assign montis_cyclable or highway=cycleway or route_bicycle_icn=yes or route_bicycle_ncn=yes or route_bicycle_rcn=yes route_bicycle_lcn=yes
assign montis_actif or montis_sentiers or montis_chemins or montis_routes or montis_balises montis_cyclables
assign montis_ok
  or and montis_sentiers montis_sentier
  or and montis_chemins montis_chemin
  or and montis_routes montis_petite
  or and montis_balises montis_balise
     and montis_cyclables montis_cyclable
assign montis_facteur
  if not montis_actif then 1
  else if montis_ok then 1
  else if montis_grande then multiply 1.6 montis_penalite
  else montis_penalite
`;

const COUTS = { costfactor: 'montis_cf', uphillcostfactor: 'montis_up', downhillcostfactor: 'montis_down' };

// Profil BRouter standard → profil Montis : ses coûts de voie sont multipliés par montis_facteur
export function profilMontis(base) {
  // Les fichiers récupérés sous Windows ont des fins de ligne CRLF
  const texte = String(base).split(/\r?\n/).map((ligne) => ligne.replace(/#.*$/, '').trimEnd()).filter(Boolean).join('\n');
  const iGlobal = texte.indexOf('---context:global');
  const iWay = texte.indexOf('---context:way');
  const iNode = texte.indexOf('---context:node');
  if (iGlobal < 0 || iWay < iGlobal || iNode < iWay) throw new Error('Profil BRouter inattendu');
  const finGlobal = texte.indexOf('\n', iGlobal) + 1;
  const debutWay = texte.indexOf('\n', iWay) + 1;
  const debutNode = texte.lastIndexOf('\n', iNode) + 1;
  let way = texte.slice(debutWay, debutNode);
  const presents = Object.keys(COUTS).filter((nom) => new RegExp(`assign\\s+${nom}\\b`).test(way));
  if (!presents.includes('costfactor')) throw new Error('Profil BRouter sans costfactor');
  for (const nom of presents) way = way.replace(new RegExp(`\\b${nom}\\b`, 'g'), COUTS[nom]);
  const globaux = `${[...Object.keys(PREFERENCES), ...Object.keys(REGLAGES_PRATIQUE)].map((id) => `assign montis_${id} 0`).join('\n')}\nassign montis_penalite ${PENALITE}\n`;
  const couts = presents.map((nom) => {
    const calcul = `if greater ${COUTS[nom]} 9997 then ${COUTS[nom]} else multiply ${COUTS[nom]} montis_facteur`;
    // Ski de rando : une trace de ski de rando d'OSM passe avant tout, même sans chemin dessous
    return nom === 'costfactor' ? `assign ${nom} if and montis_skitour montis_tour then ${COUT_TRACE_SKI} else ${calcul}` : `assign ${nom} ${calcul}`;
  }).join('\n');
  return `${texte.slice(0, finGlobal)}${globaux}${texte.slice(finGlobal, debutWay)}${way}${BLOC_WAY.trim()}\n${couts}\n${texte.slice(debutNode)}`;
}
