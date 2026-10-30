# Montis

Cartographie alpine et outils de préparation d’activités en montagne.

La navigation est organisée en trois accès : le menu latéral regroupe les activités, tandis que les accès Météo et Carte restent visibles sous les commandes de navigation, même lorsque le menu Activités est ouvert. Leurs panneaux restent ouverts pendant les déplacements sur la carte et se ferment avec leur croix, Échap ou en basculant vers une autre rubrique. Chaque accès ferme l’activité ou l’autre rubrique avant d’afficher ses outils.

## Activité parapente

Le panneau parapente affiche les sites de vol et les relevés des balises FFVL lorsqu’ils sont accessibles. Les données sont chargées à l’ouverture de l’activité, puis actualisées toutes les cinq minutes ; un bouton permet aussi de les recharger manuellement.

### Accès aux données FFVL

Les endpoints FFVL utilisés par l’application répondent actuellement qu’une clé API est requise. La [page OpenData de la FFVL](https://federation.ffvl.fr/pages/opendata), mise à jour le 30 juillet 2026, indique que les demandes d’accès sont temporairement suspendues. L’application signale cette indisponibilité plutôt que d’afficher des données vides comme si le chargement avait réussi.

Une éventuelle clé ne doit pas être intégrée au JavaScript livré au navigateur. L’accès en production devra passer par un service côté serveur configuré avec l’autorisation FFVL. Le proxy défini dans `vite.config.js` est uniquement destiné au serveur de développement Vite.
