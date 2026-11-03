---
name: retour
description: Traiter les remarques du propriétaire de Montis après un test de la preview sur son téléphone (texte, captures d'écran, bugs, envies). À utiliser quand il écrit « /retour », envoie des captures de l'appli ou décrit ce qu'il a vu.
---

# Traiter un retour de test

Le propriétaire voit ce que Claude ne peut pas voir : le vrai fond de carte, les vraies données, son écran, ses doigts. Son retour fait foi.

## 1. Comprendre chaque remarque
- Lire les captures avec attention : appareil, mode 2D ou 3D, thème, panneau ouvert, message affiché.
- Pour chaque remarque, établir : ce qu'il a fait, ce qu'il attendait, ce qu'il a vu.
- Si l'un des trois manque et qu'on ne peut pas le déduire, le demander, en une seule question groupée.

## 2. Classer
Faire un tableau court, une ligne par remarque :

| Remarque | Type | Proposition |
|---|---|---|
| … | Bug, Ajustement visuel, Nouvelle envie ou Question | … |

- **Bug** : reproduire si possible (`npm run captures`, script Playwright), trouver la cause avant de corriger.
- **Ajustement visuel** : vérifier la direction artistique de CLAUDE.md ; proposer avant de coder si plusieurs rendus sont possibles.
- **Nouvelle envie** : ne pas la coder dans la foulée ; proposer de l'ajouter à `docs/feuille-de-route.md` (lot existant ou nouveau lot).
- **Question** : répondre d'après le code.

## 3. Corriger
- Bugs et ajustements validés : un commit par remarque ou groupe cohérent, avec `npm test`, `npm run build` et les captures des écrans touchés.
- Une règle de conception nouvelle ou précisée par le propriétaire va dans CLAUDE.md, pour qu'il n'ait pas à la redire.
- Pousser, puis notifier (`PushNotification`) si le propriétaire peut être absent.

## 4. Répondre
1. Lien de preview.
2. Pour chaque remarque : corrigée (et comment la vérifier), en attente de sa décision, ou ajoutée à la feuille de route.
3. Captures avant et après quand c'est visuel.
4. Ce qu'il doit retester sur son téléphone.
