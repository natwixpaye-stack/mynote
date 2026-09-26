import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pawnote from 'pawnote';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

// Cookie jars
const jars = new Map();
function getSid(req, res) {
  let sid = req.cookies.mynote_sid;
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    res.cookie('mynote_sid', sid, { httpOnly: false, sameSite: 'lax', maxAge: 1000*60*60*24*7 });
  }
  if (!jars.has(sid)) jars.set(sid, {});
  return sid;
}
function getCookiesForUrl(jar, targetUrl) {
  try {
    const u = new URL(targetUrl);
    const domain = u.hostname;
    const cookies = [];
    for (const [d, dict] of Object.entries(jar)) {
      if (domain.includes(d) || d.includes(domain) || d === 'global') {
        for (const [k,v] of Object.entries(dict)) cookies.push(`${k}=${v}`);
      }
    }
    if (jar['global']) {
      for (const [k,v] of Object.entries(jar['global'])) {
        if (!cookies.find(c=>c.startsWith(k+'='))) cookies.push(`${k}=${v}`);
      }
    }
    return cookies.join('; ');
  } catch { return ''; }
}
function storeCookies(jar, targetUrl, setCookieHeaders) {
  if (!setCookieHeaders) return;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const header of headers) {
    try {
      const parts = header.split(';')[0].split('=');
      const name = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      if (!name) continue;
      let domain = 'global';
      try { domain = new URL(targetUrl).hostname; } catch {}
      const domainMatch = header.match(/Domain=([^;]+)/i);
      if (domainMatch) domain = domainMatch[1].trim().replace(/^\./,'');
      if (!jar[domain]) jar[domain] = {};
      jar[domain][name] = value;
      if (!jar['global']) jar['global'] = {};
      jar['global'][name] = value;
    } catch {}
  }
}

// Injected script for MyNote extraction
function getInjectScript(baseUrl, autoReturn, pronoteUrl) {
  const autoReturnScript = autoReturn ? `
  // AUTO-RETURN MODE: Si on est sur Pronote eleve.html, on revient auto vers MyNote avec session
  function checkAutoReturn(){
    try {
      const isPronoteEleve = BASE_URL.includes('pronote') && BASE_URL.includes('eleve.html');
      const bodyText = document.body.innerText || '';
      const isPronoteLoaded = bodyText.includes('Emploi du temps') || bodyText.includes('Notes') || document.querySelector('.EDT_Cours, .cours, [class*=\"emploi\"]');
      
      if(isPronoteEleve && (isPronoteLoaded || document.readyState==='complete')) {
        // On est bien dans Pronote après login EduConnect
        console.log('MyNote auto-return triggered');
        
        // Affiche un bandeau MyNote
        const banner = document.createElement('div');
        banner.innerHTML = '<div style="position:fixed;top:0;left:0;right:0;z-index:999999;background:#6C7CFF;color:white;padding:16px;text-align:center;font-family:Inter;font-weight:600">✅ Connecté via EduConnect ! Retour vers MyNote dans 2s...<br><span style="font-size:12px;opacity:0.8">Tes données vont s\\'afficher dans l\\'interface MyNote</span></div>';
        document.body.prepend(banner.firstChild);
        
        // Capture quelques infos et retourne vers MyNote
        setTimeout(()=>{
          try {
            // On redirige vers MyNote avec un flag de succès - le backend a déjà les cookies en mémoire
            const returnUrl = location.origin.includes('mynote') ? '/' : 'https://mynote-k8am.onrender.com/';
            // Si on est dans iframe proxy, on postMessage au parent, sinon on redirige direct
            if(window.parent !== window) {
              window.parent.postMessage({type:'mynote:auto-return', realUrl: BASE_URL}, '*');
            } else {
              // Redirection directe automatique
              window.location.href = returnUrl + '?real=1&auto=1&fromPronote=1&realUrl=' + encodeURIComponent(BASE_URL);
            }
          } catch(e){
            window.location.href = 'https://mynote-k8am.onrender.com/?real=1&auto=1';
          }
        }, 2000);
        return true;
      }
    } catch(e){ console.log('autoReturn check error', e); }
    return false;
  }
  
  // Check auto-return plusieurs fois
  setTimeout(checkAutoReturn, 1000);
  setTimeout(checkAutoReturn, 3000);
  setTimeout(checkAutoReturn, 5000);
  window.addEventListener('load', ()=>setTimeout(checkAutoReturn, 1500));
  ` : '';

  return `
<script>
(function(){
  const BASE_URL = '${baseUrl.replace(/'/g,"\\'")}';
  const PRONOTE_URL = '${(pronoteUrl||'').replace(/'/g,"\\'")}';
  const AUTO_RETURN = ${autoReturn ? 'true' : 'false'};
  
  // Keep navigation inside proxy
  document.addEventListener('click', function(e){
    let a = e.target.closest('a[href]');
    if(!a) return;
    let href = a.getAttribute('href');
    if(!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('data:') || href.startsWith('mailto:')) return;
    try {
      let abs = new URL(href, window.location.href);
      if(abs.pathname.startsWith('/browse')) return;
      if(abs.protocol !== 'http:' && abs.protocol !== 'https:') return;
      e.preventDefault();
      const autoParam = AUTO_RETURN ? '&autoReturn=1' : '';
      window.location.href = '/browse?url=' + encodeURIComponent(abs.toString()) + autoParam;
    } catch {}
  }, true);
  
  document.addEventListener('submit', function(e){
    let form = e.target;
    if(!form.action) return;
    try {
      let abs = new URL(form.action, window.location.href);
      if(abs.pathname.startsWith('/browse')) return;
      if(abs.protocol !== 'http:' && abs.protocol !== 'https:') return;
      const autoParam = AUTO_RETURN ? (abs.toString().includes('?') ? '&autoReturn=1' : '?autoReturn=1') : '';
      form.action = '/browse?url=' + encodeURIComponent(abs.toString() + autoParam);
    } catch {}
  }, true);

  // Notify parent
  try {
    window.parent.postMessage({type:'mynote:navigate', url: window.location.href, realUrl: BASE_URL, autoReturn: AUTO_RETURN}, '*');
  } catch {}

  ${autoReturnScript}

  // MyNote extractor
  function extractPronoteData(){
    try {
      const bodyText = document.body.innerText || '';
      const isPronote = BASE_URL.includes('pronote') && (BASE_URL.includes('eleve.html') || bodyText.includes('PRONOTE'));
      if(isPronote) {
        window.parent.postMessage({type:'mynote:pronote-detected', realUrl: BASE_URL}, '*');
      }
    } catch(e){}
  }
  
  if(document.readyState === 'complete') extractPronoteData();
  else window.addEventListener('load', extractPronoteData);
  setTimeout(extractPronoteData, 2000);

  // Hook XHR
  (function(){
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url){
      this._mynote_url = url;
      this._mynote_method = method;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(){
      this.addEventListener('load', function(){
        try {
          if(this._mynote_url && this._mynote_url.includes('pronote') && this.responseText) {
            const preview = this.responseText.substring(0,2000);
            if(preview.includes('ListeCours') || preview.includes('Moyenne') || preview.includes('TAF') || preview.includes('Notes')) {
              window.parent.postMessage({
                type:'mynote:api-captured',
                url: this._mynote_url,
                preview: preview.substring(0,3000),
                realBaseUrl: BASE_URL
              }, '*');
            }
          }
        } catch {}
      });
      return origSend.apply(this, arguments);
    };
  })();
})();
</script>
`;
}

function rewriteHtml(html, baseUrl, autoReturn, pronoteUrl) {
  try {
    const $ = cheerio.load(html, { decodeEntities: false });
    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('meta[http-equiv="X-Frame-Options"]').remove();
    $('meta[http-equiv="content-security-policy"]').remove();
    $('head').append(getInjectScript(baseUrl, autoReturn, pronoteUrl));

    const attrs = [
      { sel: 'a[href]', attr: 'href' },
      { sel: 'link[href]', attr: 'href' },
      { sel: 'img[src]', attr: 'src' },
      { sel: 'script[src]', attr: 'src' },
      { sel: 'iframe[src]', attr: 'src' },
      { sel: 'form[action]', attr: 'action' },
    ];
    for (const { sel, attr } of attrs) {
      $(sel).each((_, el) => {
        let val = $(el).attr(attr);
        if (!val) return;
        if (val.startsWith('data:') || val.startsWith('blob:') || val.startsWith('javascript:') || val.startsWith('#') || val.startsWith('mailto:')) return;
        if (val.startsWith('/browse?url=')) return;
        try {
          const absolute = new URL(val, baseUrl).toString();
          if (!absolute.startsWith('http://') && !absolute.startsWith('https://')) return;
          $(el).attr(attr, '/browse?url=' + encodeURIComponent(absolute));
        } catch {}
      });
    }
    $('[style]').each((_, el) => {
      let style = $(el).attr('style');
      if (!style || !style.includes('url(')) return;
      try {
        const newStyle = style.replace(/url\(['"]?([^'")]+)['"]?\)/g, (m, url) => {
          if (url.startsWith('data:')) return m;
          try {
            const absolute = new URL(url, baseUrl).toString();
            return `url('/browse?url=${encodeURIComponent(absolute)}')`;
          } catch { return m; }
        });
        $(el).attr('style', newStyle);
      } catch {}
    });
    return $.html();
  } catch (e) {
    console.error('rewrite error', e);
    return html;
  }
}

// Proxy endpoint
app.all('/browse', async (req, res) => {
  const targetUrl = req.query.url || req.body?.url;
  const autoReturn = req.query.autoReturn === '1' || req.body?.autoReturn === '1';
  const pronoteUrl = req.query.pronoteUrl || req.body?.pronoteUrl || '';
  if (!targetUrl) return res.status(400).send('URL manquante');
  let parsedTarget;
  try { parsedTarget = new URL(targetUrl); } catch { return res.status(400).send('URL invalide'); }
  if (!['http:', 'https:'].includes(parsedTarget.protocol)) return res.status(400).send('Protocole non autorisé');

  const sid = getSid(req, res);
  const jar = jars.get(sid);
  const headers = {};
  if (req.headers['user-agent']) headers['User-Agent'] = req.headers['user-agent'];
  if (req.headers['accept']) headers['Accept'] = req.headers['accept'];
  if (req.headers['accept-language']) headers['Accept-Language'] = req.headers['accept-language'];
  if (req.headers['referer']) {
    try {
      const refUrl = new URL(req.headers['referer']);
      const realRef = refUrl.searchParams.get('url');
      headers['Referer'] = realRef ? realRef : targetUrl;
    } catch { headers['Referer'] = targetUrl; }
  }
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  const cookieHeader = getCookiesForUrl(jar, targetUrl);
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  let body = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.is('application/x-www-form-urlencoded')) {
      body = new URLSearchParams(req.body).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (req.is('application/json')) {
      body = JSON.stringify(req.body);
      headers['Content-Type'] = 'application/json';
    } else if (req.body && Object.keys(req.body).length) {
      body = new URLSearchParams(req.body).toString();
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, { method: req.method, headers, body, redirect: 'manual' });
    const setCookies = upstreamRes.headers.getSetCookie ? upstreamRes.headers.getSetCookie() : upstreamRes.headers.get('set-cookie');
    if (setCookies) storeCookies(jar, targetUrl, setCookies);

    if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
      const location = upstreamRes.headers.get('location');
      if (location) {
        const absoluteLocation = new URL(location, targetUrl).toString();
        return res.redirect(302, '/browse?url=' + encodeURIComponent(absoluteLocation));
      }
    }

    const contentType = upstreamRes.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      let html = await upstreamRes.text();
      html = rewriteHtml(html, targetUrl, autoReturn, pronoteUrl);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Content-Security-Policy', "frame-ancestors *");
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(html);
    } else {
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      if (contentType) res.setHeader('Content-Type', contentType);
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (contentType.includes('text/css')) {
        let css = buffer.toString('utf-8');
        css = css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (m, url) => {
          if (url.startsWith('data:')) return m;
          try {
            const absolute = new URL(url, targetUrl).toString();
            return `url('/browse?url=${encodeURIComponent(absolute)}')`;
          } catch { return m; }
        });
        return res.send(css);
      }
      return res.send(buffer);
    }
  } catch (err) {
    console.error('Proxy error', targetUrl, err);
    res.status(500).send(`<html><body style="background:#0B1224;color:white;padding:40px;font-family:Inter"><h2>Erreur proxy</h2><p>${targetUrl}</p><pre>${err.message}</pre><a href="/" style="color:#6C7CFF">Retour MyNote</a></body></html>`);
  }
});

// Real Pronote extraction via Pawnote
app.post('/api/login-pronote', async (req, res) => {
  const { pronoteUrl, username, password } = req.body;
  if (!pronoteUrl || !username || !password) {
    return res.status(400).json({ error: 'pronoteUrl, username, password requis' });
  }
  try {
    const cleanUrl = pawnote.cleanURL(pronoteUrl);
    const session = pawnote.createSessionHandle();
    
    // Get instance
    const instance = await pawnote.instance(cleanUrl);
    console.log('Instance:', instance.name, 'CAS:', instance.casURL);

    // If CAS (ENT like Toutatice), we need to handle differently
    // For now, try direct credentials login
    const kind = pawnote.AccountKind.STUDENT;
    
    await pawnote.loginCredentials(session, {
      url: cleanUrl,
      kind,
      username,
      password,
      deviceUUID: 'mynote-' + Math.random().toString(36).slice(2),
      navigatorIdentifier: 'MyNote/1.0'
    });

    // If success, fetch real data
    const [timetable, grades, homeworks, notebook] = await Promise.all([
      pawnote.timetableFromIntervals(session, new Date(), new Date(Date.now()+7*24*60*60*1000)).catch(e=>({error:e.message, classes:[]})),
      pawnote.gradesOverview(session).catch(e=>({error:e.message})),
      pawnote.assignmentsFromIntervals(session, new Date(), new Date(Date.now()+14*24*60*60*1000)).catch(e=>[]),
      pawnote.homepage(session).catch(e=>null)
    ]);

    res.json({
      success: true,
      user: session.user,
      instance: { name: instance.name, version: instance.version },
      timetable,
      grades,
      homeworks,
      homepage: homepage ? { hasData: true } : null
    });

  } catch (err) {
    console.error('Pawnote login error', err);
    res.status(500).json({ 
      error: err.message, 
      name: err.name,
      details: 'Vérifie ton URL Pronote et tes identifiants. Pour Toutatice/EduConnect, utilise le QR Code.'
    });
  }
});

// QR Code login - méthode officielle Pronote - VERSION CORRIGÉE
app.post('/api/login-qr', async (req, res) => {
  const { qrData, pin } = req.body;
  if (!qrData) return res.status(400).json({ error: 'qrData manquant' });
  
  console.log('QR login attempt, pin:', pin, 'qr length:', qrData.length, 'qr preview:', qrData.substring(0,100));
  
  try {
    let qrObj = null;
    let cleanQrData = qrData.trim();
    
    // Essaie de parser différents formats
    // Format 1: pronote://?url=...&login=...&jeton=...&pin=...
    // Format 2: JSON {"url": "...", "login": "...", "jeton": "..."}
    // Format 3: Base64 ou autre
    
    if (cleanQrData.startsWith('pronote://')) {
      try {
        const urlObj = new URL(cleanQrData);
        qrObj = {
          url: urlObj.searchParams.get('url') || urlObj.searchParams.get('pronote_url'),
          login: urlObj.searchParams.get('login'),
          jeton: urlObj.searchParams.get('jeton') || urlObj.searchParams.get('token')
        };
        console.log('Parsed pronote:// URL', qrObj);
      } catch(e) {
        console.log('Failed to parse pronote:// URL', e.message);
      }
    }
    
    if (!qrObj || !qrObj.url) {
      try {
        const parsed = JSON.parse(cleanQrData);
        if (parsed.url && parsed.login && parsed.jeton) {
          qrObj = parsed;
        } else if (parsed.data) {
          // Parfois c'est nested
          qrObj = parsed.data;
        }
      } catch {}
    }
    
    if (!qrObj || !qrObj.url) {
      // Essaie de trouver url, login, jeton dans le texte avec regex
      const urlMatch = cleanQrData.match(/https?:\/\/[^\s&"]+\.index-education\.net\/pronote\/?/);
      const loginMatch = cleanQrData.match(/"login"\s*:\s*"([^"]+)"|login=([^&\s]+)/);
      const jetonMatch = cleanQrData.match(/"jeton"\s*:\s*"([^"]+)"|jeton=([^&\s]+)/);
      
      if (urlMatch) {
        qrObj = {
          url: urlMatch[0],
          login: loginMatch ? (loginMatch[1]||loginMatch[2]) : null,
          jeton: jetonMatch ? (jetonMatch[1]||jetonMatch[2]) : null
        };
      }
    }
    
    if (!qrObj || !qrObj.url || !qrObj.login || !qrObj.jeton) {
      return res.status(400).json({ 
        error: 'QR Code incomplet - il manque url, login ou jeton',
        details: 'Dans Pronote, génère le QR Code, puis avec ton téléphone scanne-le et copie le LIEN COMPLET pronote://... qui contient url, login, jeton. Ou sur PC, fais clic droit sur le QR > Inspecter et cherche les données.',
        receivedPreview: cleanQrData.substring(0,300),
        help: 'Le QR doit ressembler à: pronote://?url=https://0350774L.index-education.net/pronote/&login=TONLOGIN&jeton=TOKEN123'
      });
    }

    const session = pawnote.createSessionHandle();
    const deviceUUID = 'mynote-' + Math.random().toString(36).slice(2) + Date.now().toString(36).slice(2);
    
    console.log('Attempting pawnote loginQrCode with', {url: qrObj.url, login: qrObj.login, hasJeton: !!qrObj.jeton, pin});
    
    // Pawnote attend un objet qr avec url, login, jeton
    await pawnote.loginQrCode(session, {
      qr: {
        url: qrObj.url,
        login: qrObj.login,
        jeton: qrObj.jeton
      },
      pin: pin || '',
      deviceUUID,
      navigatorIdentifier: 'MyNote/1.0'
    });

    console.log('Pawnote login success, user:', session.user?.name);

    // Récupère les vraies données
    const [timetable, grades, homeworks] = await Promise.all([
      pawnote.timetableFromIntervals(session, new Date(), new Date(Date.now()+7*24*60*60*1000)).catch(e=>{console.log('timetable error', e.message); return {error:e.message, classes:[]}}),
      pawnote.gradesOverview(session).catch(e=>{console.log('grades error', e.message); return {error:e.message}}),
      pawnote.assignmentsFromIntervals(session, new Date(), new Date(Date.now()+14*24*60*60*1000)).catch(e=>{console.log('homeworks error', e.message); return []})
    ]);

    res.json({
      success: true,
      user: { name: session.user?.name, class: session.user?.studentClass?.name, id: session.user?.id },
      instance: { url: qrObj.url },
      timetable,
      grades,
      homeworks,
      message: '✅ Connecté via QR Code - Données réelles récupérées'
    });

  } catch (err) {
    console.error('QR login error full', err);
    let friendlyError = err.message;
    if (err.message.includes('BadCredentials')) friendlyError = 'QR Code ou PIN incorrect - le QR a expiré (10 min) ou le PIN est faux. Génère un nouveau QR dans Pronote.';
    if (err.message.includes('PageUnavailable')) friendlyError = 'Page Pronote non trouvée - Vérifie ton URL Pronote (ex: https://0350774L.index-education.net/pronote/)';
    if (err.message.includes('AccessDenied')) friendlyError = 'Accès refusé - Ton compte n\'a pas accès à cette partie ou le QR a expiré';
    
    res.status(500).json({ 
      error: friendlyError, 
      originalError: err.message,
      name: err.name,
      help: 'Génère un NOUVEAU QR Code dans Pronote (il expire après 10 min) et réessaie immédiatement avec le bon PIN à 4 chiffres.'
    });
  }
});

// Endpoint pour tester URL Pronote
app.get('/api/test-pronote', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url manquant' });
  try {
    const clean = pawnote.cleanURL(url);
    const instance = await pawnote.instance(clean);
    res.json({ success: true, cleanUrl: clean, instance: { name: instance.name, version: instance.version, hasCAS: !!instance.casURL, casURL: instance.casURL } });
  } catch(e){
    res.status(500).json({ error: e.message, name: e.name });
  }
});

// Try to get data from current proxy session cookies (if user logged via browser)
app.get('/api/session-data', async (req, res) => {
  const sid = req.cookies.mynote_sid;
  if (!sid || !jars.has(sid)) return res.json({ error: 'Pas de session Toutatice active. Connecte-toi via le navigateur.' });
  
  const jar = jars.get(sid);
  const cookies = jar['global'] || {};
  
  // Check if we have Pronote cookies
  const hasPronoteCookie = Object.keys(cookies).some(k=>k.toLowerCase().includes('pronote') || k.toLowerCase().includes('applimobile') || k.toLowerCase().includes('validation'));
  
  res.json({
    hasSession: true,
    cookiesCount: Object.keys(cookies).length,
    hasPronoteCookie,
    cookiesPreview: Object.keys(cookies).slice(0,10),
    message: hasPronoteCookie ? 'Session Pronote détectée ! On peut tenter extraction.' : 'Session Toutatice active mais pas encore de session Pronote. Va sur Pronote via le navigateur.'
  });
});

// --- NOUVEAU FLUX LIEN EDUCONNECT -> MYNOTE (sans iframe) ---
const authStates = new Map();

app.get('/auth/start', (req, res) => {
  const { pronoteUrl, redirect_uri } = req.query;
  if (!pronoteUrl) return res.status(400).send('pronoteUrl manquant');
  
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const finalRedirect = redirect_uri || `${req.protocol}://${req.get('host')}/auth/callback`;
  
  authStates.set(state, {
    pronoteUrl,
    redirect_uri: finalRedirect,
    createdAt: Date.now(),
    sid: req.cookies.mynote_sid
  });

  // NOUVEAU: Retour automatique via proxy avec autoReturn=1 + pronoteUrl pour bouton direct
  const toutaticeLogin = `https://www.toutatice.fr/cas/login?service=${encodeURIComponent(pronoteUrl)}`;
  const proxiedWithAutoReturn = `/browse?url=${encodeURIComponent(toutaticeLogin)}&autoReturn=1&pronoteUrl=${encodeURIComponent(pronoteUrl)}&state=${state}`;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>MyNote → EduConnect</title>
    <style>body{font-family:Inter,sans-serif;background:#0B1224;color:white;padding:40px;max-width:600px;margin:auto}
    .card{background:#151E35;border:1px solid #233154;border-radius:20px;padding:24px;margin:20px 0}
    .btn{display:block;width:100%;height:52px;background:#6C7CFF;color:white;border-radius:12px;text-align:center;line-height:52px;font-weight:600;text-decoration:none;margin:12px 0}
    </style></head>
    <body>
      <h1>🔗 MyNote → Toutatice → EduConnect</h1>
      <div class="card" style="border-color:#2ECC71;background:rgba(46,204,113,0.1)">
        <b>✅ Retour automatique activé !</b><br><br>
        MyNote va t'envoyer vers Toutatice → EduConnect, et te ramener <b>automatiquement</b> avec ta session, sans bookmarklet.
      </div>
      <div class="card">
        <b>Parcours :</b><br>
        1. MyNote (lien) → Toutatice<br>
        2. Toutatice → EduConnect<br>
        3. Login<br>
        4. Retour Toutatice → Pronote<br>
        5. <b style="color:#2ECC71">Pronote détecté → Retour auto vers MyNote</b>
      </div>
      <a class="btn" href="${proxiedWithAutoReturn}">🔗 Continuer vers Toutatice → EduConnect (retour auto)</a>
      <p><a href="/" style="color:#6C7CFF">← Retour MyNote</a></p>
      <script>setTimeout(()=>{ window.location.href = "${proxiedWithAutoReturn}"; }, 800);</script>
    </body>
    </html>
  `);
});

app.get('/auth/callback', (req, res) => {
  const { state, data, ticket, realUrl } = req.query;
  if (ticket) {
    return res.send(`<html><body style="background:#0B1224;color:white;font-family:Inter;padding:40px"><h1>Ticket CAS: ${ticket}</h1><p>Toutatice refuse normalement mynote comme service, donc ce cas n'arrive pas.</p><a href="/" style="color:#6C7CFF">Retour</a></body></html>`);
  }
  if (data) {
    try {
      const jsonStr = decodeURIComponent(escape(atob(data)));
      const parsed = JSON.parse(jsonStr);
      const sid = getSid(req, res);
      const jar = jars.get(sid);
      if (!jar['mynote_real']) jar['mynote_real'] = {};
      jar['mynote_real'] = { url: parsed.url || realUrl, capturedAt: Date.now(), state };
      return res.redirect(`/?real=1&state=${state}&realUrl=${encodeURIComponent(realUrl||parsed.url||'')}`);
    } catch (e) {
      return res.send(`<html><body style="background:#0B1224;color:white;padding:40px"><h1>Erreur</h1><pre>${e.message}</pre><a href="/">Retour</a></body></html>`);
    }
  }
  res.redirect('/?real=1');
});

// Clear
app.get('/api/clear', (req,res)=>{
  const sid = req.cookies.mynote_sid;
  if (sid) jars.delete(sid);
  res.clearCookie('mynote_sid');
  res.json({ ok:true });
});

app.get('/api/health', (req,res)=>res.json({ ok:true, jars: jars.size, pawnote: true, flow: 'link-educonnect' }));

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', ()=>{
  console.log(`MyNote Proxy + Pawnote running on http://0.0.0.0:${PORT}`);
});
