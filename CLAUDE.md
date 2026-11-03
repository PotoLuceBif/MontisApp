# Montis

Appli web de montagne : carte 2D/3D qui devient un globe au dézoom, quatre activités (Vol libre, Randonnée, Vélo, Ski) et des outils Météo et Carte. Installable (PWA) et utilisable hors ligne. Interface, code et commits sont en français.

Stack : Vite 8 et JavaScript vanilla (pas de framework, pas de TypeScript), MapLibre GL 6, `maplibre-contour` pour les courbes de niveau. Hébergée sur Vercel, déployée depuis GitHub (`PotoLuceBif/MontisApp`). Pas de `vercel.json` : Vercel détecte Vite et publie `dist/`.

Le propriétaire du projet code surtout depuis son téléphone, en session cloud : pas d'accès à sa machine, et un seul moyen de voir le résultat, le déploiement. Le `README.md` décrit les fonctions côté utilisateur.

## Commandes

```bash
npm ci            # installer (Node 22.12 ou plus récent, exigé par Vite 8)
npm run dev       # développement
npm run build     # build de production dans dist/, avec /sw.js généré
npm run preview   # sert dist/ : seul moyen de tester le service worker et le hors-ligne
npm test          # tests automatiques (Vitest, dans tests/)
npm run captures  # captures téléphone et ordinateur dans captures/, avec rapport (voir ci-dessous)
```

`npm test` vérifie les calculs purs (unités, vent, portée de vol, analyse de parcours, GPX, soleil, pente et distances de la fiche du point), dans un navigateur simulé (jsdom). Un calcul ajouté ou modifié reçoit son test. Ni les tests ni `npm run build` ne détectent une erreur d'interface : une modification d'interface se vérifie avec `npm run captures` (Playwright et Chromium, préinstallés en session cloud). Le script lance son serveur, ouvre chaque écran (accueil, menu, Paramètres, chaque activité, chaque outil Météo et Carte) aux deux formats, et écrit `captures/rapport.txt` : erreurs JavaScript et textes restés en français après passage en anglais (un nom propre, comme celui d'une station, peut y figurer sans être une erreur). `npm run captures -- meteo` ne fait que les écrans dont le nom contient « meteo ». Regarder les captures avant de pousser, et les envoyer au propriétaire quand l'interface change. Un nouvel écran s'ajoute dans `ECRANS`. Le réseau des sessions cloud bloque certains serveurs (OpenFreeMap, polices de la carte, Open-Meteo…) : le fond, les textes de la carte ou les prévisions peuvent manquer sur les captures, le rapport le signale. En développement, la carte est accessible par `window.map`.

Variables d'environnement : aucune n'est nécessaire (voir `.env.example`). `VITE_FFVL=1` active le code FFVL, qui suppose un relais serveur inexistant à ce jour.

## Règles de conception

Ces règles sont celles du propriétaire. Les respecter sans qu'il ait à les redemander.

**Comportement**
- Activités exclusives : jamais deux activités actives en même temps (`exclusif: true` dans `menu.js`). Météo et Carte s'ouvrent par-dessus l'activité sans l'arrêter ; sur téléphone, le panneau de l'activité est masqué le temps qu'un panneau Météo ou Carte est ouvert, puis revient.
- La météo affichée (radar, analyse du vent, météo locale) reste sur la carte quand on ouvre le menu, le panneau Carte ou une activité. Elle ne se retire que quand un outil d'activité prend la carte : Créer un parcours, Rechercher ici, recherche de stations ou de bike parks (zone ou nom), Portée de vol. Ces outils appellent `annoncerOutilActivite()` (`outil-activite.js`) ; un nouvel outil de ce genre doit faire de même.
- Quatre activités, chacune avec ses pratiques : Randonnée (randonnée, puis trail, raquettes), Vélo (VTT, gravel, route), Ski (piste, puis ski de rando, hors-piste), Vol libre (parapente, puis deltaplane, paramoteur, speed riding). Une nouvelle pratique s'ajoute dans son activité, pas comme une nouvelle activité. Le choix de pratique n'apparaît qu'à partir de deux pratiques.
- Tous les réglages sont sauvegardés dans le localStorage et conservés après rafraîchissement. Passer par `lire` et `ecrire` de `reglages.js`.
- 2D : inclinaison bloquée, rotation et déplacement autorisés. 3D : inclinaison autorisée, sans angle imposé au passage en 3D (`appliquerMode` dans `main.js`).
- Les panneaux n'affichent que les options utiles au mode actuel : pas d'options grisées, on les masque (`data-seulement="2d"` ou `"3d"`, voir `relief.js`). Seule exception, déjà en place : hors ligne, les fonctions qui exigent Internet sont grisées.
- Randonnée et Vélo partagent la même structure de menus : créer un parcours, enregistrer, import GPX (`activite-parcours.js`). Une fonction ajoutée à l'une se pose la question de l'autre.

**Mobile**
- Sur téléphone, les outils sont de petits panneaux flottants réductibles, avec flèche retour (`panneau-carte.js`).
- Tout doit fonctionner aussi bien sur téléphone que sur ordinateur : prévoir le tactile, l'appui long à la place du survol, et des zones de toucher suffisantes.

**Direction artistique**
- Sombre et pro, pas de blanc ou de bleu « enfantin ». L'interface reste propre, intuitive et professionnelle.
- Icônes d'activités : carrés arrondis avec dégradé et personnage blanc, dans le style du logo parapente (`public/icons/activites/`).
- Pins de carte en forme de goutte (`public/pins/`).

## Façon de travailler avec le propriétaire

Le propriétaire ne voit l'appli que sur la preview Vercel, depuis son téléphone. Claude, lui, ne voit ni le fond de carte, ni la météo, ni Vercel (réseau bloqué en session cloud). Le dialogue comble cet écart.

**Avant de coder**
- Proposer un plan court (une ligne par partie), puis enchaîner sauf si le propriétaire a demandé d'attendre.
- Une demande qui peut se comprendre de deux façons : poser la question plutôt que choisir. Une décision technique sans effet visible : la prendre et l'expliquer.

**Pendant**
- S'arrêter et demander pour tout ce qui change l'apparence, un comportement visible ou une règle de conception non couverte par ce fichier.
- En attendant une réponse, avancer sur ce qui n'en dépend pas.

**Notifications** (outil `PushNotification`, message court sur une ligne, sans markdown), seulement dans trois cas :
- bloqué par une décision du propriétaire : la question elle-même ;
- preview prête : ce qu'il faut regarder ;
- tâche longue terminée, avec le résultat (y compris un échec).
Jamais pour un simple avancement.

**Après**
- Envoyer les captures téléphone des écrans modifiés (`SendUserFile`).
- Donner le lien de preview et une liste « À tester sur ton téléphone » : ce que Claude n'a pas pu voir (fond de carte, données météo réelles, GPS, rendu sur l'appareil, gestes tactiles).
- Lister les questions en suspens et les décisions prises seul.
- Demander un retour, de préférence en captures d'écran.

**Lien de preview :** `https://montisapp-git-<branche, « / » remplacé par « - »>-luce-team.vercel.app` (équipe Vercel `luce-team`, projet `montisapp`). Version en cours, toujours à jour : `https://montisapp-git-developpement-luce-team.vercel.app`. Format déduit, pas encore confirmé par le propriétaire.

**Skills du dépôt** (`.claude/skills/`) : `/lot X` déroule un lot de la feuille de route de bout en bout ; `/retour` traite les remarques du propriétaire après un test de la preview.

## Workflow

- **Branches :** `main` est la production (adresse principale de l'appli, chez tous les utilisateurs) ; `developpement` reçoit le travail en cours. Chaque tâche a sa propre branche, créée depuis `developpement`, et sa PR vise `developpement`, jamais `main`. `main` ne change qu'à une version (1.0 beta, 1.0, 1.1…), par une PR de `developpement` vers `main`, et seulement sur demande du propriétaire.
- **Fusion :** c'est Claude qui fusionne la PR d'une tâche dans `developpement`, mais toujours après avoir demandé et obtenu la validation explicite du propriétaire (« fusionne », « c'est bon »). Sans réponse claire, ne pas fusionner. Jamais de fusion vers `main` sans demande expresse.
- Si la session impose une branche de travail, la repartir de `origin/developpement` avant de commencer (`git fetch origin developpement && git checkout -B <branche> origin/developpement`).
- `npm test` et `npm run build` doivent passer avant de pousser ; pour une modification d'interface, `npm run captures` aussi.
- Commits clairs en français, au présent, sans préfixe : « Ajoute les EuroVelo et la visite des bike parks ».
- Ne jamais commiter de secret. Toute variable `VITE_` finit lisible dans le JavaScript livré : une vraie clé d'API doit rester côté serveur, derrière un relais.
- Linux distingue les majuscules, contrairement à Windows : respecter la casse exacte dans les imports et les chemins d'assets.

## Conventions de code

- Modules ES, noms en français (`creerPanneauCarte`, `chargerPrevisions`). Fabriques en `creerX` ou `initX`, qui reçoivent `map` et renvoient leur interface.
- Un module de menu expose `{ id, label, icone, panneau, activer(), desactiver() }`, et `menu.js` l'orchestre. Pour ajouter une activité ou un outil, ajouter une entrée dans `categories`.
- Activités, Météo et Analyse du vent se chargent à leur première ouverture : `differer({ id, labelCle, icone }, () => import('./x.js').then(…))` (`module-differe.js`). Ne jamais les importer statiquement depuis un module du démarrage, sinon leur code revient dans le fichier principal. Un module qui en pilote un autre passe par `facade()` (Vol libre → vent). Les rubriques de Carte restent `immediat()` : elles rétablissent le fond et les éléments au démarrage.
- Texte d'interface : `poser(element, 'clé', variables)` plutôt que `textContent = t(…)`, pour qu'il suive un changement de langue (voir l'en-tête de `i18n.js`).
- Version : `version` de `package.json`, affichée en bas des Paramètres. Pas de tag git : le propriétaire n'en veut pas, ne pas le proposer.
- Commentaires courts, seulement pour expliquer un pourquoi. Le DOM se construit à la main (`createElement` ou `innerHTML`).
- Tout le CSS est dans `src/style.css`, avec les thèmes (`data-theme`) en variables. Thèmes : cyberpunk (par défaut), clair, sombre, auto.

## Pièges connus

- **Marqueurs MapLibre :** MapLibre place l'élément d'un `Marker` avec `transform` et `position: absolute`. Ne pas lui mettre de `transform` ni de `position: relative` : l'image va dans un parent (`creerPinSeul`, `.maplibregl-marker.rando-repere`).
- **Pins :** image 96×96, pointe à (48 ; 87,5), affichée en 48 px. Toujours `anchor: 'bottom'` et `offset: DECALAGE_PIN` (`pins.js`). Chaque pin a trois états : `<nom>.svg`, `-selected`, `-disabled`.
- **Service worker :** `src/sw-modele.js` n'est pas importé. `vite.config.js` y inscrit la version et la liste des fichiers, puis publie `/sw.js`. Il est inactif en développement. Tout `public/` est préchargé, sauf `/data/pistes/` et `/data/bike-parks/` : un nouveau gros fichier public alourdit le cache de chaque utilisateur.
- **Clé de tuile :** `cleTuile()` existe dans `sw-modele.js` et dans `zones-hors-ligne.js`. Les deux doivent rester identiques.
- **Ordre au démarrage :** les couches s'ajoutent dans `map.on('load')`. Utiliser `quandPret(map, action)` pour agir sur le style.
- **Source OpenFreeMap :** ne jamais la déclarer par `url` (TileJSON). Si le TileJSON échoue, MapLibre n'émet jamais `load` et rien de Montis n'apparaît. `definitionSourceVecteur()` donne des `tiles` directes ; `suivreDescriptionFond()` met à jour la version et affiche « Fond de carte indisponible » en cas d'échec.
- **Visite et panneaux :** pendant une visite (`visite-station.js`), sur téléphone, la caméra garde une marge basse égale à la hauteur du panneau posé sur la carte (analyse du vent…), pour laisser la station visible au-dessus. Un panneau météo porte la classe `bf-meteo` : la fiche d'un bike park ne se ferme pas pour lui (`velo-bike-parks.js`), la visite continue.
- **Clics sur la carte :** `peutOuvrirBalise` et `bloquerFiches` empêchent un clic d'ouvrir deux choses à la fois. Un outil qui capte les clics doit s'y brancher. `bloquerFiches(true)` coupe aussi l'appui long (fiche du point). Après un appui long, `fiche.js` absorbe le clic suivant en phase de capture sur le conteneur de la carte : MapLibre et les autres outils ne le voient pas.
- **`window.map` en développement :** tant que `main.js` ne l'a pas posé, `window.map` désigne l'élément `#map` (accès par identifiant du navigateur). Attendre `window.map.on` dans un script de test.

## Arborescence

```
index.html              Point d'entrée, ne contient que #map
vite.config.js          Génération de /sw.js, proxy /ffvl (développement seulement)
.env.example            Variables possibles, sans valeur
scripts/                Extraction des données (voir Données locales) ; captures.mjs : captures d'écran
tests/                  Tests Vitest des calculs purs
.claude/skills/          Skills du dépôt : lot (réaliser un lot), retour (traiter un retour de test)
public/
  data/                 Données locales (voir Données locales)
  icons/                Icônes PWA ; activites/ : icônes des quatre activités
  logos/                Logo et logotype Montis
  pins/                 Pins SVG
  manifest.webmanifest  Manifeste PWA
src/                    Tout le code (détail ci-dessous)
```

**Socle**
| Fichier | Rôle |
|---|---|
| `main.js` | Crée la carte, relief et courbes, globe, ciel, bascule 2D/3D, mémoire de la vue |
| `menu.js`, `module-differe.js` | Bouton logo, tiroir, panneaux flottants, activation exclusive des modules ; chargement à la première ouverture |
| `reglages.js` | `lire`, `ecrire`, `quandPret`, `retourAZero` (localStorage `montis.reglages`) |
| `options-carte.js` | État partagé entre le bouton 3D et le menu (`etat`), courbes |
| `style.css` | Tous les styles et les thèmes |
| `apparence.js` | Thème et couleur d'accent |
| `parametres.js` | Page Paramètres |
| `barre-haut.js`, `bascule-mode.js` | Barre du haut, sélecteur 2D/3D |
| `bandeau-menu.js` | Illustration en tête du menu |
| `panneau-carte.js` | Panneau posé sur la carte, réductible sur téléphone |
| `echelle-carte.js` | Échelle de la carte, qui évite les panneaux |
| `pins.js` | Images de pins, décalage de la pointe, pin seul à états |
| `recherche.js` | Barre de recherche générale et son repère |
| `fiche.js` | Fiche d'un objet de la carte touché (via Overpass) ; appui long et clic droit pour la fiche du point |
| `fiche-point.js`, `point-calcul.js` | Fiche d'un point quelconque (chargée au premier appui long) ; ses calculs purs : pente, orientation, distances, plus proche (testés) |
| `relief-donnees.js`, `overpass.js` | Altitude, pente et orientation lues dans les tuiles de relief ; requêtes Overpass avec serveurs de repli |

**Carte (menu Carte et fond)**
| Fichier | Rôle |
|---|---|
| `style-montis.js`, `source-vecteur.js` | Style du fond Montis ; source OpenFreeMap déclarée par adresses de tuiles, TileJSON suivi à côté |
| `fond-de-carte.js` | Choix du fond ; en ajouter un = une entrée dans `FONDS` |
| `relief.js` | Options de relief selon le mode |
| `elements-carte.js` | Éléments à afficher ; en ajouter un = une ligne |
| `nature.js`, `lieux.js`, `sommets.js`, `batiments.js` | Forêts, eaux, glaciers, parcs ; villes, refuges ; sommets ; bâtiments |
| `zones-hors-ligne.js` | Cartes hors ligne : cadrage, estimation, téléchargement |
| `hors-ligne.js`, `sw-modele.js` | État du réseau et indicateur ; service worker |

**Météo**
| Fichier | Rôle |
|---|---|
| `meteo.js`, `meteo-icone.js` | Conditions locales et prévisions, radar de pluie ; pictogramme et description d'un code météo |
| `soleil.js`, `meteo-soleil.js` | Calcul du soleil (`suncalc`) : lever, coucher, heures dorées, position ; section Soleil des conditions locales |
| `carte-vent.js` | Analyse du vent sur la carte (panneau, grille, niveaux, échéances) |
| `vent-calcul.js`, `vent-cadran.js` | Calcul du vent ; échelle de couleurs et cadran communs |
| `vent-couche-carte.js`, `vent-volume-3d.js` | Flèches et traînées sur la carte ; bloc 3D du vent |

**Vol libre** (fichiers nommés `parapente`, identifiant de module `parapente`)
| Fichier | Rôle |
|---|---|
| `activite-parapente.js`, `parapente.js` | Menu de l'activité ; balises et sites |
| `balises-sources.js`, `balises-couche.js` | Sources de relevés ; pastilles et manches à air sur la carte |
| `balise-fiche.js`, `balise-graphique.js` | Fiche d'une balise ; graphique de son évolution |
| `portee.js`, `portee-calcul.js` | Portée de vol depuis un point ; calcul pur du chemin le plus court (testé) |

**Randonnée et Vélo**
| Fichier | Rôle |
|---|---|
| `activite-parcours.js` | Menu commun : mêmes actions, filtres et liste |
| `activite-randonnee.js`, `activite-velo.js` | Configuration de chaque activité |
| `parcours-editeur.js` | Tracé sur la carte : points déplaçables, routage, annuler et rétablir |
| `parcours-routage.js` | BRouter, puis Valhalla en secours |
| `parcours-analyse.js`, `parcours-profil.js` | Pentes, durée, surfaces, difficulté ; profil coloré |
| `parcours-decouverte.js` | Repères après « Rechercher ici » |
| `parcours-itineraires.js` | Grands itinéraires en tronçons (EuroVelo, GR) |
| `parcours-gpx.js`, `parcours-stockage.js` | Lecture GPX ; « Mes parcours » |
| `rando-api.js`, `rando-profil.js` | API Waymarked Trails ; altitudes, dénivelé, export GPX |
| `velo-bike-parks.js` | Bike parks |

**Ski et lieux**
| Fichier | Rôle |
|---|---|
| `activite-ski.js`, `ski-conditions.js` | Stations ; enneigement et risque d'avalanche |
| `zone-lieux.js`, `fiche-lieu.js` | Recherche par nom ou zone et repères groupés ; fiche commune aux stations et bike parks |
| `visite-station.js` | Visite 3D d'une station ou d'un bike park |

## Données locales

Fichiers générés par `scripts/`, à relancer seulement pour rafraîchir les données (réseau requis, longue durée). Licence ODbL, à créditer.

| Données | Taille | Script |
|---|---|---|
| `public/data/stations-ski.json`, `pistes/` (355 fichiers) | 2,3 Mo et 18 Mo | `node scripts/extraire-stations-ski.mjs` (OpenSkiData) |
| `public/data/bike-parks.json`, `bike-parks/` (38 fichiers) | 2,7 Mo | `node scripts/extraire-bike-parks.mjs` (OSM via Overpass) |
| `public/data/refuges.json` | 1,9 Mo | `MONTIS_CONTACT_EMAIL=... node scripts/extraire-refuges.mjs` (Overpass) |

Les caches `scripts/cache-*.json` sont ignorés par git : un clone neuf repart de zéro.

Les bike parks sont des secteurs de pistes de descente d'OSM rattachés à la station voisine, pas un annuaire officiel : ni ouverture ni horaires.

## Sources de données et limites

Aucune de ces sources n'a de clé d'API ni de garantie de service : toujours prévoir l'échec et l'afficher honnêtement.

| Usage | Source | Limites connues |
|---|---|---|
| Fond Montis | OpenFreeMap | Hors ligne : 3 000 tuiles ou 50 Mo par téléchargement, 4 requêtes en parallèle |
| Polices de la carte | `demotiles.maplibre.org` | Serveur de démonstration |
| Relief, courbes, altitudes | Terrain Tiles (AWS) | Zoom 15 au plus |
| Autres fonds | OSM, OpenTopoMap, IGN (`data.geopf.fr`), Esri | IGN : France seulement. Non téléchargeables : sans réseau, retour au fond Montis |
| Recherche | Photon (Komoot) | Service public |
| Fiches d'objets | Overpass (3 serveurs en repli) | Lent ou saturé par moments |
| Prévisions, vent, neige | Open-Meteo | Peut répondre 429 (limite de requêtes) ; un message est prévu |
| Radar de pluie | RainViewer ; lien vers MétéoSuisse | Zoom 7 au plus |
| Balises de vent | OpenWindMap (`api.pioupiou.fr`) | Créditer avec lien visible ; interdit de mêler ses mesures à des capteurs non ouverts sans licence étendue |
| Balises et sites FFVL | `data.ffvl.fr` | Désactivé : clé requise, demandes suspendues par la FFVL. Le proxy `/ffvl` n'existe qu'en développement |
| Itinéraires balisés, EuroVelo | Waymarked Trails | Écritures exactes (« GR5 » et « GR 5 » diffèrent) ; un itinéraire entier peut peser environ 10 Mo |
| Routage | BRouter, puis Valhalla | BRouter abandonne au-delà de 3 s de calcul ; un tronçon non calculé apparaît en tireté |
| Avalanches | Bulletins EAWS (`static.avalanche.report`) | Selon la couverture des bulletins |

## État actuel et prochaines étapes

Établi d'après le code et l'historique git au 3 novembre 2026.

**En place**
- Carte 2D/3D et globe, fonds multiples, thèmes, PWA et mode hors ligne.
- Vol libre (ex-Parapente) : balises OpenWindMap et leur fiche, analyse du vent et volume 3D, portée de vol.
- Randonnée et Vélo : menu commun, création de parcours, Mes parcours, import GPX, profil, itinéraires balisés.
- Vélo : calque vélo, alertes de passages raides, EuroVelo, bike parks.
- Ski : stations, pistes, enneigement, avalanches, visite 3D (aussi pour les bike parks).
- Pins en goutte : station, bike park, rando, route, mes parcours, départ, recherche, météo, parapente.
- Paramètres en sections : Thème, Unités (métrique ou impérial, unité du vent à part), Langue (FR/EN, `src/i18n/`, `t('clé')`), Données hors ligne (espace par type, zones, vider le cache, Wi-Fi uniquement sur Chrome Android), Sauvegarde (export et import `.json` des réglages et de Mes parcours).
- Portée de vol par chemin le plus court (Dijkstra), qui contourne le relief.
- La manche à air de la carte suit le curseur du graphique d'une balise.
- Fiche du point (lot 1.2) : appui long ou clic droit n'importe où ; coordonnées, altitude, pente et orientation, soleil, météo résumée, refuge et point d'eau les plus proches, rappel de prudence. Écran `point` dans les captures.
- Soleil (lot 1.1) dans Météo › Conditions locales : lever, coucher, durée du jour, midi solaire, heures dorées, aube et crépuscule, position actuelle et course du jour. Calculé sur l'appareil, donc hors ligne aussi. Heures au fuseau du lieu (`utc_offset_seconds` d'Open-Meteo), sinon à celui de l'appareil, indiqué. Horizon supposé dégagé, le relief n'est pas pris en compte (lot 1.4).

**Points ouverts constatés**
- FFVL : en attente d'une clé et d'un relais serveur.
- Au démarrage : 233 Ko de code Montis (76 Ko compressé), en deux fichiers : le code (135 Ko) et les deux fichiers de langue (98 Ko) ; MapLibre (1,1 Mo) à part.
- Les crédits de la carte (attribution MapLibre) restent dans la langue du chargement jusqu'à l'actualisation.

**Feuille de route :** `docs/feuille-de-route.md` découpe la suite en lots (un lot = une branche = une PR), avec la barre qualité que chaque fonction doit franchir. Quand le propriétaire demande « le lot X », le faire tel qu'il y est décrit, puis cocher le lot. Pour les décisions marquées « À décider », demander au propriétaire plutôt que supposer.
