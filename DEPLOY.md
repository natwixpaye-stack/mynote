# Déployer MyNote ailleurs (sans token E2B)

## Option 1 - Local (2 sec)
```bash
cd mynote-web
npm install
node server.js
# Ouvre http://localhost:8000
```

## Option 2 - Render.com (gratuit, recommandé pour Toutatice)
1. Va sur render.com > New Web Service
2. Connecte ton GitHub avec ce dossier
3. Build: `npm install`
4. Start: `node server.js`
5. Ton site sera sur https://mynote-xxxx.onrender.com avec Toutatice qui marche

## Option 3 - Vercel (frontend seul, sans proxy)
Le frontend seul (index.html) peut aller sur Vercel/Netlify. Le proxy Toutatice ne marchera pas sans backend Node.
Pour Vercel, déploie tout le dossier avec `vercel --prod`

## Option 4 - GitHub Pages (démo seule)
Upload juste index.html sur GitHub Pages. Le navigateur Toutatice ne marchera pas (pas de proxy), mais l'interface MyNote oui.

## Fichiers
- index.html = Interface MyNote custom
- server.js = Proxy Toutatice + extraction Pronote + Pawnote
- package.json = dépendances
- README.md = Analyse technique connexion réelle
