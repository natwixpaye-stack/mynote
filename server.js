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

// Debug storage
let lastError = null;
let lastSuccess = null;
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

// Health
app.get('/api/health', (req,res)=>{
  res.json({ok:true, jars:jars.size, pawnote:true, flow:'link-educonnect-debug', lastError: lastError?.time, lastSuccess: lastSuccess?.time});
});
app.get('/api/debug/last', (req,res)=>{
  res.json({lastError, lastSuccess});
});

// Test Pronote URL
app.get('/api/test-pronote', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url manquant' });
  try {
    const clean = pawnote.cleanURL(url);
    console.log('[test-pronote] cleanURL', clean);
    const instance = await pawnote.instance(clean);
    res.json({ success: true, cleanUrl: clean, instance: { name: instance.name, version: instance.version, hasCAS: !!instance.casURL, casURL: instance.casURL, casToken: instance.casToken } });
  } catch(e){
    console.error('[test-pronote] error', e);
    lastError = { time: new Date().toISOString(), endpoint: 'test-pronote', url, error: e.message, name: e.name, stack: e.stack?.substring(0,1000) };
    res.status(500).json({ error: e.message, name: e.name, help: e.name==='PageUnavailableError' ? 'Ton Pronote bloque les serveurs externes (Render). Essaie le login direct avec identifiants Pronote ou utilise MyNote en local.' : '' });
  }
});

// Login direct Pronote (identifiants Pronote fournis par le collège, pas EduConnect)
app.post('/api/login-direct', async (req,res)=>{
  const { pronoteUrl, username, password } = req.body;
  if (!pronoteUrl || !username || !password) return res.status(400).json({error:'pronoteUrl, username, password requis'});
  console.log('[login-direct] attempt', pronoteUrl, username);
  try {
    const clean = pawnote.cleanURL(pronoteUrl);
    const session = pawnote.createSessionHandle();
    const deviceUUID = 'mynote-' + Math.random().toString(36).slice(2) + Date.now().toString(36).slice(2);
    
    const login = await pawnote.loginCredentials(session, {
      url: clean,
      kind: pawnote.AccountKind.STUDENT,
      username,
      password,
      deviceUUID,
      navigatorIdentifier: 'MyNote/1.0'
    });
    
    console.log('[login-direct] success', session.user?.name);
    
    const [timetable, grades, homeworks] = await Promise.all([
      pawnote.timetableFromIntervals(session, new Date(), new Date(Date.now()+7*24*60*60*1000)).catch(e=>{console.log('timetable error', e.message); return {error:e.message, classes:[]}}),
      pawnote.gradesOverview(session).catch(e=>{console.log('grades error', e.message); return {error:e.message}}),
      pawnote.assignmentsFromIntervals(session, new Date(), new Date(Date.now()+14*24*60*60*1000)).catch(e=>{console.log('homeworks error', e.message); return []})
    ]);
    
    lastSuccess = { time: new Date().toISOString(), method: 'direct', user: session.user?.name };
    
    res.json({
      success: true,
      user: { name: session.user?.name, class: session.user?.studentClass?.name, id: session.user?.id },
      instance: { url: clean },
      timetable, grades, homeworks
    });
  } catch(err){
    console.error('[login-direct] error', err);
    lastError = { time: new Date().toISOString(), endpoint: 'login-direct', pronoteUrl, username, error: err.message, name: err.name, stack: err.stack?.substring(0,1500) };
    let friendly = err.message;
    if (err.name==='BadCredentialsError') friendly = 'Identifiants incorrects';
    if (err.name==='PageUnavailableError') friendly = 'Page Pronote non trouvée - URL invalide ou serveur Pronote bloque Render (IP datacenter). Essaie avec l\'URL exacte de ton collège.';
    if (err.name==='AccessDeniedError') friendly = 'Accès refusé - compte désactivé ou pas les droits';
    res.status(500).json({ error: friendly, originalError: err.message, name: err.name, stack: err.stack?.substring(0,500) });
  }
});

// QR Code login - VERSION DEBUG AMÉLIORÉE
app.post('/api/login-qr', async (req, res) => {
  const { qrData, pin } = req.body;
  if (!qrData) return res.status(400).json({ error: 'qrData manquant' });
  
  console.log('[login-qr] attempt pin:', pin, 'len:', qrData.length, 'preview:', qrData.substring(0,120));
  
  try {
    let qrObj = null;
    let cleanQrData = qrData.trim();
    
    if (cleanQrData.startsWith('pronote://')) {
      try {
        const urlObj = new URL(cleanQrData);
        qrObj = {
          url: urlObj.searchParams.get('url'),
          login: urlObj.searchParams.get('login'),
          jeton: urlObj.searchParams.get('jeton') || urlObj.searchParams.get('token')
        };
        console.log('[login-qr] parsed pronote://', qrObj.url, qrObj.login);
      } catch(e) {
        console.log('[login-qr] failed parse pronote://', e.message);
      }
    }
    
    if (!qrObj || !qrObj.url) {
      try {
        const parsed = JSON.parse(cleanQrData);
        if (parsed.url && parsed.login && parsed.jeton) qrObj = parsed;
        else if (parsed.data && parsed.data.url) qrObj = parsed.data;
      } catch {}
    }
    
    if (!qrObj || !qrObj.url) {
      const urlMatch = cleanQrData.match(/https?:\/\/[^\s&"']+\.index-education\.net\/pronote\/?/i);
      const loginMatch = cleanQrData.match(/"login"\s*:\s*"([^"]+)"|login=([^&\s"']+)/i);
      const jetonMatch = cleanQrData.match(/"jeton"\s*:\s*"([^"]+)"|jeton=([^&\s"']+)/i);
      if (urlMatch) {
        qrObj = {
          url: urlMatch[0],
          login: loginMatch ? (loginMatch[1]||loginMatch[2]) : null,
          jeton: jetonMatch ? (jetonMatch[1]||jetonMatch[2]) : null
        };
      }
    }
    
    if (!qrObj || !qrObj.url || !qrObj.login || !qrObj.jeton) {
      console.log('[login-qr] incomplete qr', qrObj);
      return res.status(400).json({ 
        error: 'QR incomplet',
        details: `Il manque: ${!qrObj?.url?'url ':''}${!qrObj?.login?'login ':''}${!qrObj?.jeton?'jeton':''}. Colle le LIEN COMPLET pronote://...`,
        receivedPreview: cleanQrData.substring(0,400),
        help: 'Format attendu: pronote://?url=https://XXXX.index-education.net/pronote/&login=TONLOGIN&jeton=TOKEN'
      });
    }

    const session = pawnote.createSessionHandle();
    const deviceUUID = 'mynote-' + Math.random().toString(36).slice(2) + Date.now().toString(36).slice(2);
    
    console.log('[login-qr] pawnote.loginQrCode', {url: qrObj.url, login: qrObj.login, pin: pin||'(vide)', deviceUUID});
    
    await pawnote.loginQrCode(session, {
      qr: { url: qrObj.url, login: qrObj.login, jeton: qrObj.jeton },
      pin: pin || '',
      deviceUUID,
      navigatorIdentifier: 'MyNote/1.0'
    });

    console.log('[login-qr] success user:', session.user?.name);

    const [timetable, grades, homeworks] = await Promise.all([
      pawnote.timetableFromIntervals(session, new Date(), new Date(Date.now()+7*24*60*60*1000)).catch(e=>{console.log('timetable error', e.message); return {error:e.message, classes:[]}}),
      pawnote.gradesOverview(session).catch(e=>{console.log('grades error', e.message); return {error:e.message}}),
      pawnote.assignmentsFromIntervals(session, new Date(), new Date(Date.now()+14*24*60*60*1000)).catch(e=>{console.log('homeworks error', e.message); return []})
    ]);

    lastSuccess = { time: new Date().toISOString(), method: 'qr', user: session.user?.name, url: qrObj.url };

    res.json({
      success: true,
      user: { name: session.user?.name, class: session.user?.studentClass?.name, id: session.user?.id },
      instance: { url: qrObj.url },
      timetable, grades, homeworks
    });

  } catch (err) {
    console.error('[login-qr] error', err);
    lastError = { time: new Date().toISOString(), endpoint: 'login-qr', pin, qrPreview: qrData.substring(0,200), error: err.message, name: err.name, stack: err.stack?.substring(0,1500) };
    let friendly = err.message;
    if (err.name==='BadCredentialsError' || err.message.includes('BadCredentials')) friendly = 'QR ou PIN incorrect - Le QR expire après 10 min ! Génère un NOUVEAU QR dans Pronote > Infos perso > Compte > QR Code et réessaie IMMÉDIATEMENT avec le bon PIN à 4 chiffres.';
    if (err.name==='PageUnavailableError') friendly = `Page Pronote non trouvée (${err.message}). Ton collège bloque peut-être les serveurs Render. Essaie le login direct avec identifiants Pronote (si ton collège te les a donnés) ou contacte-moi avec ton URL exacte.`;
    if (err.name==='AccessDeniedError') friendly = 'Accès refusé';
    
    res.status(500).json({ error: friendly, originalError: err.message, name: err.name });
  }
});

// Old proxy routes kept for compatibility
app.get('/auth/start', async (req,res)=>{
  const sid = getSid(req,res);
  const pronoteUrl = req.query.pronoteUrl || req.query.url || 'https://www.toutatice.fr';
  const returnTo = req.query.returnTo || '/';
  const jar = jars.get(sid);
  try {
    const target = pronoteUrl;
    const cookies = getCookiesForUrl(jar, target);
    const r = await fetch(target, { headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual' });
    const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : r.headers.get('set-cookie');
    if (setCookies) storeCookies(jar, target, setCookies);
    res.redirect(`/browse?url=${encodeURIComponent(target)}&returnTo=${encodeURIComponent(returnTo)}`);
  } catch(e){
    res.status(500).send('Erreur auth/start: '+e.message);
  }
});

app.get('/browse', async (req,res)=>{
  const sid = getSid(req,res);
  const targetUrl = req.query.url;
  const returnTo = req.query.returnTo || '/';
  if (!targetUrl) return res.status(400).send('url manquant');
  const jar = jars.get(sid);
  try {
    const cookies = getCookiesForUrl(jar, targetUrl);
    const r = await fetch(targetUrl, { headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'manual' });
    const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : r.headers.get('set-cookie');
    if (setCookies) storeCookies(jar, targetUrl, setCookies);
    if (r.status>=300 && r.status<400) {
      const loc = r.headers.get('location');
      if (loc) {
        const next = new URL(loc, targetUrl).toString();
        if (next.includes('eleve.html') || next.includes('pronote')) {
          return res.redirect('/?real=1&auto=1&fromPronote=1&realUrl='+encodeURIComponent(next));
        }
        return res.redirect(`/browse?url=${encodeURIComponent(next)}&returnTo=${encodeURIComponent(returnTo)}`);
      }
    }
    const html = await r.text();
    const $ = cheerio.load(html);
    $('head').prepend(`<base href="${targetUrl}">`);
    $('a').each((i,el)=>{
      const href = $(el).attr('href');
      if (href && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('mailto:')) {
        try {
          const abs = new URL(href, targetUrl).toString();
          $(el).attr('href', `/browse?url=${encodeURIComponent(abs)}&returnTo=${encodeURIComponent(returnTo)}`);
        } catch {}
      }
    });
    $('form').each((i,el)=>{
      const action = $(el).attr('action') || targetUrl;
      try {
        const abs = new URL(action, targetUrl).toString();
        $(el).attr('action', `/browse-proxy?url=${encodeURIComponent(abs)}`);
        $(el).append(`<input type="hidden" name="_mynote_returnTo" value="${returnTo}"><input type="hidden" name="_mynote_originalUrl" value="${abs}">`);
      } catch {}
    });
    const inject = `<div style="position:fixed;top:0;left:0;right:0;z-index:999999;background:#6C7CFF;color:white;padding:10px;text-align:center;font-family:Inter;font-size:13px">MyNote Proxy - ${targetUrl} <a href="${returnTo}" style="color:white;text-decoration:underline;margin-left:10px">Retour MyNote</a></div><style>body{padding-top:40px !important}</style>`;
    $('body').prepend(inject);
    res.send($.html());
  } catch(e){
    res.status(500).send('Erreur browse: '+e.message+'<br><a href="/">Retour</a>');
  }
});

app.all('/browse-proxy', async (req,res)=>{
  const sid = getSid(req,res);
  const targetUrl = req.query.url || req.body._mynote_originalUrl;
  const returnTo = req.body._mynote_returnTo || req.query.returnTo || '/';
  if (!targetUrl) return res.status(400).send('url manquant');
  const jar = jars.get(sid);
  try {
    const cookies = getCookiesForUrl(jar, targetUrl);
    const opts = { method: req.method, headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual' };
    if (req.method==='POST') {
      const body = new URLSearchParams(req.body);
      body.delete('_mynote_returnTo'); body.delete('_mynote_originalUrl');
      opts.body = body.toString();
    }
    const r = await fetch(targetUrl, opts);
    const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : r.headers.get('set-cookie');
    if (setCookies) storeCookies(jar, targetUrl, setCookies);
    if (r.status>=300 && r.status<400) {
      const loc = r.headers.get('location');
      if (loc) {
        const next = new URL(loc, targetUrl).toString();
        if (next.includes('eleve.html')) return res.redirect('/?real=1&auto=1&fromPronote=1&realUrl='+encodeURIComponent(next));
        return res.redirect(`/browse?url=${encodeURIComponent(next)}&returnTo=${encodeURIComponent(returnTo)}`);
      }
    }
    const html = await r.text();
    if (html.includes('eleve.html') || targetUrl.includes('eleve.html')) {
      return res.redirect('/?real=1&auto=1&fromPronote=1&realUrl='+encodeURIComponent(targetUrl));
    }
    res.send(html);
  } catch(e){
    res.status(500).send('Erreur proxy: '+e.message);
  }
});

app.get('/api/session-data', (req,res)=>{
  const sid = req.cookies.mynote_sid;
  const jar = jars.get(sid);
  if (!jar) return res.json({connected:false});
  res.json({connected:true, cookies: Object.keys(jar).length});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', ()=>console.log('MyNote server listening on', PORT));
