# Table Turn

Application web pour organiser les réunions d'une journée (par exemple la semaine type, jour par jour) : on saisit les disponibilités de chacun, on liste les réunions à tenir, et l'application propose **le meilleur planning possible**.

Application 100 % statique (HTML + JavaScript, aucune dépendance, aucun serveur) : elle se déploie telle quelle avec GitHub Pages. Les données restent dans le navigateur (`localStorage`).

## Utilisation

1. **Disponibilités** – chaque matin, cliquez (ou glissez à la souris) sur les créneaux de 30 min où chaque personne est disponible. Boutons rapides : *Journée*, *Matin*, *Après-midi*, *Aucun*. Plage horaire de la journée et pause déjeuner réglables.
2. **Réunions** – pour chaque réunion : titre, participants requis, durée (par pas de 30 min) et case **★ Prioritaire**.
3. **Planning** – calcul automatique : grille personnes × créneaux, ordre du jour, et liste des réunions non planifiées avec la raison (pas de plage commune, conflit avec une autre réunion…). Le planning peut être copié en texte ou imprimé.

Menu du haut : *Exemple*, *Exporter* / *Importer* (JSON), *Tout vider*.

## Règles d'optimisation

Dans l'ordre de priorité :

1. maximiser le nombre de réunions **prioritaires** planifiées ;
2. puis maximiser le nombre des **autres** réunions planifiées ;
3. à égalité, retenir le planning le plus **compact** (moins de « trous » dans la journée de chaque personne, réunions plutôt tôt).

Une réunion n'est placée que si tous ses participants sont disponibles sur toute sa durée, et personne n'est jamais dans deux réunions en même temps. La recherche est exacte (séparation et évaluation) ; si l'instance est très grande, la meilleure solution trouvée dans le temps imparti est affichée (la page l'indique).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Interface (aucune dépendance externe) |
| `scheduler.js` | Moteur d'optimisation, utilisable aussi sous Node |
| `test.js` | Tests du moteur : `node test.js` |

## Déploiement sur GitHub Pages

*Settings → Pages → Build and deployment → Source : **Deploy from a branch** → Branch : `main`, dossier `/ (root)`*.
L'application est ensuite disponible sur `https://pythonicguks.github.io/table_turn/`.
