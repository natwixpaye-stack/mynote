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
function getInjectScript(baseUrl) {
  return `
<script>
(function(){
  const BASE_URL = '${baseUrl.replace(/'/g,"\\'")}';
  
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
      window.location.href = '/browse?url=' + encodeURIComponent(abs.toString());
    } catch {}
  }, true);
  
  document.addEventListener('submit', function(e){
    let form = e.target;
    if(!form.action) return;
    try {
      let abs = new URL(form.action, window.location.href);
      if(abs.pathname.startsWith('/browse')) return;
      if(abs.protocol !== 'http:' && abs.protocol !== 'https:') return;
      form.action = '/browse?url=' + encodeURIComponent(abs.toString());
    } catch {}
  }, true);

  // Notify parent
  try {
    window.parent.postMessage({type:'mynote:navigate', url: window.location.href, realUrl: BASE_URL}, '*');
  } catch {}

  // MyNote extractor - tries to find Pronote data in page
  function extractPronoteData(){
    try {
      const data = { url: BASE_URL, timestamp: Date.now() };
      
      // Try to find Pronote global objects
      if(window.pronote || window.PRONOTE || window.data) {
        data.hasPronoteGlobal = true;
      }
      
      // Try to extract visible timetable, grades, etc. from DOM
      const bodyText = document.body.innerText || '';
      
      // Look for common Pronote selectors
      const timetable = [];
      document.querySelectorAll('[class*=\"cours\"], [class*=\"edt\"], .EDT_Cours, .cours').forEach(el=>{
        const txt = el.innerText?.trim();
        if(txt && txt.length>3 && txt.length<200) timetable.push(txt);
      });
      
      // Try to get localStorage/sessionStorage tokens
      try {
        const ls = {};
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if(k && (k.toLowerCase().includes('pronote') || k.toLowerCase().includes('appli'))) {
            ls[k]=localStorage.getItem(k)?.substring(0,200);
          }
        }
        data.localStorage = ls;
      } catch {}
      
      // Check if we're on Pronote eleve page
      const isPronote = BASE_URL.includes('pronote') && (BASE_URL.includes('eleve.html') || bodyText.includes('PRONOTE'));
      data.isPronote = isPronote;
      
      if(isPronote) {
        // Try to find Start() data which contains session info
        const html = document.documentElement.innerHTML;
        const startMatch = html.match(/Start\\(\\s*\\{[\\s\\S]*?\\}\\s*\\)/);
        if(startMatch) {
          data.hasStartData = true;
          data.startDataSnippet = startMatch[0].substring(0,500);
        }
        
        // Notify parent that we're on Pronote
        window.parent.postMessage({type:'mynote:pronote-detected', realUrl: BASE_URL, bodyPreview: bodyText.substring(0,1000)}, '*');
      }
      
      // Store for later extraction
      window.__MYNOTE_DATA__ = data;
      
    } catch(e){
      console.log('MyNote extract error', e);
    }
  }
  
  // Run extraction after load
  if(document.readyState === 'complete') extractPronoteData();
  else window.addEventListener('load', extractPronoteData);
  setTimeout(extractPronoteData, 2000);
  setTimeout(extractPronoteData, 5000);

  // Hook XHR to capture Pronote API responses
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
            // Try to detect if it's timetable, grades, etc.
            if(preview.includes('ListeCours') || preview.includes('Moyenne') || preview.includes('TAF') || preview.includes('Notes')) {
              window.parent.postMessage({
                type:'mynote:api-captured',
                url: this._mynote_url,
                method: this._mynote_method,
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

function rewriteHtml(html, baseUrl) {
  try {
    const $ = cheerio.load(html, { decodeEntities: false });
    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('meta[http-equiv="X-Frame-Options"]').remove();
    $('meta[http-equiv="content-security-policy"]').remove();
    $('head').append(getInjectScript(baseUrl));

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
      html = rewriteHtml(html, targetUrl);
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
      details: 'Vérifie ton URL Pronote et tes identifiants. Pour Toutatice/EduConnect, utilise le navigateur intégré car Pawnote ne gère pas directement EduConnect (il faut passer par CAS).'
    });
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

// Clear
app.get('/api/clear', (req,res)=>{
  const sid = req.cookies.mynote_sid;
  if (sid) jars.delete(sid);
  res.clearCookie('mynote_sid');
  res.json({ ok:true });
});

app.get('/api/health', (req,res)=>res.json({ ok:true, jars: jars.size, pawnote: true }));

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', ()=>{
  console.log(`MyNote Proxy + Pawnote running on http://0.0.0.0:${PORT}`);
});
