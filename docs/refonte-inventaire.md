# Refonte de l'organisation : inventaire des fonctions

Variante F choisie par le propriétaire le 25 novembre 2026 : onglets Carte · Préparer · Météo · Traces · Explorer (barre du bas sur téléphone, rail à gauche sur ordinateur), sélecteur d'activité, bandes de petites cartes illustrées. **Aucune fonction ne disparaît** : chaque lot vérifie que chaque ligne garde un chemin.

Colonnes : où on la trouvait avant, où elle est après le lot R1 (onglets posés, contenus inchangés), où elle ira à la fin de la refonte.

**État au 25 novembre 2026** : faits dans la branche `refonte-onglets` : onglets et rail, logo qui les montre ou les cache, icônes de la maquette, feuilles du bas et fondus, Préparer en tuiles d'activités, Météo en tuiles et conditions d'abord, Explorer en bande (Ma position, Globe, La Lune, Soleil et Lune, Géographie) avec ses vignettes. Restent : bande de cartes illustrées pour les outils de Préparer (aujourd'hui, les boutons de chaque activité), couleur par activité, carte d'accueil « Salut ! », série complète de captures avant la version.

| Fonction | Avant | Après R1 | Cible |
|---|---|---|---|
| Choisir une activité (Vol libre, Randonnée, Vélo, Ski) et sa pratique | Logo › Activités | Préparer | Préparer, tuiles des quatre activités en tête (fait ; le logo occupe le haut à gauche) |
| Vol libre : sites et balises, portée de vol, analyse du vent, plafonds | Logo › Vol libre | Préparer | Préparer, bande de cartes (R3) |
| Randonnée et Vélo : créer un parcours, rechercher ici, import GPX, itinéraires balisés, refuges, aperçu des sentiers | Logo › Randonnée / Vélo | Préparer | Préparer (R3) |
| Vélo : bike parks, EuroVelo, calque vélo | Logo › Vélo | Préparer | Préparer (R3) |
| Ski : stations, enneigement, avalanches, bulletin détaillé, ski de rando, visite 3D | Logo › Ski | Préparer | Préparer (R3) |
| Guidage (« Démarrer la sortie »), enregistrement de la trace | Éditeur de parcours | inchangé | inchangé |
| Pastille de l'activité en cours | Rangée des pastilles | inchangé (ouvre Préparer) | inchangé |
| Sorties (import FIT, GPX, TCX, IGC ; vue, frise, ombre, météo du jour) | Logo › Mes traces › Sorties | Traces | Traces |
| Mes parcours réunis | Logo › Mes traces › Parcours | Traces | Traces |
| Géographie (quiz, Où est-ce ?, liste chrono, fiches des pays) | Logo › Jeux | Explorer | Explorer, carte Géographie (R4) |
| Météo locale, frise, prévisions 5 jours | Colonne › Météo | Météo | Météo, données d'abord (R6) |
| Radar de pluie | Colonne › Météo | Météo | Météo |
| Analyse du vent (carte, volume 3D, profil) | Colonne › Météo, Vol libre | Météo, Préparer | Météo, Préparer (Vol libre) |
| Fond de carte (Carte Montis jour et nuit, autres fonds, Avancé : éléments, fonds nationaux, calques) | Colonne › Carte | Carte | Carte |
| Relief, courbes, pentes et orientation | Colonne › Carte | Carte | Carte |
| Nature et sous-sol (géologie) | Colonne › Carte | Carte | Carte |
| Cartes hors ligne | Colonne › Carte | Carte | Carte |
| Partager cette vue | Logo › bas du menu | Carte, en bas du panneau | Carte |
| Soleil et Lune (frise, ombre du soleil, Lune, Au sol, Voir dans le ciel) | Colonne | Colonne | Colonne et Explorer (R4) |
| Visiter la Lune | Soleil et Lune › Lune ; ciel du globe | inchangé | Explorer, carte La Lune (R4) |
| Globe jour et nuit, ciel, Voie lactée, galaxies | Dézoom | inchangé | Explorer, carte Globe (R4) |
| Horizon (panorama des sommets) | Colonne ; fiche du point | inchangé | Colonne et fiche du point (pas dans Explorer) |
| Recherche de lieux | Barre du haut | Barre du haut | Barre du haut (« Où vas-tu ? ») |
| Bascule 2D / 3D | Barre du haut | Barre du haut | Barre du haut |
| Boussole, ma position | Colonne | Colonne | Colonne ; position dans la recherche en Explorer (R4) |
| Paramètres (thème, unités, langue, hors ligne, sauvegarde) | Engrenage en haut | Engrenage en haut (téléphone), bas du rail (ordinateur) | idem |
| Fiche du point (appui long) : pente, soleil, météo, eau, refuge, géologie, Horizon, Y aller, partager | Carte | inchangé | inchangé |
| Fiches d'objets, de balise, de terrain, de station, de bike park | Carte | inchangé | inchangé |
| Pastilles des couches allumées | Rangée en haut | inchangé | inchangé |
| Liens partagés (vue, point, parcours) | Adresse | inchangé | inchangé |
| Hors ligne, connexion lente | Pastille du réseau | inchangé | inchangé |
