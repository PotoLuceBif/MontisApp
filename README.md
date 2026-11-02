# Montis

Cartographie alpine et outils de préparation d’activités en montagne.

## Installation sur mobile

Montis peut être ajouté à l’écran d’accueil depuis son adresse HTTPS sur Vercel. Sur Android, ouvrez le site dans Chrome, puis choisissez **Installer l’application** ou **Ajouter à l’écran d’accueil** dans le menu du navigateur. Sur iPhone, ouvrez-le dans Safari, touchez **Partager**, puis **Sur l’écran d’accueil**.

L’application s’ouvre alors sans l’interface habituelle du navigateur, et continue de s’ouvrir sans réseau.

## Mode hors ligne

Dans **Carte > Cartes hors ligne**, cadrez une zone sur la carte pour enregistrer le fond Montis et le relief. La taille est estimée avant de lancer, et les zones se suppriment depuis la même liste. OpenFreeMap limite chaque téléchargement à 3 000 tuiles ou 50 Mo et à 4 requêtes en parallèle : ces limites sont appliquées par `src/zones-hors-ligne.js`. Les autres fonds de carte ne se téléchargent pas : sans réseau, l’application repasse sur le fond Montis.

Les dernières données consultées (balises, prévisions, randonnées) restent lisibles avec leur date, et l’indicateur « Hors ligne » apparaît sur la carte. Les fonctions qui ont besoin d’Internet (recherche, calcul d’itinéraire, radar, actualisations) sont grisées.

Le service worker est écrit dans `src/sw-modele.js` et publié sous `/sw.js` par `vite.config.js` avec la liste des fichiers du build. Il n’est actif qu’en production : pour le tester, utilisez `npm run build` puis `npm run preview`.

La navigation utilise un bouton logo pour les activités et une bulle Réglages à côté. Les bulles Météo et Carte affichent seulement leur icône au repos ; leur libellé apparaît au survol sur ordinateur ou pendant un appui long sur mobile. Un appui distinct ouvre le panneau correspondant. Les panneaux se ferment avec leur croix, Échap ou en ouvrant une autre rubrique.

## Création d’un parcours de randonnée

Dans **Randonnée > Outils complémentaires > Créer un parcours**, cliquez sur la carte pour placer le départ puis les étapes suivantes. Montis calcule un itinéraire avec le profil piéton de Valhalla, à partir du réseau OpenStreetMap. Selon les données locales, le parcours peut emprunter des voies piétonnes et n’est pas nécessairement un sentier de randonnée. Les coordonnées des étapes sont transmises à `valhalla1.openstreetmap.de` ; aucun compte ni clé API n’est requis. La disponibilité et la couverture dépendent du service et des chemins cartographiés.

La distance provient de l’itinéraire calculé. Le profil, les altitudes et les dénivelés sont estimés depuis les tuiles de relief existantes. Vérifiez la praticabilité du parcours avant de partir : un itinéraire calculé n’est pas une garantie de sécurité. Le tracé peut être téléchargé au format GPX depuis sa fiche.

## Activité vélo

Dans **Activités > Vélo**, choisissez VTT, gravel ou route. Ce choix pilote le routage, les itinéraires proposés et le réseau affiché. **Créer un parcours** s’utilise depuis un panneau posé sur la carte : toucher la carte ajoute un point, toucher le tracé y insère un passage, et chaque point se déplace ou se supprime. L’annulation, le tracé libre, la boucle et l’aller-retour sont dans le même panneau.

Le routage passe par le serveur public de BRouter, seul à indiquer surfaces et difficulté, avec Valhalla en secours. Ces serveurs n’offrent aucune garantie : un tronçon non calculé apparaît en ligne droite tiretée. Les altitudes viennent des tuiles de relief, et la durée reste une estimation selon la pratique. Les parcours enregistrés gardent leur tracé dans le navigateur et se rouvrent sans réseau ; le profil a besoin du relief de la zone (voir Mode hors ligne).

Le menu Vélo donne aussi accès aux 17 EuroVelo, dont les tracés et les tronçons viennent d’OpenStreetMap via Waymarked Trails, et à la visite des bike parks. Leur liste est produite par `node scripts/extraire-bike-parks.mjs` : ce sont des secteurs de pistes de descente balisées dans OpenStreetMap, rattachés à la station de ski voisine, et non un annuaire officiel.

## Stations de ski

Dans **Activités > Ski**, lancez **Rechercher dans cette zone** après avoir cadré un massif. Les stations cartographiées dans OpenStreetMap apparaissent dans une liste et sur la carte ; les groupes se déplient en zoomant. La barre de recherche générale peut aussi trouver une station par son nom. La couverture et les détails (altitude, exploitant, site web) dépendent des contributions OpenStreetMap ; vérifiez les conditions d’ouverture auprès de la station.

## Activité parapente

Le panneau parapente affiche les relevés des balises de vent du réseau ouvert [OpenWindMap](https://www.openwindmap.org). Les relevés sont chargés à l’ouverture de l’activité, puis actualisés toutes les cinq minutes ; un bouton permet aussi de les recharger. Toucher une balise ouvre sa fiche : vent actuel, rose des vents et évolution sur 3 à 24 heures, avec un curseur pour lire une heure précise. La manche à air pointe où va le vent et sa couleur suit sa force. Un relevé de plus de deux heures est grisé ; une balise éteinte, sans mesure ou muette depuis plus de vingt-quatre heures est marquée hors service.

La licence d’OpenWindMap est gratuite, usage commercial compris, à condition de créditer le réseau et de garder un lien visible. Elle interdit de mêler ses mesures à celles de capteurs dont les données ne sont pas ouvertes, sans licence étendue.

### Accès aux données FFVL

Les balises et les sites FFVL restent prêts dans le code, mais désactivés. Pour les activer : obtenir une clé, faire pointer `/ffvl` vers un relais serveur qui l’ajoute, et construire l’application avec `VITE_FFVL=1`. Un choix de source apparaît alors dans le panneau, une seule source à la fois, ainsi que les décollages et atterrissages. Vérifier auprès d’OpenWindMap que cet usage est compatible avec sa licence avant de publier.

Les endpoints FFVL utilisés par l’application répondent actuellement qu’une clé API est requise. La [page OpenData de la FFVL](https://federation.ffvl.fr/pages/opendata), mise à jour le 30 juillet 2026, indique que les demandes d’accès sont temporairement suspendues. L’application signale cette indisponibilité plutôt que d’afficher des données vides comme si le chargement avait réussi.

Une éventuelle clé ne doit pas être intégrée au JavaScript livré au navigateur. L’accès en production devra passer par un service côté serveur configuré avec l’autorisation FFVL. Le proxy défini dans `vite.config.js` est uniquement destiné au serveur de développement Vite.
