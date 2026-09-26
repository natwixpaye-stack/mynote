import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pawnote from 'pawnote';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

let lastError=null, lastSuccess=null;

app.get('/api/health',(req,res)=>res.json({ok:true,pawnote:true,flow:'papillon-ent-webview'}));

app.get('/api/test-pronote', async (req,res)=>{
  const {url}=req.query;
  try{
    const clean=pawnote.cleanURL(url);
    const instance=await pawnote.instance(clean);
    let mobileOk=false, mobileError=null;
    try{
      const r=await fetch(clean+"/mobile.eleve.html?fd=1",{headers:{"User-Agent":"Mozilla/5.0 (iPhone)"}});
      const txt=await r.text();
      mobileOk = txt.includes('PRONOTE') || txt.includes('Start');
      if(!mobileOk) mobileError=txt.substring(0,400);
    }catch(e){ mobileError=e.message; }
    res.json({success:true,cleanUrl:clean,instance:{name:instance.name,hasCAS:!!instance.casURL,casURL:instance.casURL},mobileOk,mobileError,entBlocked:!mobileOk});
  }catch(e){ res.status(500).json({error:e.message,name:e.name}); }
});

// Papillon-style ENT login - WebView proxy
app.get('/ent/login', async (req,res)=>{
  const {url, deviceUUID} = req.query;
  if(!url) return res.status(400).send('url manquant');
  const uuid = deviceUUID || 'mynote-'+Math.random().toString(36).slice(2);
  const clean = pawnote.cleanURL(url);
  const infoUrl = clean + "/InfoMobileApp.json?id=0D264427-EEFC-4810-A9E9-346942A862A4";
  
  // HTML page that will handle ENT flow like Papillon
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyNote - Connexion ENT</title>
<style>
body{font-family:Inter,sans-serif;background:#0B1224;color:white;margin:0;padding:20px}
.card{background:#151E35;border:1px solid #233154;border-radius:16px;padding:20px;max-width:600px;margin:0 auto}
.btn{background:#6C7CFF;color:white;border:0;padding:12px 20px;border-radius:10px;font-weight:600;cursor:pointer;width:100%;margin-top:10px}
#log{font-size:11px;background:#00000080;padding:10px;border-radius:8px;margin-top:10px;max-height:200px;overflow:auto;white-space:pre-wrap}
iframe{width:100%;height:600px;border:1px solid #233154;border-radius:12px;background:white;margin-top:15px}
</style>
</head>
<body>
<div class="card">
<h2>🔐 Connexion ENT Toutatice - ${clean}</h2>
<p style="font-size:13px;color:#ffffff99">Papillon-style WebView: On va charger Pronote, tu te connectes via EduConnect, et MyNote récupère ton token automatiquement.</p>
<div id="status" style="font-size:13px;margin:10px 0;padding:10px;background:#6C7CFF20;border-radius:8px">Chargement InfoMobileApp.json...</div>
<div id="log"></div>
<iframe id="pronoteFrame" style="display:none"></iframe>
<button id="btnManual" class="btn" style="display:none">J'ai fini de me connecter, extraire mes données</button>
</div>

<script>
const CLEAN_URL = "${clean}";
const DEVICE_UUID = "${uuid}";
const INFO_URL = "${infoUrl}";
let logEl = document.getElementById('log');
let statusEl = document.getElementById('status');
let frame = document.getElementById('pronoteFrame');
let btnManual = document.getElementById('btnManual');

function log(msg){
  console.log(msg);
  logEl.textContent += "\\n" + new Date().toLocaleTimeString() + " " + msg;
}

async function start(){
  try{
    log("Fetch InfoMobileApp.json: " + INFO_URL);
    // Use our proxy to avoid CORS
    const proxyUrl = "/api/proxy-json?url=" + encodeURIComponent(INFO_URL);
    const res = await fetch(proxyUrl);
    const json = await res.json();
    log("InfoMobileApp reçu: " + JSON.stringify(json).substring(0,200));
    
    const hasCAS = json.CAS && json.CAS.jetonCAS;
    statusEl.textContent = hasCAS ? "CAS détecté, configuration cookies..." : "Pas de CAS, mode direct";
    
    if(hasCAS){
      log("CAS jeton trouvé: " + json.CAS.jetonCAS.substring(0,30)+"...");
      // Set cookies like Papillon
      document.cookie = "appliMobile=; expires=Thu, 01 Jan 1970 00:00:00 UTC";
      document.cookie = "validationAppliMobile=" + json.CAS.jetonCAS + "; expires=" + new Date(Date.now()+5*60*1000).toUTCString();
      document.cookie = "uuidAppliMobile=" + DEVICE_UUID + "; expires=" + new Date(Date.now()+5*60*1000).toUTCString();
      document.cookie = "ielang=1036; expires=" + new Date(Date.now()+365*86400000).toUTCString();
    } else {
      document.cookie = "appliMobile=1; expires=" + new Date(Date.now()+5*60*1000).toUTCString();
      document.cookie = "ielang=1036; expires=" + new Date(Date.now()+365*86400000).toUTCString();
    }
    
    // Now load mobile.eleve.html in iframe via proxy that injects hooks
    const mobileUrl = CLEAN_URL + "/mobile.eleve.html?fd=1&deviceUUID=" + DEVICE_UUID;
    const proxiedMobile = "/ent/proxy?url=" + encodeURIComponent(mobileUrl) + "&deviceUUID=" + DEVICE_UUID;
    
    log("Chargement Pronote via proxy: " + mobileUrl);
    statusEl.textContent = "Chargement Pronote - connecte-toi via EduConnect dans l'iframe ci-dessous";
    frame.style.display = "block";
    frame.src = proxiedMobile;
    btnManual.style.display = "block";
    
    // Listen for messages from iframe
    window.addEventListener('message', async (e)=>{
      log("Message reçu de l'iframe: " + JSON.stringify(e.data).substring(0,300));
      if(e.data && e.data.type === 'pronote.loginState' && e.data.data && e.data.data.status === 0){
        log("✅ LoginState reçu! login=" + e.data.data.login);
        statusEl.textContent = "✅ Connecté! Récupération des données...";
        
        // Send to parent MyNote window
        if(window.opener){
          window.opener.postMessage({type:'mynote:ent-success', data:e.data.data, url:CLEAN_URL, deviceUUID:DEVICE_UUID}, '*');
        }
        // Also try to login via pawnote directly
        try{
          const res = await fetch('/api/ent-callback', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({url:CLEAN_URL, login:e.data.data.login, token:e.data.data.mdp, deviceUUID:DEVICE_UUID})
          });
          const j = await res.json();
          log("Callback result: " + JSON.stringify(j).substring(0,300));
          if(j.success){
            if(window.opener){
              window.opener.postMessage({type:'mynote:real-data', data:j}, '*');
            }
            statusEl.textContent = "✅ Données récupérées! Tu peux fermer cet onglet et retourner sur MyNote.";
            // Store in localStorage for same-origin
            localStorage.setItem('mynote_real_data', JSON.stringify(j));
            localStorage.setItem('mynote_ent_data', JSON.stringify({login:e.data.data.login, token:e.data.data.mdp, url:CLEAN_URL, deviceUUID:DEVICE_UUID}));
          }
        }catch(err){
          log("Erreur callback: " + err.message);
        }
      }
    });
    
  }catch(err){
    log("Erreur: " + err.message);
    statusEl.textContent = "Erreur: " + err.message;
  }
}

btnManual.onclick = ()=>{
  try{
    const iframeDoc = frame.contentDocument || frame.contentWindow.document;
    const bodyText = iframeDoc.body.innerText;
    log("Manuel - body length: " + bodyText.length);
    // Try to find loginState in iframe
    const win = frame.contentWindow;
    if(win.loginState){
      log("loginState trouvé manuellement: " + JSON.stringify(win.loginState).substring(0,300));
      window.postMessage({type:'pronote.loginState', data:win.loginState}, '*');
      // Dispatch to our own listener
      window.dispatchEvent(new MessageEvent('message', {data:{type:'pronote.loginState', data:win.loginState}}));
    } else {
      log("Pas de loginState, body: " + bodyText.substring(0,500));
      alert("Pas encore connecté. Assure-toi d'être bien connecté dans l'iframe (tu dois voir Pronote). Puis réessaie.");
    }
  }catch(e){
    log("Erreur accès iframe (CORS): " + e.message + " - Utilise le bouton dans l'iframe Pronote si disponible");
  }
};

start();
</script>
</body>
</html>
  `);
});

app.get('/api/proxy-json', async (req,res)=>{
  const {url}=req.query;
  if(!url) return res.status(400).json({error:'url manquant'});
  try{
    const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (iPhone) Pronote"}});
    const txt=await r.text();
    res.set('Access-Control-Allow-Origin','*');
    res.set('Content-Type','application/json');
    res.send(txt);
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/ent/proxy', async (req,res)=>{
  const {url, deviceUUID} = req.query;
  if(!url) return res.status(400).send('url manquant');
  const uuid = deviceUUID || 'mynote-'+Math.random().toString(36).slice(2);
  try{
    const r=await fetch(url,{
      headers:{
        "User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "Cookie": "appliMobile=1; ielang=1036; uuidAppliMobile="+uuid
      },
      redirect:'manual'
    });
    
    // Handle redirect to CAS
    if(r.status>=300 && r.status<400){
      const loc=r.headers.get('location');
      if(loc){
        const next = new URL(loc, url).toString();
        console.log('[ent/proxy] redirect to', next);
        // If redirect to toutatice, proxy it too but inject our hooks
        if(next.includes('toutatice') || next.includes('educonnect') || next.includes('cas')){
          // For CAS, we need to let user login, so we proxy the CAS page with injection to capture after login
          return res.redirect('/ent/proxy?url='+encodeURIComponent(next)+'&deviceUUID='+uuid);
        }
        return res.redirect('/ent/proxy?url='+encodeURIComponent(next)+'&deviceUUID='+uuid);
      }
    }
    
    let html=await r.text();
    
    // Inject Papillon hooks
    const inject = `
<script>
// Papillon hooks for web
window.hookAccesDepuisAppli = function() {
  try{ this.passerEnModeValidationAppliMobile('', '${uuid}'); }catch(e){}
};
try{
  window.GInterface && window.GInterface.passerEnModeValidationAppliMobile && window.GInterface.passerEnModeValidationAppliMobile('', '${uuid}', '', '', '{"model":"random","platform":"android"}');
}catch(e){}

setInterval(function(){
  try{
    const state = window.loginState;
    if(state){
      window.parent.postMessage({type:'pronote.loginState', data:state}, '*');
      // Also try to post to opener
      if(window.opener) window.opener.postMessage({type:'pronote.loginState', data:state}, '*');
    }
  }catch(e){}
}, 1000);

// Watch for connection errors
setInterval(function(){
  if(document.body && document.body.innerText.includes('connexion impossible')){
    window.parent.postMessage({type:'pronote.connectionError'}, '*');
  }
}, 1000);

// Add MyNote banner
window.addEventListener('load', function(){
  let banner=document.createElement('div');
  banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999999;background:#6C7CFF;color:white;padding:12px;text-align:center;font-family:Inter,sans-serif;font-weight:600;font-size:13px';
  banner.innerHTML='🔗 MyNote - Connecte-toi via EduConnect ci-dessous. Une fois dans Pronote, MyNote récupérera automatiquement tes données. <button onclick="if(window.loginState) window.parent.postMessage({type:\\'pronote.loginState\\', data:window.loginState}, \\'*\\')" style="margin-left:10px;background:white;color:#6C7CFF;border:0;padding:4px 10px;border-radius:6px;font-weight:bold;cursor:pointer">Extraire maintenant</button>';
  document.body.prepend(banner);
});
</script>
    `;
    
    // Inject before </head> or </body>
    if(html.includes('</head>')){
      html = html.replace('</head>', inject + '</head>');
    } else {
      html = inject + html;
    }
    
    res.set('Content-Type','text/html');
    res.send(html);
  }catch(e){
    res.status(500).send('Proxy error: '+e.message);
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
    
    res.json({
      success:true,
      user:{name:session.user?.name, class:session.user?.studentClass?.name},
      instance:{url:clean},
      timetable, grades, homeworks,
      token: refresh.token,
      method:'ent-webview'
    });
  }catch(err){
    console.error('[ent-callback] error', err);
    res.status(500).json({error:err.message, name:err.name});
  }
});

// Keep old endpoints for fallback
app.post('/api/login-qr', async (req,res)=>{
  const {qrData,pin}=req.body;
  if(!qrData) return res.status(400).json({error:'qrData manquant'});
  try{
    let qrObj=null; let raw=qrData.trim();
    if(raw.startsWith('pronote://')){ try{ const u=new URL(raw); qrObj={url:u.searchParams.get('url'), login:u.searchParams.get('login'), jeton:u.searchParams.get('jeton')}; }catch{} }
    if(!qrObj?.url){
      try{ const p=JSON.parse(raw); if(p.url) qrObj=p; }catch{}
    }
    if(!qrObj?.url){
      const urlMatch=raw.match(/https?:\\/\\/[^\\s"']+\\.index-education\\.net\\/pronote\\/?/i);
      const loginMatch=raw.match(/"login"\\s*:\\s*"([A-F0-9]+)"/i);
      const jetonMatch=raw.match(/"jeton"\\s*:\\s*"([A-F0-9]+)"/i) || raw.match(/([A-F0-9]{100,})/i);
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
app.listen(PORT,'0.0.0.0',()=>console.log('MyNote Papillon ENT listening',PORT));
