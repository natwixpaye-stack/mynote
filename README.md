# MyNote — Analyse technique de la connexion réelle Pronote → Toutatice → EduConnect

**Date : 26 septembre 2026**

## 1. Parcours officiel en Bretagne (Académie de Rennes)

```
MyNote (web) 
→ https://<etablissement>.index-education.net/pronote/eleve.html
→ Redirection vers https://www.toutatice.fr (ENT)
→ Sélection profil Élève
→ Redirection vers https://educonnect.education.gouv.fr (ou FranceConnect)
→ Authentification EduConnect (identifiant + mot de passe + éventuel 2FA)
→ Retour SAML vers Toutatice (assertion SAML + cookie JSESSIONID)
→ Toutatice génère un ticket CAS pour Pronote
→ Redirection vers Pronote avec ticket : .../pronote/eleve.html?ticket=ST-xxx
→ Pronote valide le ticket, crée une session (cookie + session ID chiffré)
→ Accès à l'interface Pronote
```

C'est le parcours imposé par le Ministère. Il n'y a PAS de redirection OAuth vers une app tierce.

## 2. Pourquoi `my-note://auth/callback` ou `https://mynote.app/auth/callback` ne fonctionne PAS

- **Pronote** n'est pas un fournisseur OAuth. Il ne connaît pas le concept de `redirect_uri` custom. Son endpoint de login ne prend que `?ticket=` venant d'un CAS whitelisté (Toutatice).
- **Toutatice** est un CAS (Central Authentication Service) fermé. La liste des services autorisés est configurée côté académie. On ne peut pas y ajouter `mynote.app` sans accord académique.
- **EduConnect** est un fournisseur d'identité national. Il ne permet pas à une app tierce non conventionnée de s'y brancher directement. Il faut passer par un ENT.

**Conclusion : Il est techniquement impossible de faire un retour automatique MyNote → Pronote → Toutatice → EduConnect → MyNote avec un callback custom sans contourner la sécurité.** Papillon, Pronote+, etc. le savent et n'essaient pas.

## 3. Comment font les vraies apps (Papillon, etc.) ?

Elles utilisent 3 méthodes, toutes basées sur un **WebView embarqué** :

### Méthode A - WebView + interception réseau (la plus utilisée)
1. L'app ouvre un `WKWebView` (iOS) / `WebView` (Android) qui charge l'URL Pronote.
2. L'utilisateur s'authentifie manuellement via Toutatice/EduConnect DANS le WebView.
3. L'app intercepte les cookies (`CASTGC`, `JSESSIONID`, `evolutionSession`) et les requêtes XHR que fait le client Pronote (API privée chiffrée en AES).
4. Elle rejoue ces requêtes côté natif avec les mêmes cookies pour récupérer `timetable`, `marks`, `homeworks`, etc.
5. C'est fragile (si Index-Education change le chiffrement, ça casse) mais ça respecte le parcours officiel car l'utilisateur tape son mot de passe dans le vrai site EduConnect.

**Sur un site web pur, cette méthode est impossible** à cause de CORS et du fait qu'on ne peut pas lire les cookies d'un autre domaine depuis JS.

### Méthode B - QR Code Mobile (méthode OFFICIELLE Pronote)
C'est la seule méthode officiellement supportée par Index-Education :
1. L'utilisateur se connecte normalement à Pronote via Toutatice sur son PC.
2. Dans Pronote : Informations personnelles > Compte > QR Code / Appli mobile > Générer un QR Code.
3. Le QR contient : `pronote://` + URL + login + mot de passe chiffré + clé AES.
4. L'app tierce scanne le QR et peut ensuite se connecter en direct à Pronote sans passer par l'ENT (car le QR contient des identifiants Pronote directs).

C'est la méthode la plus stable et c'est celle que MyNote Web implémente.

### Méthode C - Identifiants Pronote directs (hors ENT)
Certains établissements donnent encore des identifiants Pronote directs (pas via ENT). Dans ce cas `pronote-api` peut se connecter directement avec `login(url, username, password)`.

## 4. Architecture réelle retenue pour MyNote Web

Pour respecter ton exigence "pas de fausse API, pas de contournement" :

**Frontend (ce site) :**
- PWA en HTML/CSS/JS, 100% client-side par défaut
- Stockage sécurisé en localStorage + IndexedDB (équivalent Keychain web)
- Mode démo clairement étiqueté "DONNÉES FICTIVES"

**Backend nécessaire pour la synchro réelle (à déployer) :**
```js
// server.js - exemple avec pronote-api-papillon
import { login } from '@dorian-eydoux/pronote-api';

app.post('/api/sync', async (req, res) => {
  const { pronoteUrl, qrData } = req.body; // qrData vient du scan QR
  // OU pour les établissements hors ENT :
  // const { pronoteUrl, username, password, cas } = req.body

  const session = await login(pronoteUrl, qrData.username, qrData.password, 'toutatice');
  
  const [timetable, marks, homeworks, absences, infos] = await Promise.all([
    session.timetable(new Date()),
    session.marks(),
    session.homeworks(new Date()),
    session.absences(),
    session.infos()
  ]);

  res.json({ timetable, marks, homeworks, absences, infos });
});
```
Ce backend agit comme proxy car le chiffrement Pronote et les cookies ne peuvent pas être gérés depuis le navigateur seul (CORS).

**Flux utilisateur final réel :**
1. Dans MyNote Web, clic sur "Se connecter à Pronote" → on te demande ton URL Pronote (ex: https://035...index-education.net/pronote/)
2. On t'ouvre cette URL dans un nouvel onglet → tu te connectes via Toutatice/EduConnect
3. Une fois dans Pronote, tu vas dans Infos perso > QR Code > tu copies le code
4. Retour dans MyNote → "Coller le QR Code" → MyNote appelle `/api/sync` qui récupère TES VRAIES DONNÉES
5. Les données sont stockées localement, chiffrées, et affichées dans l'interface que tu vois

**Sans backend, MyNote Web fonctionne en mode local** : tu peux créer tes propres devoirs, gérer ton emploi du temps manuellement, et il est prêt à recevoir les vraies données dès que tu fournis le QR.

## 5. Ce qui est impossible à ce jour (honnêteté)

- ❌ Retour automatique `my-note://` après login EduConnect : impossible, ENT ne le permet pas
- ❌ Récupération directe depuis JS frontend sans backend : impossible (CORS + AES + cookies HttpOnly)
- ❌ Notifications push "nouvelle note" sans backend qui poll Pronote : impossible en pur frontend
- ✅ Tout le reste (emploi du temps, notes, devoirs, cahier de textes, absences) : possible via QR Code + backend proxy

## 6. Pour toi, Noah (Première Générale)

Tes spés Math / Physique-Chimie / SES seront mises en évidence dans l'interface (badge). Le code est prêt, il attend juste ton URL Pronote et ton QR Code pour passer de "Mode démo" à "Données réelles".

Tu peux héberger le backend gratuitement sur Render / Fly.io / Vercel Functions avec la librairie `pronote-api-papillon`.

---

**Références :**
- Papillon : https://getpapillon.xyz
- pronote-api (Litarvan) : https://github.com/Litarvan/pronote-api
- Fork Papillon : https://github.com/andronedev/pronote-api-papillon
- Analyse ENT Bretagne : Toutatice utilise CAS + SAML EduConnect
