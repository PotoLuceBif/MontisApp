# Graph Report - MontisApp  (2026-11-06)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1033 nodes · 3360 edges · 30 communities
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b8cf8e28`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29

## God Nodes (most connected - your core abstractions)
1. `t()` - 216 edges
2. `creerEditeurParcours()` - 68 edges
3. `ecrire()` - 67 edges
4. `creerCarteVent()` - 59 edges
5. `lire()` - 53 edges
6. `creerActiviteSki()` - 49 edges
7. `creerActiviteParcours()` - 42 edges
8. `formatAltitude()` - 40 edges
9. `ta()` - 37 edges
10. `creerConditionsLocales()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `localeCarte()` --calls--> `t()`  [EXTRACTED]
  src/main.js → src/i18n.js
- `voie()` --calls--> `t()`  [EXTRACTED]
  src/parcours-analyse.js → src/i18n.js
- `quitter()` --calls--> `t()`  [EXTRACTED]
  src/zones-hors-ligne.js → src/i18n.js
- `capterClicCarte()` --indirect_call--> `position()`  [INFERRED]
  src/meteo.js → src/rando-profil.js
- `chargerPrevisions()` --indirect_call--> `position()`  [INFERRED]
  src/meteo.js → src/rando-profil.js

## Import Cycles
- 2-file cycle: `src/donnees-hors-ligne.js -> src/zones-hors-ligne.js -> src/donnees-hors-ligne.js`

## Communities (30 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (100): creerActiviteSki(), actualiserMarqueurs(), chargerConditions(), chargerStations(), chercherDansFichier(), completerAvecPhoton(), creerItem(), creerOngletDomaine() (+92 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (87): creerActiviteParcours(), afficherMessage(), appliquerCalque(), chargerListe(), chercherDansLaZone(), chercherTexte(), choisirFiltre(), importerGpx() (+79 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (81): estHorsLigne(), ECHELLE_SAC, palierDifficulte(), palierPente(), PALIERS_PENTE, passagesRaides(), repartir(), voie() (+73 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (55): bloquerFiches(), SOURCE_SATELLITE, SOURCE_TOPO, attenuer(), brouillard(), cadreAutour(), calquesDecor(), calquesMasque() (+47 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (51): CLES_PARCOURS, definirWifiUniquement(), mesurerStockage(), tailleCache(), tailleTexte(), telechargementBloque(), viderCache(), wifiDetectable() (+43 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (44): chargerFFVL(), erreurFFVL(), FFVL, FFVL_ACTIVE, lireJson(), OPENWINDMAP, SOURCES_BALISES, dateEtHeure() (+36 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (39): cleePosition(), creerCarteVent(), afficherDonnees(), afficherEcheance(), afficherResume(), appliquerEcheance(), appliquerPalette(), assurerCouche() (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (29): cheminsUtilises, COULEURS, elements, interroger(), kmEntre(), liste, longueurKm(), MASSIFS (+21 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (30): afficherBatiments(), GROUPES, afficherRefuges(), afficherVilles(), creerIconeRefuge(), definition(), NIVEAUX, POLICE (+22 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (33): dependencies, maplibre-contour@^0.1.1, maplibre-gl@^6.15.0, suncalc@^2.1.1, devDependencies, vite@^8.3.4, name, private (+25 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (33): dateHorsLigne(), texteDonneesDu(), formatDate(), nomJour(), codePostalDepuisGeocodage(), CODES_METEO, creerConditionsLocales(), afficherCoordonnees() (+25 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (22): allegerGeometrie(), allegerPoint(), arrondi(), communesParDomaine, contenus, convertir(), COULEURS, dansAnneau() (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (28): accentChoisi(), ACCENTS, appliquerApparence(), definirAccent(), definirTheme(), systemeSombre, themeChoisi(), THEMES (+20 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (29): obtenirBarre(), initBasculeMode(), categorie(), CATEGORIES, equilibrerResultats(), groupeRecherche(), initRecherche(), afficherMessage() (+21 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (27): creerActiviteParapente(), afficherVue(), choisirVue(), ouvrirOutil(), rendreBalises(), synchroniserCarte(), puceManche(), creerFicheBalise() (+19 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (25): texteCourbe(), urlCourbes(), depuisAltitude(), imperial(), uniteTemp(), creerVolume3D(), altitudeTerrain(), calculerExageration() (+17 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (23): BANDEAU_MENU, ETOILES, creerElementsCarte(), majOnglets(), appliquerFond(), coucheDe(), creerFondDeCarte(), afficher() (+15 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (26): altitudeDem(), analyser(), chargerTuileDem(), decrire(), estParc(), FILTRES, GENRE_PAR_COUCHE, humaniser() (+18 more)

### Community 18 - "Community 18"
Cohesion: 0.16
Nodes (24): afficherAltitude(), altitude(), cache, calculerPortee(), chargerTuile(), couleurAgl(), creerTas(), initPortee() (+16 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (19): COUCHES_CLIC, creerCoucheBalises(), assurerCouches(), assurerImage(), donnees(), imageManche(), imagePastille(), marquerSelection() (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (16): ATTRIBUTS, racines, TEXTES, traduire(), variablesDe(), annoncerPreferences(), definir(), definirLangue() (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (15): attributVariables(), echapper(), ta(), tt(), creerOptionCourbes(), etat, majCourbes(), creerPanneauCarte() (+7 more)

### Community 22 - "Community 22"
Cohesion: 0.21
Nodes (15): capMoyen(), creerGraphiqueBalise(), degrade(), dessiner(), placerCurseur(), redimensionner(), tracer(), tronçons() (+7 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (10): appliquerMode(), demSource, echelle, localeCarte(), majTerrain(), map, SEUILS_METRES, SEUILS_PIEDS (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (8): cleDonnees(), cleTuile(), elaguer(), enregistrerDonnees(), PRESERVES, prevenir(), servieDonnees(), servieTuile()

### Community 25 - "Community 25"
Cohesion: 0.42
Nodes (8): caseOption(), creerActiviteRandonnee(), estGR(), estPR(), infosRoute(), lienWikipedia(), nomSac(), dureeEstimee()

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (5): catalogueEuroVelo(), creerActiviteVelo(), EUROVELO, PRATIQUES, ECHELLE_VTT

### Community 27 - "Community 27"
Cohesion: 0.39
Nodes (7): initEchelleCarte(), actualiser(), observerPanneaux(), planifierActualisation(), suivreTransition(), SELECTEURS_OBSTACLES, SELECTEURS_PANNEAUX

### Community 28 - "Community 28"
Cohesion: 0.46
Nodes (8): creerRadarPluie(), afficherImage(), arreterLecture(), chargerImages(), choisirSource(), urlTuiles(), formaterHeure(), lireImagesRadar()

### Community 29 - "Community 29"
Cohesion: 0.32
Nodes (7): formatSpeed(), KMH, LIBELLES_VENT, libelleVent(), valeurTemp(), versAltitude(), versTemp()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 8`, `Community 10`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 25`, `Community 26`, `Community 28`?**
  _High betweenness centrality (0.393) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `creerEditeurParcours()` (e.g. with `allerRetour()` and `boucler()`) actually correct?**
  _`creerEditeurParcours()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.050288820931022764 - nodes in this community are weakly interconnected._
- **Why does `maplibre-gl` connect `Community 9` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 6`, `Community 10`, `Community 13`, `Community 17`, `Community 18`, `Community 23`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `creerCarteVent()` (e.g. with `appliquerPalette()` and `mettreAJourAlerte()`) actually correct?**
  _`creerCarteVent()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05792620078334364 - nodes in this community are weakly interconnected._
- **Why does `vite` connect `Community 9` to `Community 7`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._