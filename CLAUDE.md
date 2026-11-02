# Montis

Appli web de montagne : carte 2D/3D qui devient un globe au dézoom, quatre activités (Parapente, Randonnée, Vélo, Ski) et des outils Météo et Carte. Installable (PWA) et utilisable hors ligne. Interface, code et commits sont en français.

Stack : Vite 8 et JavaScript vanilla (pas de framework, pas de TypeScript), MapLibre GL 6, `maplibre-contour` pour les courbes de niveau. Hébergée sur Vercel, déployée depuis GitHub (`PotoLuceBif/MontisApp`). Pas de `vercel.json` : Vercel détecte Vite et publie `dist/`.

Le propriétaire du projet code surtout depuis son téléphone, en session cloud : pas d'accès à sa machine, et un seul moyen de voir le résultat, le déploiement. Le `README.md` décrit les fonctions côté utilisateur.

## Commandes

```bash
npm ci            # installer (Node 22.12 ou plus récent, exigé par Vite 8)
npm run dev       # développement
npm run build     # build de production dans dist/, avec /sw.js généré
npm run preview   # sert dist/ : seul moyen de tester le service worker et le hors-ligne
```

Il n'y a ni tests automatiques ni linter : `npm run build` est le seul contrôle automatique. Il ne détecte pas une erreur d'exécution, donc une modification d'interface se vérifie dans un navigateur quand c'est possible. En développement, la carte est accessible par `window.map`.

Variables d'environnement : aucune n'est nécessaire (voir `.env.example`). `VITE_FFVL=1` active le code FFVL, qui suppose un relais serveur inexistant à ce jour.

## Règles de conception

Ces règles sont celles du propriétaire. Les respecter sans qu'il ait à les redemander.

**Comportement**
- Activités exclusives : jamais deux activités actives en même temps (`exclusif: true` dans `menu.js`). Ouvrir Météo ou Carte arrête aussi l'activité en cours.
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

## Workflow

- Chaque tâche sur sa propre branche, créée depuis `main`.
- `npm run build` doit passer avant de pousser.
- Commits clairs en français, au présent, sans préfixe : « Ajoute les EuroVelo et la visite des bike parks ».
- Ne jamais commiter de secret. Toute variable `VITE_` finit lisible dans le JavaScript livré : une vraie clé d'API doit rester côté serveur, derrière un relais.
- Linux distingue les majuscules, contrairement à Windows : respecter la casse exacte dans les imports et les chemins d'assets.

## Conventions de code

- Modules ES, noms en français (`creerPanneauCarte`, `chargerPrevisions`). Fabriques en `creerX` ou `initX`, qui reçoivent `map` et renvoient leur interface.
- Un module de menu expose `{ id, label, icone, panneau, activer(), desactiver() }`, et `menu.js` l'orchestre. Pour ajouter une activité ou un outil, ajouter une entrée dans `categories`.
- Commentaires courts, seulement pour expliquer un pourquoi. Le DOM se construit à la main (`createElement` ou `innerHTML`).
- Tout le CSS est dans `src/style.css`, avec les thèmes (`data-theme`) en variables. Thèmes : cyberpunk (par défaut), clair, sombre, auto.

## Pièges connus

- **Marqueurs MapLibre :** MapLibre place l'élément d'un `Marker` avec `transform` et `position: absolute`. Ne pas lui mettre de `transform` ni de `position: relative` : l'image va dans un parent (`creerPinSeul`, `.maplibregl-marker.rando-repere`).
- **Pins :** image 96×96, pointe à (48 ; 87,5), affichée en 48 px. Toujours `anchor: 'bottom'` et `offset: DECALAGE_PIN` (`pins.js`). Chaque pin a trois états : `<nom>.svg`, `-selected`, `-disabled`.
- **Service worker :** `src/sw-modele.js` n'est pas importé. `vite.config.js` y inscrit la version et la liste des fichiers, puis publie `/sw.js`. Il est inactif en développement. Tout `public/` est préchargé, sauf `/data/pistes/` et `/data/bike-parks/` : un nouveau gros fichier public alourdit le cache de chaque utilisateur.
- **Clé de tuile :** `cleTuile()` existe dans `sw-modele.js` et dans `zones-hors-ligne.js`. Les deux doivent rester identiques.
- **Ordre au démarrage :** les couches s'ajoutent dans `map.on('load')`. Utiliser `quandPret(map, action)` pour agir sur le style.
- **Clics sur la carte :** `peutOuvrirBalise` et `bloquerFiches` empêchent un clic d'ouvrir deux choses à la fois. Un outil qui capte les clics doit s'y brancher.

## Arborescence

```
index.html              Point d'entrée, ne contient que #map
vite.config.js          Génération de /sw.js, proxy /ffvl (développement seulement)
.env.example            Variables possibles, sans valeur
scripts/                Extraction des données, à lancer à la main (voir Données locales)
public/
  data/                 Données locales (voir Données locales)
  icons/                Icônes PWA ; activites/ : icônes des quatre activités
  logos/                Logo et logotype Montis
  pins/                 Pins SVG ; png/ : versions @2x, pas utilisées par le code à ce jour
  manifest.webmanifest  Manifeste PWA
src/                    Tout le code (détail ci-dessous)
```

**Socle**
| Fichier | Rôle |
|---|---|
| `main.js` | Crée la carte, relief et courbes, globe, ciel, bascule 2D/3D, mémoire de la vue |
| `menu.js` | Bouton logo, tiroir, panneaux flottants, activation exclusive des modules |
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
| `fiche.js` | Fiche d'un objet de la carte touché (via Overpass) |

**Carte (menu Carte et fond)**
| Fichier | Rôle |
|---|---|
| `style-montis.js`, `source-vecteur.js` | Style du fond Montis, source vectorielle OpenFreeMap |
| `fond-de-carte.js` | Choix du fond ; en ajouter un = une entrée dans `FONDS` |
| `relief.js` | Options de relief selon le mode |
| `elements-carte.js` | Éléments à afficher ; en ajouter un = une ligne |
| `nature.js`, `lieux.js`, `sommets.js`, `batiments.js` | Forêts, eaux, glaciers, parcs ; villes, refuges ; sommets ; bâtiments |
| `zones-hors-ligne.js` | Cartes hors ligne : cadrage, estimation, téléchargement |
| `hors-ligne.js`, `sw-modele.js` | État du réseau et indicateur ; service worker |

**Météo**
| Fichier | Rôle |
|---|---|
| `meteo.js` | Conditions locales et prévisions, radar de pluie |
| `carte-vent.js` | Analyse du vent sur la carte (panneau, grille, niveaux, échéances) |
| `vent-calcul.js`, `vent-cadran.js` | Calcul du vent ; échelle de couleurs et cadran communs |
| `vent-couche-carte.js`, `vent-volume-3d.js` | Flèches et traînées sur la carte ; bloc 3D du vent |

**Parapente**
| Fichier | Rôle |
|---|---|
| `activite-parapente.js`, `parapente.js` | Menu de l'activité ; balises et sites |
| `balises-sources.js`, `balises-couche.js` | Sources de relevés ; pastilles et manches à air sur la carte |
| `balise-fiche.js`, `balise-graphique.js` | Fiche d'une balise ; graphique de son évolution |
| `portee.js` | Portée de vol depuis un point, selon la finesse et le relief |

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

Établi d'après le code et l'historique git au 2 novembre 2026.

**En place**
- Carte 2D/3D et globe, fonds multiples, thèmes, PWA et mode hors ligne.
- Parapente : balises OpenWindMap et leur fiche, analyse du vent et volume 3D, portée de vol.
- Randonnée et Vélo : menu commun, création de parcours, Mes parcours, import GPX, profil, itinéraires balisés.
- Vélo : calque vélo, alertes de passages raides, EuroVelo, bike parks.
- Ski : stations, pistes, enneigement, avalanches, visite 3D (aussi pour les bike parks).
- Pins en goutte : station, bike park, rando, route, mes parcours, départ, recherche, météo, parapente.
- Paramètres en sections : Thème, Unités (métrique ou impérial, unité du vent à part), Langue (FR/EN, `src/i18n/`, `t('clé')`), Données hors ligne (espace par type, zones, vider le cache, Wi-Fi uniquement sur Chrome Android), Sauvegarde (export et import `.json` des réglages et de Mes parcours).
- Portée de vol par chemin le plus court (Dijkstra), qui contourne le relief.
- La manche à air de la carte suit le curseur du graphique d'une balise.

**Points ouverts constatés**
- FFVL : en attente d'une clé et d'un relais serveur.
- `public/pins/png/` n'est pas utilisé par le code, mais alourdit le cache hors ligne d'environ 230 Ko.
- La dépendance `suncalc` est déclarée, mais importée nulle part.
- Le build signale un bundle de plus de 500 Ko : pas de découpage du code pour l'instant.
- Aucun test automatique.
- Quelques messages de statut ne changent de langue qu'à la prochaine actualisation.

**Feuille de route :** `docs/feuille-de-route.md` découpe la suite en lots (un lot = une branche = une PR), avec la barre qualité que chaque fonction doit franchir. Quand le propriétaire demande « le lot X », le faire tel qu'il y est décrit, puis cocher le lot. Pour les décisions marquées « À décider », demander au propriétaire plutôt que supposer.
