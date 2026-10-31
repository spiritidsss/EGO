# Procédure `/signaux` — direct en papier, v8

> Rédigée dans la session cloud du 31/10/2026. À relire et tester sur le PC le lundi 02/11 avant 01:30.
> **Aucun ordre n'est jamais passé par Claude.** Le signal est un texte à recopier ; le bouton reste au trader.

## Calendrier

| Jour (Paris) | Sessions |
|---|---|
| Lundi 02/11 (nuit du lundi au mardi) | Asie seulement (plan 01:30, bougies clés 02:00 / 02:15 / 02:30) |
| À partir du mardi 03/11 | New York (plan 15:00, séance 15:30–17:00) + Asie la nuit suivante |

Les heures de Paris se calculent depuis l'heure de New York (`outils/ticket.py`, `horaires_paris`).

## Déroulé d'une session

1. **Plan** (30 min avant) : biais, DOL, condition « si ceci, alors cela », plans A/B/C, niveaux.
   - Message Telegram « 📋 Plan » : biais en une ligne, DOL, condition, ce qui annule la session.
   - Le plan ne change plus après l'ouverture de la première bougie clé (sauf changement de camp, §6 des règles Asie).
2. **Surveillance** bougie par bougie, comme dans le Replay : à chaque clôture 1 min, vérifier les 7 conditions.
3. **Setup valide** →
   1. verdict A+ ou B ;
   2. ticket : `python fearless/outils/ticket.py --sens … --entree … --stop … --tp1 … --cible … --verdict … --session asie --annulation 20:45`
      (ajouter `--test` pendant les 10 nuits de test Asie) ;
   3. **envoyer le texte d'abord** (l'entrée ne doit pas attendre les images), puis les captures H1 / M15 / M1 ;
   4. poser la Position sur le graphique et noter l'heure d'envoi.
4. **Suivi**, en réponse au signal : `servi`, `be`, `1r`, `tp1`, `sortie`, `stop`, `annule` (fonction `suivi` de `ticket.py`).
5. **Fin de session** :
   - pas de setup → message « ⏸ Pas de trade : <raison en une ligne> » (c'est un résultat, il compte) ;
   - résultat en R dans FEARLESS (page Signaux, bloc séparé des backtests) ;
   - erreurs de processus dans `erreurs.json` ;
   - `REPRISE.md` à jour.

## Règles d'envoi

- Un seul trade par session.
- Ordre limite par défaut ; au marché seulement si le déplacement est déjà parti et que le stop reste ≤ 20 pts.
- Toujours une heure d'annulation pour un ordre limite (Asie : 20:45 NY par défaut).
- Si le signal part en retard (plus de 30 s après la clôture du déclencheur) → le dire dans le message.
- Un signal envoyé ne se modifie pas : une erreur se corrige par un message de suivi, jamais en éditant l'original.

## Revue

- Après la 10e nuit d'Asie et la 10e séance New York : bilan (nombre de signaux, taux de réussite, R moyen,
  nombre de « pas de trade », erreurs). C'est elle qui décide si l'Asie passe en taille normale.
