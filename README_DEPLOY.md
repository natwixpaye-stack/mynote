# MyNote - Déploiement Render (1 clic)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/TON_USERNAME/mynote)

## Déploiement en 30 secondes

### Option A - Render Dashboard (recommandé)
1. Va sur https://dashboard.render.com/new/web
2. Connecte ton GitHub
3. Sélectionne le repo `mynote-web`
4. Render détecte automatiquement :
   - Build: `npm install`
   - Start: `node server.js`
5. Clique Deploy
6. Ton site sera sur `https://mynote-xxxx.onrender.com`

### Option B - Avec token API (pour que je déploie pour toi)
Si tu me donnes ton token Render, je peux déployer directement.

**Comment récupérer ton token Render :**
1. Va sur https://dashboard.render.com/u/settings
2. Section "API Keys" > Create API Key
3. Copie la clé (commence par `rnd_...`)
4. Envoie-la ici (elle sera utilisée uniquement pour déployer MyNote, puis supprimée)

**Avec le token, je fais :**
```bash
curl -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer TON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mynote",
    "type": "web_service",
    "autoDeploy": "yes",
    "serviceDetails": {
      "env": "node",
      "buildCommand": "npm install",
      "startCommand": "node server.js",
      "plan": "free"
    }
  }'
```

### Après déploiement
- Ton lien public : `https://mynote-xxxx.onrender.com`
- Toutatice login marchera partout (plus de token E2B)
- Partage le lien avec qui tu veux
- Tu as les droits admin complets sur Render

### Sécurité
- Le code est 100% open-source dans ce dossier
- Aucun mot de passe n'est stocké, seulement des cookies de session en mémoire
- Tu peux supprimer le service à tout moment sur Render
