import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import * as pawnote from 'pawnote';

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

app.get('/api/health',(req,res)=>res.json({ok:true,pawnote:true,flow:'papillon-ent-v2'}));

app.get('/api/test-pronote', async (req,res)=>{
  const {url}=req.query;
  try{
    const clean=pawnote.cleanURL(url);
    const instance=await pawnote.instance(clean);
    res.json({success:true,cleanUrl:clean,instance:{name:instance.name,hasCAS:!!instance.casURL}});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/proxy-json', async (req,res)=>{
  const {url}=req.query;
  try{
    const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (iPhone)"}});
    const txt=await r.text();
    res.set('Access-Control-Allow-Origin','*');
    res.set('Content-Type','application/json');
    res.send(txt);
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/ent/login', async (req,res)=>{
  const {url} = req.query;
  if(!url) return res.status(400).send('url manquant');
  const clean = pawnote.cleanURL(url);
  const deviceUUID = 'mynote-'+Math.random().toString(36).slice(2);
  const infoUrl = clean + "/InfoMobileApp.json?id=0D264427-EEFC-4810-A9E9-346942A862A4";
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyNote ENT</title>
<style>
body{font-family:Inter,sans-serif;background:#0B1224;color:white;margin:0;padding:0}
.header{background:#151E35;border-bottom:1px solid #233154;padding:12px 16px;position:sticky;top:0;z-index:10}
.card{padding:16px}
.btn{background:#6C7CFF;color:white;border:0;padding:12px 20px;border-radius:10px;font-weight:600;cursor:pointer;width:100%;margin-top:10px}
#log{font-size:11px;background:#00000080;padding:10px;border-radius:8px;margin-top:10px;max-height:150px;overflow:auto;white-space:pre-wrap}
iframe{width:100%;height:calc(100vh - 180px);border:0;background:white}
.status{font-size:13px;padding:10px;background:#6C7CFF20;border-radius:8px;margin:10px 0}
</style>
</head>
<body>
<div class="header">
  <div style="font-weight:700">🔐 MyNote - Connexion ENT Toutatice</div>
  <div style="font-size:11px;color:#ffffff80">${clean} • Méthode Papillon</div>
  <div id="status" class="status">Initialisation...</div>
  <div id="log"></div>
</div>
<iframe id="frame"></iframe>
<div style="padding:16px">
  <button id="btnExtract" class="btn">🔍 Extraire mes données maintenant</button>
  <div style="font-size:11px;color:#ffffff60;margin-top:8px;text-align:center">Une fois connecté dans l'iframe (tu vois Pronote), clique sur Extraire</div>
</div>

<script>
const CLEAN_URL="${clean}";
const DEVICE_UUID="${deviceUUID}";
const INFO_URL="${infoUrl}";
let frame=document.getElementById('frame');
let logEl=document.getElementById('log');
let statusEl=document.getElementById('status');

function log(m){ console.log(m); logEl.textContent += "\\n"+new Date().toLocaleTimeString()+" "+m; logEl.scrollTop=logEl.scrollHeight; }

async function init(){
  try{
    log("1. Fetch InfoMobileApp.json");
    statusEl.textContent="1/3 Récupération jeton CAS...";
    const res=await fetch("/api/proxy-json?url="+encodeURIComponent(INFO_URL));
    const json=await res.json();
    log("InfoMobileApp: "+JSON.stringify(json).substring(0,300));
    
    const jetonCAS = json.CAS && json.CAS.jetonCAS ? json.CAS.jetonCAS : "";
    log("jetonCAS: "+ (jetonCAS? jetonCAS.substring(0,30)+"..." : "aucun (pas de CAS)"));
    
    // Store for proxy
    localStorage.setItem('mynote_jetonCAS', jetonCAS);
    localStorage.setItem('mynote_deviceUUID', DEVICE_UUID);
    
    // Load mobile.eleve.html via proxy with jeton
    const mobileUrl = CLEAN_URL + "/mobile.eleve.html?fd=1";
    const proxyUrl = "/ent/proxy?url=" + encodeURIComponent(mobileUrl) + "&deviceUUID=" + DEVICE_UUID + "&jetonCAS=" + encodeURIComponent(jetonCAS);
    
    log("2. Chargement Pronote via proxy: "+mobileUrl);
    statusEl.textContent="2/3 Chargement Pronote - connecte-toi via EduConnect dans l'iframe";
    frame.src=proxyUrl;
    
    // Poll for loginState from iframe via postMessage
    window.addEventListener('message', async (e)=>{
      log("Message reçu: "+JSON.stringify(e.data).substring(0,400));
      if(e.data && e.data.type==='pronote.loginState' && e.data.data && e.data.data.status===0){
        log("✅ LoginState reçu! login="+e.data.data.login);
        statusEl.textContent="✅ Connecté! Récupération données...";
        await doCallback(e.data.data);
      }
      if(e.data && e.data.type==='mynote:real-data' && e.data.data && e.data.data.success){
        log("✅ Données réelles reçues!");
        statusEl.textContent="✅ Données récupérées! Fermeture auto dans 2s...";
        localStorage.setItem('mynote_real_data', JSON.stringify(e.data.data));
        if(window.opener){
          window.opener.postMessage({type:'mynote:real-data', data:e.data.data}, '*');
        }
        setTimeout(()=>{ window.close(); }, 2000);
      }
    });
    
  }catch(err){
    log("Erreur init: "+err.message);
    statusEl.textContent="Erreur: "+err.message;
  }
}

async function doCallback(loginState){
  try{
    log("Appel /api/ent-callback avec login="+loginState.login);
    const res=await fetch('/api/ent-callback',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:CLEAN_URL, login:loginState.login, token:loginState.mdp, deviceUUID:DEVICE_UUID})
    });
    const j=await res.json();
    log("Callback: "+JSON.stringify(j).substring(0,500));
    if(j.success){
      localStorage.setItem('mynote_real_data', JSON.stringify(j));
      if(window.opener){
        window.opener.postMessage({type:'mynote:real-data', data:j}, '*');
      }
      statusEl.textContent="✅ "+j.user.name+" - Données récupérées! Retourne sur MyNote.";
      setTimeout(()=>{ if(confirm("Données récupérées! Fermer cet onglet et retourner sur MyNote?")) window.close(); }, 1000);
    } else {
      log("Callback erreur: "+j.error);
    }
  }catch(e){ log("Erreur callback: "+e.message); }
}

document.getElementById('btnExtract').onclick=()=>{
  try{
    log("Tentative extraction manuelle...");
    // Try to get loginState from iframe
    const iframeWin=frame.contentWindow;
    if(iframeWin && iframeWin.loginState){
      log("loginState trouvé dans iframe: "+JSON.stringify(iframeWin.loginState).substring(0,300));
      doCallback(iframeWin.loginState);
    } else {
      // Try to access via proxy injection - the proxy should have injected a button that posts message
      log("Pas de loginState direct, tentative via postMessage à l'iframe");
      frame.contentWindow.postMessage({type:'mynote:request-loginState'}, '*');
      // Also try to read body
      try{
        const doc=frame.contentDocument;
        if(doc){
          log("Body preview: "+doc.body.innerText.substring(0,500));
          if(doc.body.innerText.includes('connexion impossible')){
            alert('Connexion impossible selon Pronote. Réessaie de te connecter.');
          }
        }
      }catch(e){
        log("Impossible d'accéder au contenu iframe (CORS): "+e.message);
        log("Le proxy doit injecter le script. Si l'iframe est blanche, c'est que Toutatice bloque l'iframe. On va essayer d'ouvrir directement.");
        // Fallback: open direct URL in this window
        if(confirm("L'iframe est vide (Toutatice bloque les iframes). Veux-tu ouvrir Pronote directement dans cet onglet pour te connecter?")){
          window.location.href="/ent/proxy?url="+encodeURIComponent(CLEAN_URL+"/eleve.html")+"&deviceUUID="+DEVICE_UUID+"&jetonCAS="+encodeURIComponent(localStorage.getItem('mynote_jetonCAS')||'');
        }
      }
    }
  }catch(e){ log("Erreur extraction: "+e.message); }
};

init();
</script>
</body>
</html>
  `);
});

app.get('/ent/proxy', async (req,res)=>{
  const {url, deviceUUID, jetonCAS} = req.query;
  if(!url) return res.status(400).send('url manquant');
  const uuid = deviceUUID || 'mynote-'+Math.random().toString(36).slice(2);
  const jeton = jetonCAS || '';
  
  console.log('[ent/proxy] fetching', url, 'jeton?', !!jeton);
  
  try{
    // Build cookies like Papillon
    let cookies = [];
    if(jeton){
      cookies.push('validationAppliMobile='+jeton);
      cookies.push('uuidAppliMobile='+uuid);
      cookies.push('ielang=1036');
    } else {
      cookies.push('appliMobile=1');
      cookies.push('ielang=1036');
    }
    const cookieHeader = cookies.join('; ');
    
    const r=await fetch(url,{
      headers:{
        "User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "Cookie": cookieHeader,
        "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":"fr-FR,fr;q=0.9"
      },
      redirect:'manual'
    });
    
    const status=r.status;
    const loc=r.headers.get('location');
    
    if(status>=300 && status<400 && loc){
      const next = new URL(loc, url).toString();
      console.log('[ent/proxy] redirect', status, 'to', next);
      // Proxy redirects too, but preserve jeton
      const proxied = '/ent/proxy?url='+encodeURIComponent(next)+'&deviceUUID='+uuid+'&jetonCAS='+encodeURIComponent(jeton);
      // If redirect to educonnect or toutatice, we need to allow it - return HTML that redirects via meta or JS to keep our injection
      if(next.includes('educonnect') || next.includes('toutatice') || next.includes('cas') || next.includes('idp')){
        // For CAS pages, we proxy them but we need to keep them in our proxy chain
        // Fetch the CAS page and inject our hooks to continue chain after login
        return res.redirect(proxied);
      }
      return res.redirect(proxied);
    }
    
    let html=await r.text();
    
    // If html is JSON (InfoMobileApp), handle differently
    if(html.trim().startsWith('{') && url.includes('InfoMobileApp.json')){
      res.set('Content-Type','application/json');
      res.set('Access-Control-Allow-Origin','*');
      return res.send(html);
    }
    
    // Strip X-Frame-Options and CSP to allow iframe
    res.removeHeader('X-Frame-Options');
    // Inject Papillon hooks
    const inject = `
<script>
// Papillon hooks - web version
(function(){
  const DEVICE_UUID="${uuid}";
  console.log("[MyNote] Injecting hooks, deviceUUID", DEVICE_UUID);
  
  // Hook for appli mobile
  window.hookAccesDepuisAppli = function(){
    try{
      console.log("[MyNote] hookAccesDepuisAppli called");
      this.passerEnModeValidationAppliMobile && this.passerEnModeValidationAppliMobile('', DEVICE_UUID);
    }catch(e){ console.log(e); }
  };
  
  // Try to call GInterface directly
  function tryGInterface(){
    try{
      if(window.GInterface && window.GInterface.passerEnModeValidationAppliMobile){
        console.log("[MyNote] Calling GInterface.passerEnModeValidationAppliMobile");
        window.GInterface.passerEnModeValidationAppliMobile('', DEVICE_UUID, '', '', '{"model":"random","platform":"android"}');
      }
    }catch(e){ console.log("[MyNote] GInterface error", e); }
  }
  
  // Poll loginState like Papillon
  setInterval(function(){
    try{
      const state = window.loginState;
      if(state){
        console.log("[MyNote] loginState found", state);
        window.parent.postMessage({type:'pronote.loginState', data:state}, '*');
        if(window.opener) window.opener.postMessage({type:'pronote.loginState', data:state}, '*');
      }
    }catch(e){}
  }, 1000);
  
  // Listen for request from parent
  window.addEventListener('message', function(e){
    if(e.data && e.data.type==='mynote:request-loginState'){
      console.log("[MyNote] request-loginState received");
      if(window.loginState){
        window.parent.postMessage({type:'pronote.loginState', data:window.loginState}, '*');
      }
    }
  });
  
  // Add banner
  window.addEventListener('load', function(){
    tryGInterface();
    setTimeout(tryGInterface, 1000);
    setTimeout(tryGInterface, 3000);
    
    let banner=document.createElement('div');
    banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999999;background:#6C7CFF;color:white;padding:10px;text-align:center;font-family:Inter,sans-serif;font-weight:600;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,0.3)';
    banner.innerHTML='🔗 MyNote - Si tu vois Pronote, connecte-toi via EduConnect. Une fois dans Pronote, clique sur Extraire. <button onclick="if(window.loginState){window.parent.postMessage({type:\\'pronote.loginState\\', data:window.loginState}, \\'*\\'); alert(\\'LoginState envoyé!\\');}else{alert(\\'Pas encore connecté. Connecte-toi d\\'abord.\\');}" style="margin-left:10px;background:white;color:#6C7CFF;border:0;padding:4px 12px;border-radius:6px;font-weight:bold;cursor:pointer">📤 Extraire maintenant</button>';
    document.body.prepend(banner);
    document.body.style.paddingTop='50px';
  });
  
  // Also inject into all links/forms to keep them proxied
  function proxify(){
    try{
      document.querySelectorAll('a[href]').forEach(a=>{
        let href=a.getAttribute('href');
        if(href && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('mailto:')){
          if(href.startsWith('/') || href.includes('toutatice.fr') || href.includes('educonnect') || href.includes('index-education.net')){
            let abs=new URL(href, location.href).toString();
            // Only proxify if it's pronote or ent related
            if(abs.includes('pronote') || abs.includes('toutatice') || abs.includes('educonnect') || abs.includes('cas')){
              a.href='/ent/proxy?url='+encodeURIComponent(abs)+'&deviceUUID='+DEVICE_UUID+'&jetonCAS=${encodeURIComponent(jeton)}';
            }
          }
        }
      });
      document.querySelectorAll('form').forEach(f=>{
        let action=f.getAttribute('action')||'';
        if(action){
          let abs=new URL(action, location.href).toString();
          if(abs.includes('pronote') || abs.includes('toutatice') || abs.includes('educonnect')){
            f.action='/ent/proxy?url='+encodeURIComponent(abs)+'&deviceUUID='+DEVICE_UUID+'&jetonCAS=${encodeURIComponent(jeton)}';
          }
        }
      });
    }catch(e){ console.log(e); }
  }
  setInterval(proxify, 2000);
  window.addEventListener('load', proxify);
})();
</script>
    `;
    
    if(html.includes('</head>')){
      html=html.replace('</head>', inject+'</head>');
    } else if(html.includes('<body')){
      html=html.replace('<body', inject+'<body');
    } else {
      html=inject+html;
    }
    
    // Remove X-Frame-Options, CSP
    res.set('Content-Type','text/html');
    res.set('X-Frame-Options','ALLOWALL');
    res.set('Content-Security-Policy','');
    res.send(html);
    
  }catch(e){
    console.error('[ent/proxy] error', e);
    res.status(500).send('Proxy error: '+e.message+'<br>URL: '+url);
  }
});

app.post('/api/ent-callback', async (req,res)=>{
  const {url, login, token, deviceUUID} = req.body;
  if(!url||!login||!token) return res.status(400).json({error:'missing'});
  try{
    const clean=pawnote.cleanURL(url);
    const session=pawnote.createSessionHandle();
    const refresh = await pawnote.loginToken(session, {
      url: clean,
      kind: pawnote.AccountKind.STUDENT,
      username: login,
      token,
      deviceUUID: deviceUUID || 'mynote-'+Math.random().toString(36).slice(2)
    });
    const [timetable, grades, homeworks] = await Promise.all([
      pawnote.timetableFromIntervals(session, new Date(), new Date(Date.now()+7*86400000)).catch(e=>({error:e.message,classes:[]})),
      pawnote.gradesOverview(session).catch(e=>({error:e.message})),
      pawnote.assignmentsFromIntervals(session, new Date(), new Date(Date.now()+14*86400000)).catch(e=>[])
    ]);
    res.json({success:true,user:{name:session.user?.name, class:session.user?.studentClass?.name},instance:{url:clean},timetable,grades,homeworks,token:refresh.token,method:'ent-webview'});
  }catch(err){
    console.error('[ent-callback]', err);
    res.status(500).json({error:err.message, name:err.name});
  }
});

app.post('/api/login-qr', async (req,res)=>{
  const {qrData,pin}=req.body;
  try{
    let qrObj=null; let raw=qrData.trim();
    if(raw.startsWith('pronote://')){ try{ const u=new URL(raw); qrObj={url:u.searchParams.get('url'), login:u.searchParams.get('login'), jeton:u.searchParams.get('jeton')}; }catch{} }
    if(!qrObj?.url){ try{ const p=JSON.parse(raw); if(p.url) qrObj=p; }catch{} }
    if(!qrObj?.url){
      const urlMatch=raw.match(/https?:\/\/[^\s"']+\.index-education\.net\/pronote\/?/i);
      const loginMatch=raw.match(/"login"\s*:\s*"([A-F0-9]+)"/i);
      const jetonMatch=raw.match(/"jeton"\s*:\s*"([A-F0-9]+)"/i) || raw.match(/([A-F0-9]{100,})/i);
      if(urlMatch) qrObj={url:urlMatch[0], login:loginMatch?.[1], jeton:jetonMatch?.[1]||jetonMatch?.[0]};
    }
    if(!qrObj?.url||!qrObj?.login||!qrObj?.jeton) return res.status(400).json({error:'QR incomplet'});
    const session=pawnote.createSessionHandle();
    const deviceUUID='mynote-'+Math.random().toString(36).slice(2);
    await pawnote.loginQrCode(session,{qr:{url:qrObj.url, login:qrObj.login, jeton:qrObj.jeton}, pin:pin||'', deviceUUID, navigatorIdentifier:'MyNote/1.0'});
    const [timetable,grades,homeworks]=await Promise.all([
      pawnote.timetableFromIntervals(session,new Date(),new Date(Date.now()+7*86400000)).catch(e=>({error:e.message,classes:[]})),
      pawnote.gradesOverview(session).catch(e=>({error:e.message})),
      pawnote.assignmentsFromIntervals(session,new Date(),new Date(Date.now()+14*86400000)).catch(e=>[])
    ]);
    res.json({success:true,user:{name:session.user?.name,class:session.user?.studentClass?.name},instance:{url:pawnote.cleanURL(qrObj.url)},timetable,grades,homeworks});
  }catch(err){ res.status(500).json({error:err.message,name:err.name}); }
});

const PORT=process.env.PORT||10000;
app.listen(PORT,'0.0.0.0',()=>console.log('MyNote ENT v2 listening',PORT));
