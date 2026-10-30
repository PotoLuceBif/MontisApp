# Montis

Cartographie alpine et outils de préparation d’activités en montagne.

## Installation sur mobile

Montis peut être ajouté à l’écran d’accueil depuis son adresse HTTPS sur Vercel. Sur Android, ouvrez le site dans Chrome, puis choisissez **Installer l’application** ou **Ajouter à l’écran d’accueil** dans le menu du navigateur. Sur iPhone, ouvrez-le dans Safari, touchez **Partager**, puis **Sur l’écran d’accueil**.

L’application s’ouvre alors sans l’interface habituelle du navigateur. Une connexion Internet reste nécessaire pour la carte, le relief, la météo et les autres données en ligne ; le mode hors connexion n’est pas encore pris en charge.

La navigation utilise un bouton logo pour les activités et une bulle Réglages à côté. Les bulles Météo et Carte affichent seulement leur icône au repos ; leur libellé apparaît au survol sur ordinateur ou pendant un appui long sur mobile. Un appui distinct ouvre le panneau correspondant. Les panneaux se ferment avec leur croix, Échap ou en ouvrant une autre rubrique.

## Activité parapente

Le panneau parapente affiche les sites de vol et les relevés des balises FFVL lorsqu’ils sont accessibles. Les données sont chargées à l’ouverture de l’activité, puis actualisées toutes les cinq minutes ; un bouton permet aussi de les recharger manuellement.

### Accès aux données FFVL

Les endpoints FFVL utilisés par l’application répondent actuellement qu’une clé API est requise. La [page OpenData de la FFVL](https://federation.ffvl.fr/pages/opendata), mise à jour le 30 juillet 2026, indique que les demandes d’accès sont temporairement suspendues. L’application signale cette indisponibilité plutôt que d’afficher des données vides comme si le chargement avait réussi.

Une éventuelle clé ne doit pas être intégrée au JavaScript livré au navigateur. L’accès en production devra passer par un service côté serveur configuré avec l’autorisation FFVL. Le proxy défini dans `vite.config.js` est uniquement destiné au serveur de développement Vite.
