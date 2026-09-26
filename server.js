import express from 'express';
import cors from 'cors';
import * as pawnote from 'pawnote';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

app.get('/api/health',(req,res)=>res.json({ok:true,flow:'auto-extract'}));

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
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyNote - Auto Extract</title>
<style>
body{font-family:Inter,sans-serif;background:#0B1224;color:white;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#151E35;border:1px solid #233154;border-radius:20px;padding:24px}
.btn{background:#6C7CFF;color:white;border:0;padding:14px 20px;border-radius:12px;font-weight:800;cursor:pointer;width:100%;font-size:14px;margin:8px 0;display:block;text-align:center;text-decoration:none}
.btn-success{background:#2ECC71;color:black}
.btn-white{background:white;color:black}
.step{background:#ffffff08;border:1px solid #233154;border-radius:12px;padding:16px;margin:12px 0;font-size:13px;line-height:1.5}
code{background:#00000080;padding:3px 8px;border-radius:6px;font-size:11px;word-break:break-all;display:block;margin:8px 0;padding:10px}
.kbd{background:#ffffff20;padding:2px 8px;border-radius:6px;font-size:11px;font-family:monospace;border:1px solid #ffffff30}
.log{font-size:11px;background:#000;padding:10px;border-radius:8px;max-height:150px;overflow:auto;white-space:pre-wrap;margin-top:10px}
</style>
</head>
<body>
<div class="card">
  <div style="font-weight:800;font-size:20px;margin-bottom:4px">🔐 MyNote - Connexion automatique</div>
  <div style="font-size:11px;color:#ffffff60;margin-bottom:16px">${clean} • Sans barre de favoris</div>

  <div class="step" style="background:#6C7CFF15;border-color:#6C7CFF40">
    <div style="font-weight:800;font-size:14px;margin-bottom:8px">🎯 Méthode 1 clic - La plus simple (30 secondes)</div>
    
    <div style="display:flex;gap:8px;margin:12px 0">
      <div style="background:#6C7CFF;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0">1</div>
      <div><b>Ouvre Pronote via Toutatice</b><br>
      <a href="https://www.toutatice.fr" target="_blank" class="btn" style="padding:8px 16px;font-size:12px;width:auto;display:inline-block;margin:6px 0">Ouvrir Toutatice.fr →</a><br>
      <span style="font-size:11px;color:#ffffff80">Connecte-toi avec EduConnect → clique sur Pronote → tu dois voir ton emploi du temps</span></div>
    </div>

    <div style="display:flex;gap:8px;margin:12px 0">
      <div style="background:#6C7CFF;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0">2</div>
      <div><b>Copie le code d'extraction</b><br>
      <button id="btnCopy" class="btn btn-white" style="margin:8px 0">📋 Copier le code (1 clic)</button>
      <span id="copyStatus" style="font-size:11px;color:#2ECC71;display:none">✅ Code copié !</span></div>
    </div>

    <div style="display:flex;gap:8px;margin:12px 0">
      <div style="background:#6C7CFF;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0">3</div>
      <div><b>Dans Pronote, ouvre la console</b><br>
      <span style="font-size:12px">Appuie sur <span class="kbd">F12</span> → clique sur l'onglet <span class="kbd">Console</span> en haut<br>
      <span style="font-size:11px;color:#ffffff80">Sur Edge/Chrome: F12, puis Console. Sur Mac: Cmd+Option+J</span></span></div>
    </div>

    <div style="display:flex;gap:8px;margin:12px 0">
      <div style="background:#6C7CFF;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0">4</div>
      <div><b>Colle et Entrée</b><br>
      <span style="font-size:12px">Dans la console, fais <span class="kbd">Ctrl</span> + <span class="kbd">V</span> puis <span class="kbd">Entrée</span><br>
      Une bulle verte "✅ Token extrait" apparaît</span></div>
    </div>

    <div style="display:flex;gap:8px;margin:12px 0">
      <div style="background:#2ECC71;color:black;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0">5</div>
      <div><b>Reviens ici et charge</b><br>
      <button id="btnCheck" class="btn btn-success">📥 J'ai fait Ctrl+V + Entrée dans Pronote - Charger mes données</button>
      <div id="checkStatus" style="margin-top:8px;font-size:12px"></div></div>
    </div>
  </div>

  <div class="step">
    <div style="font-weight:700;margin-bottom:6px">Code à copier :</div>
    <code id="codeDisplay" style="font-size:10px;max-height:100px;overflow:auto"></code>
  </div>

  <div id="result" style="display:none" class="step" style="background:#2ECC7120"></div>
  <div id="log" class="log"></div>
</div>

<script>
const CLEAN_URL="${clean}";
const DEVICE_UUID="${uuid}";
let logEl=document.getElementById('log');
function log(m){ logEl.textContent += "\\n"+new Date().toLocaleTimeString()+" "+m; console.log(m); }

const extractionCode = \`(function(){
  try{
    let url=location.href;
    if(!url.includes('pronote') && !url.includes('index-education')){
      alert('❌ Tu n\\\\'es pas dans Pronote!\\\\nVa sur toutatice.fr → Pronote, puis refais F12 → Console → colle ce code.\\\\nTu es sur: '+url);
      return;
    }
    let state=window.loginState;
    if(!state || !state.login){
      alert('❌ Pronote pas encore chargé!\\\\nAttends que ton emploi du temps s\\\\'affiche, puis refais Ctrl+V + Entrée.');
      return;
    }
    let data={url:'\${clean}', login:state.login, token:state.mdp, deviceUUID:'\${uuid}', time:Date.now()};
    // Save to localStorage of pronote domain
    localStorage.setItem('mynote_papillon_token', JSON.stringify(data));
    // Try to send to MyNote
    fetch('https://mynote-k8am.onrender.com/api/ent-callback',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:'\${clean}', login:state.login, token:state.mdp, deviceUUID:'\${uuid}'})
    }).then(r=>r.json()).then(j=>{
      if(j.success){
        let b=document.createElement('div');
        b.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999999;background:#2ECC71;color:black;padding:20px 30px;border-radius:16px;font-family:sans-serif;font-weight:800;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.4);text-align:center';
        b.innerHTML='✅ MyNote: '+j.user.name+' connecté!<br><span style=\\\\'font-size:12px\\\\'>'+j.timetable.classes.length+' cours récupérés<br>Retourne sur MyNote - ça va se charger tout seul</span>';
        document.body.appendChild(b);
        localStorage.setItem('mynote_real_data', JSON.stringify(j));
        if(window.opener){ window.opener.postMessage({type:'mynote:real-data', data:j}, '*'); }
      } else {
        alert('Erreur: '+j.error);
      }
    }).catch(e=>{
      let b=document.createElement('div');
      b.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999999;background:#6C7CFF;color:white;padding:20px 30px;border-radius:16px;font-family:sans-serif;font-weight:800;text-align:center';
      b.innerHTML='✅ Token extrait: '+state.login+'<br><span style=\\\\'font-size:12px\\\\'>Retourne sur MyNote et clique Charger<br>(Le serveur est peut-être lent)</span>';
      document.body.appendChild(b);
    });
  }catch(e){ alert('Erreur: '+e.message); }
})();\`;

document.getElementById('codeDisplay').textContent=extractionCode;

document.getElementById('btnCopy').onclick=()=>{
  navigator.clipboard.writeText(extractionCode).then(()=>{
    document.getElementById('copyStatus').style.display='inline';
    document.getElementById('btnCopy').textContent='✅ Copié ! Maintenant va dans Pronote';
    document.getElementById('btnCopy').className='btn btn-success';
    log('Code copié');
    setTimeout(()=>{ document.getElementById('copyStatus').style.display='none'; }, 3000);
  }).catch(()=>{
    // Fallback
    let ta=document.createElement('textarea');
    ta.value=extractionCode;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    document.getElementById('copyStatus').style.display='inline';
    log('Code copié (fallback)');
  });
};

document.getElementById('btnCheck').onclick=async()=>{
  let checkEl=document.getElementById('checkStatus');
  checkEl.innerHTML='Vérification...';
  
  // Try to get from localStorage of this domain (if user ran code on mynote domain by mistake, won't work, but we try)
  // Actually token is saved on pronote domain, not mynote domain, so we can't read it directly
  // Instead, we ask user to paste the token or we poll server for recent data
  
  // Try to fetch from server if token was sent via fetch
  // For now, ask user to paste localStorage content
  let pasted=prompt('Si la bulle verte est apparue dans Pronote, tes données sont déjà envoyées! Clique OK pour vérifier.\\n\\nSi ça ne marche pas, va dans Pronote → F12 → Console → tape:\\nlocalStorage.getItem(\\'mynote_papillon_token\\')\\n\\nCopie le résultat et colle-le ici:');
  
  if(pasted && pasted.includes('login')){
    try{
      let data=JSON.parse(pasted);
      checkEl.innerHTML='Token trouvé: '+data.login+' - Récupération...';
      let res=await fetch('/api/ent-callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:data.url||CLEAN_URL, login:data.login, token:data.token, deviceUUID:data.deviceUUID||DEVICE_UUID})});
      let j=await res.json();
      if(j.success){
        checkEl.innerHTML='✅ '+j.user.name+' - '+j.timetable.classes.length+' cours';
        localStorage.setItem('mynote_real_data', JSON.stringify(j));
        document.getElementById('result').style.display='block';
        document.getElementById('result').innerHTML='✅ Connecté: '+j.user.name+'<br><a href="/" class="btn btn-success" style="margin-top:10px">Aller sur MyNote →</a>';
        if(window.opener){ window.opener.postMessage({type:'mynote:real-data', data:j}, '*'); }
      } else {
        checkEl.innerHTML='Erreur: '+j.error;
      }
    }catch(e){ checkEl.innerHTML='Erreur: '+e.message; }
  } else if(pasted===null){
    checkEl.innerHTML='Annulé';
  } else {
    // No paste, just try to check if real_data exists (from postMessage)
    let real=localStorage.getItem('mynote_real_data');
    if(real){
      try{
        let j=JSON.parse(real);
        if(j.success){
          checkEl.innerHTML='✅ Données déjà chargées: '+j.user.name;
          document.getElementById('result').style.display='block';
          document.getElementById('result').innerHTML='✅ '+j.user.name+'<br><a href="/" class="btn btn-success">Aller sur MyNote</a>';
          return;
        }
      }catch{}
    }
    checkEl.innerHTML='❌ Aucune donnée. Assure-toi d\\'avoir fait:<br>1) Toutatice → Pronote (EDT visible)<br>2) F12 → Console<br>3) Ctrl+V (code copié) → Entrée<br>4) Bulle verte apparue?<br><br>Si oui, reclique ici.';
  }
};

// Listen for messages
window.addEventListener('message', (e)=>{
  log('Message: '+JSON.stringify(e.data).substring(0,200));
  if(e.data && e.data.type==='mynote:real-data' && e.data.data.success){
    document.getElementById('result').style.display='block';
    document.getElementById('result').innerHTML='✅ Reçu: '+e.data.data.user.name+'<br><a href="/" class="btn btn-success">Aller sur MyNote</a>';
    localStorage.setItem('mynote_real_data', JSON.stringify(e.data.data));
  }
});

log('Prêt - URL: ${clean}');
</script>
</body>
</html>
  `);
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
    res.json({success:true,user:{name:session.user?.name, class:session.user?.studentClass?.name},instance:{url:clean},timetable,grades,homeworks,token:refresh.token,method:'auto-extract'});
  }catch(err){
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
app.listen(PORT,'0.0.0.0',()=>console.log('Auto extract listening',PORT));
