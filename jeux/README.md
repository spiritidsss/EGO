# NOLIMIT GAMES

8 jeux GPS à jouer dehors entre amis, chacun sur son téléphone. Un joueur crée une partie, choisit la zone sur la carte et le jeu ; les autres rejoignent avec le code à 4 lettres.

| Jeu | En bref |
|---|---|
| **Récolte** | Objets magiques à ramasser par vagues, pouvoirs (radar, invisibilité, gel, vol) |
| **Météorites** | Sortir des cercles d’impact avant qu’ils tombent, dernier debout |
| **La Zone** | La zone rétrécit, on perd des PV dehors, soins/boucliers/pièges |
| **La Horde** | Créatures qui poursuivent les joueurs, 5 batteries puis évacuation (coopératif) |
| **Drapeau** | Capture du drapeau en deux équipes |
| **Geiger** | Sources radioactives invisibles, compteur sonore, vols et leurres |
| **Chasseurs de Primes** | Chacun chasse une cible avec une flèche et une distance, chacun est chassé |
| **Espions** | Rendez-vous secrets, trois cercles flous, démasquer |

## Mettre en ligne sur Render (gratuit)

1. Crée un compte sur [render.com](https://render.com) avec ton compte GitHub.
2. **New → Blueprint**, choisis le dépôt `EGO`, puis la branche où se trouve ce dossier.
   Render lit `render.yaml` à la racine du dépôt et crée le service `nolimit-games` tout seul.
3. Clique sur **Apply**. Au bout de 2 à 3 minutes, l’adresse du site s’affiche
   (du type `https://nolimit-games.onrender.com`). C’est elle qu’on partage aux amis.

Réglages équivalents si tu passes par **New → Web Service** au lieu du Blueprint :
Root Directory `jeux`, Build Command `npm ci --omit=dev`, Start Command `node server.js`, plan Free.

**À savoir avec l’offre gratuite** : après 15 minutes sans joueur, le serveur s’endort.
La première ouverture met alors environ 50 secondes à le réveiller, ensuite tout est instantané.
Ouvre le site une minute avant de lancer la soirée.

## Jouer

- Le site doit être ouvert en **https** (c’est le cas sur Render) : sinon le téléphone refuse le GPS.
- Autorise la **localisation** et monte le **son**. Sur iPhone, la boussole (Chasseurs de Primes) demande une autorisation au premier toucher.
- L’écran reste allumé pendant la partie. Si le téléphone se verrouille, la partie continue et on la retrouve en revenant sur le site.
- Le GPS d’un téléphone est précis à 5–15 m : joue dans un parc ou un quartier dégagé, et choisis un rayon de 150 à 400 m.
- **Mode test** : dans le salon, l’hôte peut ajouter des joueurs simulés et cocher « Mode test sans GPS » pour se déplacer en touchant la carte.

## Développement

```bash
cd jeux
npm install
npm start          # http://localhost:3000
npm test           # parties complètes simulées pour les 8 jeux
```

- `server.js` : serveur HTTP + WebSocket. `rooms.js` : salles, joueurs, joueurs simulés, boucle d’une seconde.
- `games/*.js` : la logique de chaque jeu (côté serveur, qui fait autorité).
- `public/` : l’application téléphone (`app.js`), les fiches des jeux (`games.js`), les sons synthétisés (`audio.js`) et le style (`style.css`).
