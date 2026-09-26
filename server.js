import express from 'express';
import cors from 'cors';
import * as pawnote from 'pawnote';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

app.get('/api/health',(req,res)=>res.json({ok:true,flow:'papillon-v3'}));

app.get('/api/proxy-json', async (req,res)=>{
  try{
    const r=await fetch(req.query.url,{headers:{"User-Agent":"Mozilla/5.0 (iPhone)"}});
    const txt=await r.text();
    res.set('Access-Control-Allow-Origin','*');
    res.send(txt);
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/ent/login', (req,res)=>{
  const clean = pawnote.cleanURL(req.query.url||'https://0352686e.index-education.net/pronote/');
  const uuid = 'mynote-'+Math.random().toString(36).slice(2);
  const infoUrl = clean + "/InfoMobileApp.json?id=0D264427-EEFC-4810-A9E9-346942A862A4";
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyNote ENT - Anita Conti</title>
<style>
body{font-family:Inter,sans-serif;background:#0B1224;color:white;margin:0;padding:0}
.header{background:#151E35;padding:16px;border-bottom:1px solid #233154}
.btn{background:#6C7CFF;color:white;border:0;padding:12px 20px;border-radius:10px;font-weight:700;cursor:pointer;display:inline-block;text-decoration:none}
.btn-success{background:#2ECC71;color:black}
.log{font-size:11px;background:#000;padding:10px;border-radius:8px;margin-top:10px;max-height:200px;overflow:auto;white-space:pre-wrap}
.step{padding:12px;border-radius:10px;margin:10px 0;font-size:13px}
.step-ok{background:#2ECC7120;border:1px solid #2ECC7150}
.step-warn{background:#FFB02020;border:1px solid #FFB02050}
.step-err{background:#FF5A5F20;border:1px solid #FF5A5F50}
.bookmarklet{display:inline-block;padding:12px 20px;background:#6C7CFF;color:white;border-radius:10px;font-weight:800;text-decoration:none;margin:10px 0;cursor:grab}
code{background:#00000080;padding:2px 6px;border-radius:4px;font-size:11px}
</style>
</head>
<body>
<div class="header">
  <div style="font-weight:800;font-size:16px">🔐 MyNote - Méthode Papillon pour Anita Conti</div>
  <div style="font-size:11px;color:#ffffff80">${clean}</div>
  <div id="status" class="step step-warn">Chargement...</div>
  <div id="log" class="log"></div>
</div>

<div style="padding:20px;max-width:700px;margin:0 auto">

  <div class="step step-ok">
    <b>🎯 Méthode qui marche à 100% (2 min) - Extraction directe du token Pronote</b><br><br>
    <b>Étape 1 :</b> Ouvre Pronote via Toutatice dans un nouvel onglet<br>
    <a href="https://www.toutatice.fr" target="_blank" class="btn">Ouvrir Toutatice.fr</a><br><br>
    <b>Étape 2 :</b> Connecte-toi via EduConnect → clique sur Pronote → attends de voir ton EDT<br><br>
    <b>Étape 3 :</b> Une fois DANS Pronote (tu vois ton emploi du temps), glisse ce bouton dans ta barre de favoris, puis clique dessus quand tu es dans Pronote :<br>
    <div style="text-align:center;margin:15px 0">
      <a id="bmLink" href="#" class="bookmarklet">📌 MyNote - Extraire Token</a><br>
      <span style="font-size:11px;color:#ffffff60">Glisse ce bouton dans ta barre de favoris (Ctrl+Shift+B pour afficher la barre)</span>
    </div>
    <b>Étape 4 :</b> Une bulle violette apparaît "✅ Token extrait" → reviens ici et clique ci-dessous<br>
    <button id="btnCheck" class="btn btn-success" style="width:100%;margin-top:10px">📥 J'ai cliqué sur le favori dans Pronote - Charger mes données</button>
    <div id="checkStatus" style="margin-top:10px;font-size:12px"></div>
  </div>

  <div class="step step-warn">
    <b>🔧 Si le glisser-déposer ne marche pas :</b><br>
    Crée un favori manuellement : Clic droit barre de favoris → Ajouter une page → Nom: MyNote → URL: colle ce code :<br>
    <textarea id="bmCode" readonly style="width:100%;height:80px;background:#000;color:#fff;font-size:9px;font-family:monospace;padding:8px;border-radius:8px;margin-top:8px"></textarea><br>
    <button onclick="navigator.clipboard.writeText(document.getElementById('bmCode').value); alert('Copié!')" class="btn" style="padding:6px 12px;font-size:11px;margin-top:5px">Copier le code</button>
  </div>

  <div class="step">
    <b>📋 Méthode alternative ultra simple (si favori bloque) :</b><br>
    Dans Pronote, fais <b>F12</b> → onglet <b>Console</b> → colle ce code et Entrée :<br>
    <code id="consoleCode" style="display:block;margin:8px 0;padding:8px;word-break:break-all"></code>
    <button onclick="navigator.clipboard.writeText(document.getElementById('consoleCode').innerText); alert('Copié!')" class="btn" style="padding:6px 12px;font-size:11px">Copier code console</button>
  </div>

  <div id="result" style="display:none" class="step step-ok"></div>
</div>

<script>
const CLEAN_URL="${clean}";
const DEVICE_UUID="${uuid}";
let logEl=document.getElementById('log');
let statusEl=document.getElementById('status');
function log(m){ console.log(m); logEl.textContent += "\\n"+new Date().toLocaleTimeString()+" "+m; }

const bookmarkletCode = \`javascript:(function(){
  try{
    let url=location.href;
    if(!url.includes('pronote') && !url.includes('index-education')){
      alert('❌ Tu n\\\\'es pas dans Pronote!\\\\nVa sur toutatice.fr → Pronote, puis clique sur ce favori QUAND tu es dans Pronote.\\\\nTu es sur: '+url);
      return;
    }
    let state=window.loginState;
    if(!state){
      // Try to find in other places
      try{ state=window.GInterface && window.GInterface.Etat; }catch(e){}
      // Try to parse from page
      if(!state){
        let body=document.body.innerHTML;
        let m=body.match(/loginState\\\\s*=\\\\s*(\\\\{[^}]+\\\\})/);
        if(m){ try{ state=JSON.parse(m[1]); }catch(e){} }
      }
    }
    if(!state || !state.login){
      // Fallback: extract from Pronote's internal data
      let data={url:url, time:Date.now()};
      // Try to get token from cookies or localStorage
      let cookies=document.cookie;
      let localData=localStorage.getItem('pronote') || sessionStorage.getItem('pronote') || '';
      // Show what we have
      let banner=document.createElement('div');
      banner.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999999;background:#FFB020;color:black;padding:16px 24px;border-radius:12px;font-family:sans-serif;font-weight:bold;max-width:90%;text-align:center';
      banner.innerHTML='⚠️ loginState non trouvé (Pronote a changé).\\\\nMais on va extraire le HTML complet.<br><span style=\\\\'font-size:11px\\\\'>Utilise la méthode copier-coller dans MyNote</span>';
      document.body.appendChild(banner);
      setTimeout(()=>banner.remove(),4000);
      
      // Still save HTML for paste method
      let htmlData={url:url, html:document.documentElement.outerHTML, bodyPreview:document.body.innerText.substring(0,5000), time:Date.now(), timetable:[], grades:[], homeworks:[]};
      localStorage.setItem('mynote_bookmarklet', JSON.stringify(htmlData));
      localStorage.setItem('mynote_papillon_token', JSON.stringify({url:url, hasLoginState:!!state, cookies:cookies, time:Date.now()}));
      return;
    }
    // Found loginState!
    let tokenData={url:CLEAN_URL, login:state.login, token:state.mdp, deviceUUID:DEVICE_UUID, time:Date.now()};
    localStorage.setItem('mynote_papillon_token', JSON.stringify(tokenData));
    localStorage.setItem('mynote_loginState', JSON.stringify(state));
    
    // Try to send to MyNote server
    fetch('https://mynote-k8am.onrender.com/api/ent-callback',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:CLEAN_URL, login:state.login, token:state.mdp, deviceUUID:DEVICE_UUID})
    }).then(r=>r.json()).then(j=>{
      let banner=document.createElement('div');
      banner.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999999;background:#2ECC71;color:black;padding:18px 28px;border-radius:16px;font-family:sans-serif;font-weight:bold;box-shadow:0 8px 32px rgba(0,0,0,0.3);text-align:center';
      banner.innerHTML='✅ MyNote: Token extrait! '+ (j.user? j.user.name : state.login) + '<br><span style=\\\\'font-size:12px\\\\'>Retourne sur MyNote - tes données vont se charger</span>';
      document.body.appendChild(banner);
      setTimeout(()=>banner.remove(),5000);
      if(window.opener){
        window.opener.postMessage({type:'mynote:real-data', data:j}, '*');
      }
    }).catch(e=>{
      let banner=document.createElement('div');
      banner.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999999;background:#6C7CFF;color:white;padding:18px 28px;border-radius:16px;font-family:sans-serif;font-weight:bold;text-align:center';
      banner.innerHTML='✅ Token extrait (local)!<br>login: '+state.login+'<br><span style=\\\\'font-size:12px\\\\'>Retourne sur MyNote et clique Charger</span>';
      document.body.appendChild(banner);
    });
  }catch(e){ alert('Erreur MyNote: '+e.message+'\\\\n'+e.stack); }
})();\`;

document.getElementById('bmLink').href=bookmarkletCode;
document.getElementById('bmCode').value=bookmarkletCode;

const consoleCode = \`let s=window.loginState; if(!s){alert('Pas dans Pronote ou pas chargé');}else{let d={url:location.href, login:s.login, token:s.mdp, deviceUUID:'${uuid}'}; localStorage.setItem('mynote_papillon_token', JSON.stringify(d)); fetch('https://mynote-k8am.onrender.com/api/ent-callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'${clean}', login:s.login, token:s.mdp, deviceUUID:'${uuid}'})}).then(r=>r.json()).then(j=>{alert('✅ '+ (j.user?j.user.name:s.login) +' - Retourne sur MyNote'); localStorage.setItem('mynote_real_data', JSON.stringify(j));}).catch(e=>alert('Token local sauvé: '+s.login));}\`;

document.getElementById('consoleCode').innerText=consoleCode;

document.getElementById('btnCheck').onclick=async()=>{
  let checkEl=document.getElementById('checkStatus');
  checkEl.innerHTML='Vérification...';
  
  // Check localStorage from same origin (mynote domain) - won't have pronote data due to different origin
  // So we check if we have data from postMessage or from server
  // Try to load from localStorage mynote_papillon_token (if user ran bookmarklet on mynote domain by mistake, it will be there, but we need pronote domain)
  // Actually bookmarklet saves to localStorage of pronote domain, not mynote domain, so we can't read it from here
  // Instead, we try to fetch last data from server or ask user to paste loginState
  
  let tokenRaw=localStorage.getItem('mynote_papillon_token');
  if(tokenRaw){
    try{
      let tokenData=JSON.parse(tokenRaw);
      checkEl.innerHTML='Token trouvé local: '+tokenData.login+' - Récupération...';
      let res=await fetch('/api/ent-callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:tokenData.url||'${clean}', login:tokenData.login, token:tokenData.token, deviceUUID:tokenData.deviceUUID})});
      let j=await res.json();
      if(j.success){
        checkEl.innerHTML='✅ '+j.user.name+' - Données chargées!';
        localStorage.setItem('mynote_real_data', JSON.stringify(j));
        document.getElementById('result').style.display='block';
        document.getElementById('result').innerHTML='✅ Connecté: '+j.user.name+'<br>'+j.timetable.classes.length+' cours, '+JSON.stringify(j.grades).substring(0,100);
        if(window.opener){
          window.opener.postMessage({type:'mynote:real-data', data:j}, '*');
        }
        setTimeout(()=>window.close(), 1500);
        return;
      } else {
        checkEl.innerHTML='Erreur: '+j.error;
      }
    }catch(e){ checkEl.innerHTML='Erreur: '+e.message; }
  }
  
  // If no token, ask user to paste loginState
  let pasted=prompt('Colle ici le loginState si tu l\\'as (ou le contenu de localStorage mynote_papillon_token depuis Pronote):\\n\\nDans Pronote, fais F12 → Console → tape: localStorage.getItem(\\'mynote_papillon_token\\') → copie le résultat et colle ici');
  if(pasted){
    try{
      let data=JSON.parse(pasted);
      let res=await fetch('/api/ent-callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:data.url||'${clean}', login:data.login, token:data.token, deviceUUID:data.deviceUUID||'${uuid}'})});
      let j=await res.json();
      if(j.success){
        checkEl.innerHTML='✅ '+j.user.name;
        localStorage.setItem('mynote_real_data', JSON.stringify(j));
        if(window.opener) window.opener.postMessage({type:'mynote:real-data', data:j}, '*');
      } else {
        checkEl.innerHTML='Erreur: '+j.error;
      }
    }catch(e){ checkEl.innerHTML='Erreur parse: '+e.message; }
  } else {
    checkEl.innerHTML='❌ Aucune donnée. Assure-toi d\\'avoir cliqué sur le favori QUAND tu es DANS Pronote (tu dois voir ton EDT).<br><br>Le favori doit être cliqué sur une page avec <code>pronote</code> dans l\\'URL, pas sur MyNote.';
  }
};

// Auto-check for messages from opener
window.addEventListener('message', (e)=>{
  log('Message reçu: '+JSON.stringify(e.data).substring(0,300));
  if(e.data && e.data.type==='mynote:real-data' && e.data.data.success){
    document.getElementById('result').style.display='block';
    document.getElementById('result').innerHTML='✅ Reçu depuis autre onglet: '+e.data.data.user.name;
    localStorage.setItem('mynote_real_data', JSON.stringify(e.data.data));
  }
});

log('Page chargée, clean URL: ${clean}');
statusEl.textContent='Prêt - suis les étapes ci-dessus';
</script>
</body>
</html>
  `);
});

app.post('/api/ent-callback', async (req,res)=>{
  const {url, login, token, deviceUUID} = req.body;
  if(!url||!login||!token) return res.status(400).json({error:'missing login/token'});
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
    res.json({success:true,user:{name:session.user?.name, class:session.user?.studentClass?.name},instance:{url:clean},timetable,grades,homeworks,token:refresh.token,method:'papillon-token'});
  }catch(err){
    console.error('[ent-callback]', err);
    res.status(500).json({error:err.message, name:err.name, help:'Token expiré? Le token Pronote expire après 5 min. Re-clique sur le favori dans Pronote pour un nouveau token.'});
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
app.listen(PORT,'0.0.0.0',()=>console.log('MyNote Papillon v3 listening',PORT));
