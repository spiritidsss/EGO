# FEARLESS — v8 Asie (NQ1!, session de 20:00 New York)

> Rédigé dans la session cloud du 31/10/2026, à partir du carnet « Les 6 trades d'Asie de Reese »
> (guide du 22/10). **À fusionner avec les règles v8 New York du PC** : plan A/B/C, règle 9,
> indicateur Nephew_Sam_, `erreurs.json` et the-fool s'appliquent ici aussi. En cas de conflit,
> la v8 New York gagne, sauf pour les horaires et les bougies clés, qui sont propres à l'Asie.

## 0. Avertissement honnête

- L'Asie a déjà échoué à l'aveugle avec les règles v1 : 26 nuits, 5 trades, 0 gagnant, −3 R.
- La v8 Asie n'a **jamais** été testée à l'aveugle. Les 6 trades de Reese sont 6 gagnants choisis pour YouTube.
- Conséquence : les **10 premières nuits de signaux comptent comme un test**. Taille B (1 MNQ) pour tout,
  même un A+, jusqu'à la revue de la 10e nuit.

## 1. Horaires (heure de Paris)

| Repère New York | Paris (à partir du 02/11/2026) | Rôle |
|---|---|---|
| 18:00 dimanche | 00:00 | ouverture de la semaine, plus volatile |
| 19:30 | 01:30 | **plan** (biais, DOL, condition) |
| 20:00 | 02:00 | bougie clé n°1 = « le 9h30 de l'Asie » |
| 20:15 | 02:15 | bougie clé n°2 |
| 20:30 | 02:30 | bougie clé n°3 |
| ~20:45 | ~02:45 | **plus de nouvelle entrée** après cette heure |
| 23:30 | 05:30 | fin de la surveillance (gestion d'un trade ouvert seulement) |

- L'écart Paris − New York est de 6 h, sauf environ 3 semaines en mars (les États-Unis changent d'heure le
  2e dimanche de mars, l'Europe le dernier dimanche) et 1 semaine fin octobre (l'Europe change le dernier dimanche
  d'octobre, les États-Unis le 1er dimanche de novembre), où il tombe à 5 h. Les outils calculent l'heure de Paris à partir de l'heure de New York ; ne jamais coder « 02:00 » en dur.
- Pas de session le vendredi soir NY (samedi matin Paris). Dimanche soir NY : oui (nuit de dimanche à lundi, Paris).

## 2. Le plan (01:30 Paris, avant toute bougie clé)

À écrire dans le plan, sur NQ **et** ES :

1. **Biais de grande UT** (journalier → 4h → 1h) : quelles zones sont respectées, lesquelles sont ignorées ?
   On livre depuis la liquidité vendeuse et on ignore les gaps baissiers = haussier (et l'inverse).
2. **Aux plus hauts historiques : jamais de vente.** Haussier jusqu'à preuve du contraire.
3. **DOL** : le prochain plus haut ou plus bas évident de grande UT. Le meilleur DOL est présent sur NQ et sur ES,
   avec de la faible résistance en petite UT juste devant.
4. **Condition du jour (« si ceci, alors cela »)** : sur la jambe en cours, le FVG de la plus grande UT
   (30 min, 15 min, sinon 5 min) proche de l'équilibre. S'il tient, on va au DOL. S'il cède, on va à la
   condition suivante — l'écrire aussi.
5. **Plan A / plan B / plan C**, au format v8 :
   - A : le scénario type dans le sens du biais (« open low, high close » pour un long, l'inverse pour un short).
   - B : 20:00 part directement dans le sens du biais sans manipuler → retracement au 0,5 de l'impulsion (T2).
   - C : 20:00 balaie une liquidité majeure dans le sens du biais **et échoue** → contre-tendance vers la
     condition, jusqu'à un niveau qui sert la tendance de fond (T1). C exige un sponsor de grande UT.
6. **Niveaux à reporter sur le graphique** : ouverture de 20:00, 20:15 et 20:30 dès qu'elles existent,
   FVG de condition, DOL, équilibre de la jambe, plus haut/plus bas 1h et 4h sur NQ et ES.

## 3. Conditions d'un setup valide (toutes obligatoires)

1. **Timing** : entre 20:00 et ~20:45 NY. Le setup est lié à l'une des bougies de 20:00, 20:15 ou 20:30.
2. **PO3 de la bougie** : la bougie clé a généré de la liquidité, puis **manipulé contre mon sens en mèches**.
   Des **corps** qui clôturent loin hors du range = cassure de structure, **pas** une manipulation → pas de trade (T3, T4).
   Exception : plan B (retracement au 0,5 de l'impulsion à la place de la manipulation).
3. **Sponsor** : le prix est dans un FVG de grande UT (≥ 5 min en Asie, s'il est justifié) ou sur un swing de grande UT
   évident (plus haut 4h, plus bas 1h d'ES…). Idéalement en discount pour un long (premium pour un short).
4. **Au moins une confluence de haute résistance** sur l'extrême protégé : SMT avec ES, turtle soup en mèche seule,
   chasse AMD, PO3 empilés (20:00 et 20:15/20:30 dans le même sens), discount de temps + discount de prix.
5. **Pas de liquidité ouverte sous mon stop** : aucun gap non mitigé ni plus bas évident juste sous le stop,
   sur NQ **et** sur ES. Si ES n'a pas encore touché son niveau → on attend (T4, refus de 20:27).
6. **Déclencheur en 15 s / 30 s** : inversion d'un FVG (IFVG) ou CISD, et surtout un **déplacement net**.
   Une inversion en 1 bougie = excellente ; une traversée en 10 bougies ou plus = mauvaise signature, pas de trade.
7. **TP1 ≥ 1 R** sur un objectif « à portée de main » (voir §5).

Si une seule manque : **pas de trade**. Les jours sans PO3 propre avant ~20:45 NY, on ne fait rien.

## 4. Verdict A+ / B

- **A+** : les 7 conditions + au moins **deux** confluences de haute résistance + PO3 empilés **ou** SMT nette
  sur un plus bas/plus haut intermédiaire + inversion en 1 à 2 bougies.
- **B** : les 7 conditions, une seule confluence.
- Pendant les 10 nuits de test (§0) : taille B pour les deux.

## 5. Entrée, stop, objectifs

- **Entrée** : à la clôture de la bougie 15 s/30 s qui inverse le FVG ; ou ordre limite au retour dans le
  FVG 1 min fraîchement formé si le départ a été raté (T5). **On ne court jamais après un départ.**
- **Stop** : sous le **plus bas protégé** (plus bas de la chasse ; en continuation, plus bas de la jambe — pas le petit retracement).
- **TP1** (60 % de la position) : le premier de ces niveaux qui fait ≥ 1 R :
  ouverture de 20:00 (ou de 20:30), mèche à combler d'une bougie ouverte sans mèche (« devil's mark », T4),
  gap opposé le plus proche (« agreed upon », T3).
- **Reste** : le DOL. Aux ATH : l'ATH.
- **Partiel calé sur ES** : prendre TP1 quand **ES** touche son objectif interne, même un peu avant le prix NQ prévu (T1, T5).

## 6. Gestion

- **Ne rien toucher pendant la consolidation.**
- **Attack vs defend** : un gap contre moi qui attaque un extrême très résistant et défend de la faible résistance
  doit céder. Ce n'est pas une raison pour passer à BE ni pour sortir.
- **BE** seulement quand le modèle est prouvé : respect d'un **nouveau** gap dans mon sens **et** clôture au-delà
  du dernier extrême interne. Jamais juste parce qu'un petit plus haut a été pris.
- **Stop à 1:1** à la clôture suivante au-delà, si le prix continue (T2, T6).
- **Changer de camp** (T6) : si tout est là pour mon sens (PO3, FVG de grande UT) et que le prix n'y arrive pas,
  alors que des gaps de petite UT dans l'autre sens sont **respectés** puis quittés en déplacement → plus de trade
  dans mon sens ; un setup inverse n'est valable que s'il remplit lui-même tout le §3.
- **Un seul trade par session.** Après un stop, la session est finie.

## 7. Taille (prop firm)

1 point NQ = 20 $ par mini, 2 $ par micro (MNQ).

| Stop (points) | Risque 1 MNQ | Taille A+ (~200 $) |
|---|---|---|
| 10 | 20 $ | 10 MNQ |
| 12 | 24 $ | 8 MNQ |
| 15 | 30 $ | 6 MNQ |
| 20 | 40 $ | 5 MNQ |

- B = 1 MNQ. A+ = `floor(200 / (stop_points × 2))` MNQ. L'outil `outils/ticket.py` fait le calcul.
- Vérifier que le risque respecte la perte journalière maximale du compte Lucid.

## 8. Référence : les 6 trades de Reese

| # | Date NY | Sens | Plan | Ce qui le rend valable |
|---|---|---|---|---|
| T1 | 20/09 20:06 | Vente | C | Chasse du plus haut 4h, échec, inversion 15 s ; TP1 ouverture 20:00, reste FVG 30 min |
| T2 | 21/09 ≈20:17 | Achat | B | Pas de manipulation : 0,5 de l'impulsion + FVG 5 min + chasse interne ; cible plus haut 4h/journalier |
| T3 | 28/09 20:30 | Achat | A | 20:00 et 20:15 refusés ; turtle soup sur le plus bas 1h d'ES, inversion 30 s en 1 bougie ; TP gap 5 min |
| T4 | 30/09 20:36 | Achat | A | Refus à 20:27 (heure, ES non mitigé) ; 20:30 sans mèche haute = devil's mark ; discount de temps + prix |
| T5 | 05/10 ≈20:10 | Achat | A | Aux ATH ; départ raté, retour dans le gap 1 min ; partiel 1 R, reste à BE |
| T6 | 07/10 20:19 | Vente | — | Changement de camp : la petite UT bat la grande ; TP calé sur le plus bas 1h d'ES |
