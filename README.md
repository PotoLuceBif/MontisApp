# Montis

Cartographie alpine et outils de préparation d’activités en montagne.

## Installation sur mobile

Montis peut être ajouté à l’écran d’accueil depuis son adresse HTTPS sur Vercel. Sur Android, ouvrez le site dans Chrome, puis choisissez **Installer l’application** ou **Ajouter à l’écran d’accueil** dans le menu du navigateur. Sur iPhone, ouvrez-le dans Safari, touchez **Partager**, puis **Sur l’écran d’accueil**.

L’application s’ouvre alors sans l’interface habituelle du navigateur. Une connexion Internet reste nécessaire pour la carte, le relief, la météo et les autres données en ligne ; le mode hors connexion n’est pas encore pris en charge.

La navigation utilise un bouton logo pour les activités et une bulle Réglages à côté. Les bulles Météo et Carte affichent seulement leur icône au repos ; leur libellé apparaît au survol sur ordinateur ou pendant un appui long sur mobile. Un appui distinct ouvre le panneau correspondant. Les panneaux se ferment avec leur croix, Échap ou en ouvrant une autre rubrique.

## Création d’un parcours de randonnée

Dans **Randonnée > Outils complémentaires > Créer un parcours**, cliquez sur la carte pour placer le départ puis les étapes suivantes. Montis calcule un itinéraire avec le profil piéton de Valhalla, à partir du réseau OpenStreetMap. Selon les données locales, le parcours peut emprunter des voies piétonnes et n’est pas nécessairement un sentier de randonnée. Les coordonnées des étapes sont transmises à `valhalla1.openstreetmap.de` ; aucun compte ni clé API n’est requis. La disponibilité et la couverture dépendent du service et des chemins cartographiés.

La distance provient de l’itinéraire calculé. Le profil, les altitudes et les dénivelés sont estimés depuis les tuiles de relief existantes. Vérifiez la praticabilité du parcours avant de partir : un itinéraire calculé n’est pas une garantie de sécurité. Le tracé peut être téléchargé au format GPX depuis sa fiche.

## Stations de ski

Dans **Activités > Ski**, lancez **Rechercher dans cette zone** après avoir cadré un massif. Les stations cartographiées dans OpenStreetMap apparaissent dans une liste et sur la carte ; les groupes se déplient en zoomant. La barre de recherche générale peut aussi trouver une station par son nom. La couverture et les détails (altitude, exploitant, site web) dépendent des contributions OpenStreetMap ; vérifiez les conditions d’ouverture auprès de la station.

## Activité parapente

Le panneau parapente affiche les sites de vol et les relevés des balises FFVL lorsqu’ils sont accessibles. Les données sont chargées à l’ouverture de l’activité, puis actualisées toutes les cinq minutes ; un bouton permet aussi de les recharger manuellement.

### Accès aux données FFVL

Les endpoints FFVL utilisés par l’application répondent actuellement qu’une clé API est requise. La [page OpenData de la FFVL](https://federation.ffvl.fr/pages/opendata), mise à jour le 30 juillet 2026, indique que les demandes d’accès sont temporairement suspendues. L’application signale cette indisponibilité plutôt que d’afficher des données vides comme si le chargement avait réussi.

Une éventuelle clé ne doit pas être intégrée au JavaScript livré au navigateur. L’accès en production devra passer par un service côté serveur configuré avec l’autorisation FFVL. Le proxy défini dans `vite.config.js` est uniquement destiné au serveur de développement Vite.
