import express from 'express';
import cors from 'cors';
import * as pawnote from 'pawnote';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

app.get('/api/health',(req,res)=>res.json({ok:true,flow:'fix-ent-login'}));

app.get('/api/test-pronote', async (req,res)=>{
  try{
    const clean=pawnote.cleanURL(req.query.url);
    const instance=await pawnote.instance(clean);
    res.json({success:true,instance:{name:instance.name, hasCAS:!!instance.casURL}});
  }catch(e){ res.status(500).json({error:e.message, name:e.name}); }
});

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
<title>MyNote ENT - Auto</title>
<style>
body{font-family:Inter,sans-serif;background:#0B1224;color:white;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#151E35;border:1px solid #233154;border-radius:20px;padding:24px}
.btn{background:#6C7CFF;color:white;border:0;padding:14px 20px;border-radius:12px;font-weight:800;cursor:pointer;width:100%;font-size:14px;margin:8px 0;display:block;text-align:center;text-decoration:none}
.btn-success{background:#2ECC71;color:black}
.btn-white{background:white;color:black}
.step{background:#ffffff08;border:1px solid #233154;border-radius:12px;padding:16px;margin:12px 0;font-size:13px;line-height:1.5}
code{background:#00000080;padding:10px;border-radius:8px;font-size:10px;word-break:break-all;display:block;margin:8px 0;white-space:pre-wrap}
.kbd{background:#ffffff20;padding:2px 8px;border-radius:6px;font-size:11px;border:1px solid #ffffff30}
.log{font-size:11px;background:#000;padding:10px;border-radius:8px;max-height:150px;overflow:auto;white-space:pre-wrap;margin-top:10px}
</style>
</head>
<body>
<div class="card">
  <div style="font-weight:800;font-size:20px">🔐 MyNote - Connexion auto (sans barre favoris)</div>
  <div style="font-size:11px;color:#ffffff60;margin-bottom:16px">${clean}</div>

  <div class="step" style="background:#6C7CFF15;border-color:#6C7CFF40">
    <div style="font-weight:800;font-size:14px;margin-bottom:8px">🎯 Méthode 1 clic (30s)</div>
    
    <div style="margin:12px 0"><b>1.</b> Ouvre Pronote via Toutatice<br>
    <a href="https://www.toutatice.fr" target="_blank" class="btn" style="padding:8px 16px;font-size:12px;width:auto;display:inline-block;margin:6px 0">Ouvrir Toutatice.fr →</a><br>
    <span style="font-size:11px;color:#ffffff80">EduConnect → Pronote → tu vois ton EDT</span></div>

    <div style="margin:12px 0"><b>2.</b> Copie le code<br>
    <button id="btnCopy" class="btn btn-white">📋 Copier le code (1 clic)</button>
    <span id="copyStatus" style="font-size:11px;color:#2ECC71;display:none">✅ Copié !</span></div>

    <div style="margin:12px 0"><b>3.</b> Dans Pronote, <span class="kbd">F12</span> → <span class="kbd">Console</span></div>
    <div style="margin:12px 0"><b>4.</b> <span class="kbd">Ctrl</span>+<span class="kbd">V</span> → <span class="kbd">Entrée</span> → bulle verte</div>
    <div style="margin:12px 0"><b>5.</b> Reviens ici<br>
    <button id="btnCheck" class="btn btn-success">📥 J'ai fait Ctrl+V + Entrée - Charger</button>
    <div id="checkStatus" style="margin-top:8px;font-size:12px"></div></div>
  </div>

  <div class="step">
    <div style="font-weight:700">Code à copier :</div>
    <code id="codeDisplay"></code>
  </div>

  <div id="result" style="display:none" class="step" style="background:#2ECC7120"></div>
  <div id="log" class="log"></div>
</div>

<script>
const CLEAN_URL="${clean}";
const DEVICE_UUID="${uuid}";
let logEl=document.getElementById('log');
function log(m){ logEl.textContent += "\\n"+m; console.log(m); }

const extractionCode = \`(function(){
  try{
    let url=location.href;
    if(!url.includes('pronote') && !url.includes('index-education')){
      alert('❌ Pas dans Pronote! Va sur toutatice.fr → Pronote, puis F12 → Console → colle code. Tu es sur: '+url);
      return;
    }
    let state=window.loginState;
    if(!state || !state.login){
      alert('❌ Pronote pas chargé! Attends EDT puis refais Ctrl+V + Entrée.');
      return;
    }
    let data={url:'\${clean}', login:state.login, token:state.mdp, deviceUUID:'\${uuid}', time:Date.now()};
    localStorage.setItem('mynote_papillon_token', JSON.stringify(data));
    fetch('https://mynote-k8am.onrender.com/api/ent-callback',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:'\${clean}', login:state.login, token:state.mdp, deviceUUID:'\${uuid}'})
    }).then(r=>r.json()).then(j=>{
      if(j.success){
        let b=document.createElement('div');
        b.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999999;background:#2ECC71;color:black;padding:20px 30px;border-radius:16px;font-family:sans-serif;font-weight:800;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.4);text-align:center';
        b.innerHTML='✅ MyNote: '+j.user.name+' connecté!<br><span style=\\\\'font-size:12px\\\\'>'+j.timetable.classes.length+' cours<br>Retourne sur MyNote</span>';
        document.body.appendChild(b);
        localStorage.setItem('mynote_real_data', JSON.stringify(j));
        if(window.opener){ window.opener.postMessage({type:'mynote:real-data', data:j}, '*'); }
      } else { alert('Erreur: '+j.error); }
    }).catch(e=>{
      let b=document.createElement('div');
      b.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999999;background:#6C7CFF;color:white;padding:20px 30px;border-radius:16px;font-weight:800;text-align:center';
      b.innerHTML='✅ Token extrait: '+state.login+'<br><span style=\\\\'font-size:12px\\\\'>Retourne sur MyNote et clique Charger</span>';
      document.body.appendChild(b);
    });
  }catch(e){ alert('Erreur: '+e.message); }
})();\`;

document.getElementById('codeDisplay').textContent=extractionCode;

document.getElementById('btnCopy').onclick=()=>{
  navigator.clipboard.writeText(extractionCode).then(()=>{
    document.getElementById('copyStatus').style.display='inline';
    document.getElementById('btnCopy').textContent='✅ Copié ! Va dans Pronote';
    document.getElementById('btnCopy').className='btn btn-success';
    log('Code copié');
  }).catch(()=>{
    let ta=document.createElement('textarea'); ta.value=extractionCode; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    document.getElementById('copyStatus').style.display='inline';
  });
};

document.getElementById('btnCheck').onclick=async()=>{
  let checkEl=document.getElementById('checkStatus');
  checkEl.innerHTML='Vérification...';
  let pasted=prompt('Si bulle verte apparue dans Pronote, clique OK.\\n\\nSinon, dans Pronote → F12 → Console → tape: localStorage.getItem(\\'mynote_papillon_token\\') → copie résultat et colle ici:');
  if(pasted && pasted.includes('login')){
    try{
      let data=JSON.parse(pasted);
      let res=await fetch('/api/ent-callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:data.url||CLEAN_URL, login:data.login, token:data.token, deviceUUID:data.deviceUUID||DEVICE_UUID})});
      let j=await res.json();
      if(j.success){
        checkEl.innerHTML='✅ '+j.user.name;
        localStorage.setItem('mynote_real_data', JSON.stringify(j));
        document.getElementById('result').style.display='block';
        document.getElementById('result').innerHTML='✅ '+j.user.name+'<br><a href="/" class="btn btn-success">Aller sur MyNote →</a>';
        if(window.opener) window.opener.postMessage({type:'mynote:real-data', data:j}, '*');
      } else { checkEl.innerHTML='Erreur: '+j.error; }
    }catch(e){ checkEl.innerHTML='Erreur: '+e.message; }
  } else if(pasted===null){ checkEl.innerHTML='Annulé'; }
  else {
    let real=localStorage.getItem('mynote_real_data');
    if(real){ try{ let j=JSON.parse(real); if(j.success){ checkEl.innerHTML='✅ Déjà chargé: '+j.user.name; document.getElementById('result').style.display='block'; document.getElementById('result').innerHTML='✅ '+j.user.name+'<br><a href="/" class="btn btn-success">Aller sur MyNote</a>'; return; } }catch{} }
    checkEl.innerHTML='❌ Aucune donnée. Fais: Toutatice → Pronote → F12 → Console → Ctrl+V → Entrée → bulle verte → reviens ici';
  }
};

window.addEventListener('message', (e)=>{
  if(e.data && e.data.type==='mynote:real-data' && e.data.data.success){
    document.getElementById('result').style.display='block';
    document.getElementById('result').innerHTML='✅ Reçu: '+e.data.data.user.name;
    localStorage.setItem('mynote_real_data', JSON.stringify(e.data.data));
  }
});

log('Prêt - ${clean}');
document.getElementById('status')?.remove();
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
    res.json({success:true,user:{name:session.user?.name, class:session.user?.studentClass?.name},instance:{url:clean},timetable,grades,homeworks,token:refresh.token,method:'auto'});
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
app.listen(PORT,'0.0.0.0',()=>console.log('fix-ent-login listening',PORT));
