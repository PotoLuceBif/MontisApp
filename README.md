# Montis

Cartographie alpine et outils de préparation d’activités en montagne.

## Installation sur mobile

Montis peut être ajouté à l’écran d’accueil depuis son adresse HTTPS sur Vercel. Sur Android, ouvrez le site dans Chrome, puis choisissez **Installer l’application** ou **Ajouter à l’écran d’accueil** dans le menu du navigateur. Sur iPhone, ouvrez-le dans Safari, touchez **Partager**, puis **Sur l’écran d’accueil**.

L’application s’ouvre alors sans l’interface habituelle du navigateur, et continue de s’ouvrir sans réseau.

## Mode hors ligne

Dans **Carte > Cartes hors ligne**, cadrez une zone sur la carte pour enregistrer le fond Montis et le relief. La taille est estimée avant de lancer, et les zones se suppriment depuis la même liste. OpenFreeMap limite chaque téléchargement à 3 000 tuiles ou 50 Mo et à 4 requêtes en parallèle : ces limites sont appliquées par `src/zones-hors-ligne.js`. Les autres fonds de carte ne se téléchargent pas : sans réseau, l’application repasse sur le fond Montis.

Les dernières données consultées (balises, prévisions, randonnées) restent lisibles avec leur date, et l’indicateur « Hors ligne » apparaît sur la carte. Les fonctions qui ont besoin d’Internet (recherche, calcul d’itinéraire, radar, actualisations) sont grisées.

Le service worker est écrit dans `src/sw-modele.js` et publié sous `/sw.js` par `vite.config.js` avec la liste des fichiers du build. Il n’est actif qu’en production : pour le tester, utilisez `npm run build` puis `npm run preview`.

La navigation utilise un bouton logo pour les activités et une bulle Réglages à côté. Les bulles Météo et Carte affichent seulement leur icône au repos ; leur libellé apparaît au survol sur ordinateur ou pendant un appui long sur mobile. Un appui distinct ouvre le panneau correspondant. Les panneaux se ferment avec leur croix, Échap ou en ouvrant une autre rubrique. La flèche vers le bas les réduit en une barre (en bas de l’écran sur téléphone) pour voir la carte ; un appui sur la barre les rouvre là où on les avait laissés. Chaque couche allumée depuis **Carte** (pentes, orientation, sommets, refuges…) garde une pastille sur la carte : sa ✕ l’éteint, un appui ouvre son réglage.

## Fonds de carte

**Carte > Fond de carte** range les fonds en quatre onglets :
- **Ici** : ce qui couvre l’endroit affiché (cartes nationales, cartes du monde entier, calques à superposer, cartes anciennes) ;
- **Monde** : fond Montis, OpenTopoMap, TopPlusOpen, Topo Esri, OpenStreetMap, CyclOSM, satellite Esri ;
- **Pays** : les cartes officielles par pays. France (plan IGN, carte régionale, photo aérienne), Suisse (carte nationale, en couleur ou en gris, SWISSIMAGE), Autriche (basemap.at et sa photo), Espagne (IGN Espagne, carte topo de Catalogne), Norvège, Belgique, États-Unis (USGS Topo, avec ou sans photo), Canada (Toporama), Japon (GSI) ;
- **Anciennes** : Cassini, état-major (1820–1866), IGN de 1950, cartes suisses Dufour et Siegfried.

Une carte nationale s’arrête à la frontière de son pays : au-delà, le fond Montis complète la carte, routes et noms compris. Sous **À superposer**, les calques officiels se posent sur n’importe quel fond, avec leur opacité et leur pastille : pentes de l’IGN, et pour la Suisse pentes de plus de 30°, itinéraires de ski de rando et de raquettes, sentiers balisés, zones de tranquillité de la faune. Chaque fond est crédité dans la carte. Aucun ne demande de clé ; le Top 25 de l’IGN et les cartes britannique, suédoise et finlandaise en demandent une, et attendent un relais côté serveur. Les contours des pays viennent de Natural Earth (`node scripts/extraire-zones-fonds.mjs`).

## Fiche d’un point

Un appui long n’importe où sur la carte (clic droit sur ordinateur) ouvre la fiche de ce point : coordonnées à copier, altitude, pente et orientation du versant, lever et coucher du soleil avec sa position actuelle, météo du moment et de la journée (avec l’isotherme 0 °C et l’indice UV), refuge et point d’eau (lac, cours d’eau, fontaine ou source) les plus proches à vol d’oiseau. Touchez le refuge ou l’eau pour le voir sur la carte, puis **Y aller depuis ce point** : Montis ouvre Créer un parcours du point jusqu’à la cible (en Randonnée, ou en Vélo si c’est l’activité en cours). La flèche retour de l’éditeur ramène à la fiche du point ; le tracé reste en brouillon, et **Créer un parcours** le reprend. La pente est une moyenne sur une trentaine de mètres, calculée depuis les tuiles de relief, affichée en degrés et en pourcentage (« 35° · 70 % ») avec les couleurs des seuils 30°, 35°, 40° et 45°. Le bouton **Prévisions sur 5 jours** ouvre Météo › Conditions locales sur ce point ; sa croix ramène à la fiche.

Hors ligne, l’altitude et la pente restent disponibles dans les zones téléchargées, le soleil et le refuge le plus proche partout ; les lacs et cours d’eau de la carte aussi ; la météo, les fontaines et les sources (OpenStreetMap, via Overpass) demandent Internet. La potabilité d’une source n’est jamais garantie. Toutes ces valeurs sont des estimations, à vérifier sur le terrain.

## Soleil

Dans **Carte > Relief**, le bloc **Pentes et orientation** colore la carte (un appui allume, un second éteint), en 2D comme en 3D. **Pentes** : jaune de 30° à 35°, orange jusqu’à 40°, rouge jusqu’à 45°, violet au-delà ; la légende donne aussi les pourcentages (45° = 100 %). **Orientation** : une couleur par direction vers laquelle descend le versant, selon la rose de la légende. L’opacité se règle, et le choix est gardé. Les couches sont calculées sur le téléphone depuis le relief (environ 15 m de précision) : elles marchent hors ligne dans les zones téléchargées, et n’apparaissent qu’en se rapprochant, car de plus loin le relief lissé sous-estime les pentes : la pastille de la couche affiche alors **Trop loin**, et son bouton **Rapprocher** zoome juste assez. Un passage court peut être plus raide qu’affiché : ce sont des estimations, à vérifier sur le terrain.

Dans **Météo > Conditions locales**, la **frise** montre d’un coup d’œil l’évolution des prochaines 24 heures, ou du jour choisi : température, précipitations (pluie ou neige) et leur probabilité en pointillé, vent et rafales avec leur direction, risque d’orage, nuages bas et isotherme 0 °C comparé à l’altitude du lieu. Touchez la frise ou faites-y glisser le doigt pour lire une heure : ses valeurs s’affichent dessous, et sa carte horaire est soulignée. Le bouton **Lignes** choisit ce qui est affiché. Pour l’orage, « Instabilité » signifie que l’air peut monter (énergie convective, CAPE), pas qu’un orage éclatera ; « Orage prévu » vient du modèle. La fiche d’un point montre la même frise, plus courte, sur 24 heures.

Dans **Météo > Conditions locales**, la section **Soleil** donne pour le lieu des prévisions : lever et coucher avec leur direction, durée du jour, midi solaire et hauteur maximale, heures dorées, aube et crépuscule, et la position actuelle du soleil sur sa course du jour. Elle suit le jour choisi dans les prévisions à 5 jours. Tout est calculé sur le téléphone, donc disponible hors ligne. Le calcul suppose un horizon dégagé : en montagne, le relief cache le soleil plus tard le matin et plus tôt le soir.

## Création d’un parcours de randonnée

Dans **Randonnée > Outils complémentaires > Créer un parcours**, cliquez sur la carte pour placer le départ puis les étapes suivantes. Montis calcule un itinéraire avec le profil piéton de Valhalla, à partir du réseau OpenStreetMap. Selon les données locales, le parcours peut emprunter des voies piétonnes et n’est pas nécessairement un sentier de randonnée. Les coordonnées des étapes sont transmises à `valhalla1.openstreetmap.de` ; aucun compte ni clé API n’est requis. La disponibilité et la couverture dépendent du service et des chemins cartographiés.

La distance provient de l’itinéraire calculé. Le profil, les altitudes et les dénivelés sont estimés depuis les tuiles de relief existantes. Vérifiez la praticabilité du parcours avant de partir : un itinéraire calculé n’est pas une garantie de sécurité. Le tracé peut être téléchargé au format GPX depuis sa fiche.

## Activité vélo

Dans **Activités > Vélo**, choisissez VTT, gravel ou route. Ce choix pilote le routage, les itinéraires proposés et le réseau affiché. **Créer un parcours** s’utilise depuis un panneau posé sur la carte : toucher la carte ajoute un point, toucher le tracé y insère un passage, et chaque point se déplace ou se supprime. L’annulation, le tracé libre, la boucle et l’aller-retour sont dans le même panneau.

Le routage passe par le serveur public de BRouter, seul à indiquer surfaces et difficulté, avec Valhalla en secours. Ces serveurs n’offrent aucune garantie : un tronçon non calculé apparaît en ligne droite tiretée. Les altitudes viennent des tuiles de relief, et la durée reste une estimation selon la pratique. Les parcours enregistrés gardent leur tracé dans le navigateur et se rouvrent sans réseau ; le profil a besoin du relief de la zone (voir Mode hors ligne).

Le menu Vélo donne aussi accès aux 17 EuroVelo, dont les tracés et les tronçons viennent d’OpenStreetMap via Waymarked Trails, et à la visite des bike parks. Leur liste est produite par `node scripts/extraire-bike-parks.mjs` : ce sont des secteurs de pistes de descente balisées dans OpenStreetMap, rattachés à la station de ski voisine, et non un annuaire officiel.

## Stations de ski

Dans **Activités > Ski**, lancez **Rechercher dans cette zone** après avoir cadré un massif. Les stations cartographiées dans OpenStreetMap apparaissent dans une liste et sur la carte ; les groupes se déplient en zoomant. La barre de recherche générale peut aussi trouver une station par son nom. La couverture et les détails (altitude, exploitant, site web) dépendent des contributions OpenStreetMap ; vérifiez les conditions d’ouverture auprès de la station.

## Activité vol libre

L’activité Vol libre (parapente pour l’instant ; deltaplane, paramoteur et speed riding sont prévus) réunit sur la carte les balises de vent de deux réseaux ouverts : [OpenWindMap](https://www.openwindmap.org) et celui de la [FFVL](https://www.data.gouv.fr/fr/organizations/federation-francaise-de-vol-libre/), publié sur data.gouv.fr. Les relevés sont chargés à l’ouverture de l’activité, puis actualisés toutes les cinq minutes ; un bouton permet aussi de les recharger. Toucher une balise ouvre sa fiche : vent actuel, rose des vents et, pour OpenWindMap, évolution sur 3 à 24 heures avec un curseur pour lire une heure précise (la FFVL ne publie que le dernier relevé, avec la température). La manche à air pointe où va le vent et sa couleur suit sa force. Un relevé de plus de deux heures est grisé ; une balise éteinte, sans mesure ou muette depuis plus de vingt-quatre heures est marquée hors service.

Les balises Pioupiou que la FFVL référence viennent d’OpenWindMap, qui seul publie leurs relevés : elles n’apparaissent qu’une fois. Quand deux balises des deux réseaux sont à moins de 200 m, la plus récente s’affiche et sa fiche signale l’autre.

Les **décollages et atterrissages** sont les terrains de pratique de la FFVL (environ 2 400 pour le vol libre) : vert pour un décollage, bleu pour un atterrissage, rouge pour un terrain interdit ou fermé, cerclé d’orange quand une autorisation est à demander. Leur fiche donne le statut, les orientations favorables et à éviter, le vent à la balise la plus proche (dans l’axe ou non), le niveau conseillé, les consignes et règles de vol de la FFVL, et un raccourci vers les prévisions.

### Licences

La licence communautaire d’OpenWindMap est gratuite, usage commercial compris, à condition de créditer le réseau avec un lien visible. Elle n’admet à côté de ses mesures que des capteurs aux données ouvertes : publiques, gratuites, réutilisables par tous, sans dégradation ni délai. C’est le cas des fichiers de la FFVL, sous Licence Ouverte 2.0 (Etalab), qui demande de citer la FFVL. Les deux crédits figurent dans la carte et dans le panneau Vol libre. La liste des balises FFVL contient les coordonnées de leurs responsables : Montis ne les reprend pas.

L’API de `data.ffvl.fr` demande toujours une clé ; Montis n’utilise que les fichiers ouverts de data.gouv.fr, lus directement depuis le navigateur, sans relais.
