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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

let lastError = null, lastSuccess = null;
const jars = new Map();
function getSid(req,res){let sid=req.cookies.mynote_sid;if(!sid){sid=Math.random().toString(36).slice(2)+Date.now().toString(36);res.cookie('mynote_sid',sid,{httpOnly:false,sameSite:'lax',maxAge:86400000*7});}if(!jars.has(sid))jars.set(sid,{});return sid;}

app.get('/api/health',(req,res)=>res.json({ok:true,pawnote:true,flow:'ent-fix',lastError:lastError?.time}));
app.get('/api/debug/last',(req,res)=>res.json({lastError,lastSuccess}));

app.get('/api/test-pronote', async (req,res)=>{
  const {url}=req.query; if(!url) return res.status(400).json({error:'url manquant'});
  try{
    const clean=pawnote.cleanURL(url);
    const instance=await pawnote.instance(clean);
    // Try to fetch mobile page to see if ENT blocks
    let mobileOk=false, mobileError=null;
    try{
      const r=await fetch(clean+"/mobile.eleve.html?fd=1",{headers:{"User-Agent":"Mozilla/5.0 (iPhone)"}});
      const txt=await r.text();
      mobileOk = txt.includes('PRONOTE') || txt.includes('pronote') || txt.includes('Start');
      if(!mobileOk) mobileError=txt.substring(0,300);
    }catch(e){ mobileError=e.message; }
    res.json({success:true,cleanUrl:clean,instance:{name:instance.name,version:instance.version,hasCAS:!!instance.casURL,casURL:instance.casURL},mobileOk,mobileError, entBlocked: !mobileOk});
  }catch(e){
    lastError={time:new Date().toISOString(),endpoint:'test-pronote',url,error:e.message,name:e.name};
    res.status(500).json({error:e.message,name:e.name});
  }
});

// BOOKMARKLET - receive data extracted from Pronote page in browser
app.post('/api/bookmarklet', async (req,res)=>{
  const {html, url, user, timetable, grades} = req.body;
  console.log('[bookmarklet] received', url, 'html len', html?.length);
  lastSuccess={time:new Date().toISOString(),method:'bookmarklet',url};
  // Try to parse basic info from html if provided
  try{
    // Store as real data
    res.json({success:true,message:'Données reçues via bookmarklet',received:{hasHtml:!!html,url,user}});
  }catch(e){
    res.status(500).json({error:e.message});
  }
});

// Direct login
app.post('/api/login-direct', async (req,res)=>{
  const {pronoteUrl,username,password}=req.body;
  if(!pronoteUrl||!username||!password) return res.status(400).json({error:'missing'});
  try{
    const clean=pawnote.cleanURL(pronoteUrl);
    const session=pawnote.createSessionHandle();
    const deviceUUID='mynote-'+Math.random().toString(36).slice(2);
    await pawnote.loginCredentials(session,{url:clean,kind:pawnote.AccountKind.STUDENT,username,password,deviceUUID,navigatorIdentifier:'MyNote/1.0'});
    const [timetable,grades,homeworks]=await Promise.all([
      pawnote.timetableFromIntervals(session,new Date(),new Date(Date.now()+7*86400000)).catch(e=>({error:e.message,classes:[]})),
      pawnote.gradesOverview(session).catch(e=>({error:e.message})),
      pawnote.assignmentsFromIntervals(session,new Date(),new Date(Date.now()+14*86400000)).catch(e=>[])
    ]);
    lastSuccess={time:new Date().toISOString(),method:'direct',user:session.user?.name};
    res.json({success:true,user:{name:session.user?.name,class:session.user?.studentClass?.name},instance:{url:clean},timetable,grades,homeworks});
  }catch(err){
    lastError={time:new Date().toISOString(),endpoint:'login-direct',error:err.message,name:err.name,stack:err.stack?.substring(0,1000)};
    let friendly=err.message;
    if(err.name==='PageUnavailableError') friendly=`ENT Bloque Render: Ton lycée ${pronoteUrl} utilise Toutatice qui bloque les serveurs externes. Le test mobile.eleve.html renvoie "ENT - Erreur technique". Solution: Utilise le BOOKMARKLET (voir onglet).`;
    if(err.name==='BadCredentialsError') friendly='Identifiants incorrects';
    res.status(500).json({error:friendly,originalError:err.message,name:err.name});
  }
});

// QR login - improved parser for Anita Conti format
app.post('/api/login-qr', async (req,res)=>{
  const {qrData,pin}=req.body;
  if(!qrData) return res.status(400).json({error:'qrData manquant'});
  console.log('[login-qr] len',qrData.length,'pin',pin,'preview',qrData.substring(0,100));
  try{
    let qrObj=null;
    let raw=qrData.trim();
    
    // Format 1: pronote://?url=...&login=...&jeton=...
    if(raw.startsWith('pronote://')){
      try{const u=new URL(raw);qrObj={url:u.searchParams.get('url'),login:u.searchParams.get('login'),jeton:u.searchParams.get('jeton')||u.searchParams.get('token')};}catch{}
    }
    // Format 2: JSON {"jeton":"...","login":"...","url":"..."} or {"url":...}
    if(!qrObj?.url){
      try{
        // Clean raw: it might have newlines/spaces in hex
        let cleaned = raw.replace(/\s+/g,'');
        // Try to extract JSON object
        const jsonMatch = cleaned.match(/\{.*\}/);
        if(jsonMatch){
          const parsed=JSON.parse(jsonMatch[0]);
          if(parsed.url) qrObj=parsed;
        }
        // If still not, try to parse raw as JSON directly (after removing spaces)
        if(!qrObj?.url){
          const parsed=JSON.parse(raw);
          if(parsed.url) qrObj=parsed;
        }
      }catch{}
    }
    // Format 3: Anita Conti format - long hex at start + ","login":"...","url":"..."
    // Example: CF6F4D88...4142C155","login":"582F...","url":"https://..."
    if(!qrObj?.url){
      // Extract url
      const urlMatch = raw.match(/https?:\/\/[^\s"']+\.index-education\.net\/pronote\/[^\s"']*/i) || raw.match(/https?:\/\/[^\s"']+\.index-education\.net\/pronote\/?/i);
      const loginMatch = raw.match(/"login"\s*:\s*"([A-F0-9]+)"/i);
      // jeton is long hex (100+ chars) - could be at start or in "jeton":"..."
      let jetonMatch = raw.match(/"jeton"\s*:\s*"([A-F0-9]+)"/i);
      let jeton = jetonMatch ? jetonMatch[1] : null;
      if(!jeton){
        // Look for long hex string at beginning or anywhere >100 chars
        const longHex = raw.match(/([A-F0-9]{100,})/i);
        if(longHex) jeton = longHex[1].replace(/\s+/g,'');
      }
      if(urlMatch){
        qrObj={
          url: urlMatch[0],
          login: loginMatch?loginMatch[1]:null,
          jeton: jeton
        };
      }
    }
    
    // Clean URL - remove mobile.eleve.html if present
    if(qrObj?.url){
      qrObj.url = qrObj.url.replace(/\/mobile\.eleve\.html.*$/i,'').replace(/\/mobile\.parent\.html.*$/i,'');
      if(!qrObj.url.endsWith('/pronote')) {
        // Ensure it ends with /pronote
        try{
          const u=new URL(qrObj.url);
          let p=u.pathname;
          if(p.includes('mobile')) p='/pronote/';
          qrObj.url = `${u.protocol}//${u.host}${p}`.replace(/\/$/,'');
          if(!qrObj.url.includes('/pronote')) qrObj.url+='/pronote';
        }catch{}
      }
      // Normalize to /pronote
      if(qrObj.url.includes('/pronote/')) qrObj.url = qrObj.url.split('/pronote/')[0]+'/pronote';
    }

    if(!qrObj?.url||!qrObj?.login||!qrObj?.jeton){
      return res.status(400).json({error:`QR incomplet - url:${!!qrObj?.url} login:${!!qrObj?.login} jeton:${!!qrObj?.jeton}`,receivedPreview:raw.substring(0,500),help:'Copie TOUT le contenu du QR Code depuis Pronote'});
    }

    console.log('[login-qr] parsed', {url:qrObj.url,loginLen:qrObj.login.length,jetonLen:qrObj.jeton.length,pin});

    // Check if instance is ENT blocked before trying pawnote
    const clean=pawnote.cleanURL(qrObj.url);
    const instance=await pawnote.instance(clean).catch(e=>null);
    if(instance?.casURL){
      // Try mobile page
      try{
        const r=await fetch(clean+"/mobile.eleve.html?fd=1",{headers:{"User-Agent":"Mozilla/5.0 (iPhone)"}});
        const txt=await r.text();
        if(txt.includes('ENT - Erreur technique') || txt.includes('Erreur technique') || !txt.includes('PRONOTE')){
          console.log('[login-qr] ENT detected blocking Render');
          return res.status(500).json({
            error:`🚫 Ton lycée ${instance.name} utilise ENT Toutatice qui bloque Render (serveur US). Même le QR Code ne marche pas depuis Render car mobile.eleve.html renvoie "ENT - Erreur technique".`,
            name:'ENTBlockedError',
            instance: {name:instance.name, hasCAS:true, casURL:instance.casURL},
            solution: 'Utilise le BOOKMARKLET: 1) Va dans Pronote via Toutatice 2) Clique sur le bookmarklet MyNote 3) Tes données seront extraites directement depuis ton navigateur (pas depuis Render). Voir onglet "🔖 Bookmarklet" dans MyNote.',
            bookmarklet: `javascript:(function(){let h=document.documentElement.outerHTML;let u=location.href;fetch('https://mynote-k8am.onrender.com/api/bookmarklet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:h,url:u})}).then(r=>r.json()).then(j=>{alert('MyNote: Données envoyées! Retourne sur MyNote');localStorage.setItem('mynote_bookmarklet',JSON.stringify({html:h,url:u,time:Date.now()}));}).catch(e=>alert('Erreur:'+e.message));})();`
          });
        }
      }catch(e){ console.log('mobile check error',e.message); }
    }

    const session=pawnote.createSessionHandle();
    const deviceUUID='mynote-'+Math.random().toString(36).slice(2)+Date.now().toString(36).slice(2);
    await pawnote.loginQrCode(session,{qr:{url:qrObj.url,login:qrObj.login,jeton:qrObj.jeton},pin:pin||'',deviceUUID,navigatorIdentifier:'MyNote/1.0'});

    const [timetable,grades,homeworks]=await Promise.all([
      pawnote.timetableFromIntervals(session,new Date(),new Date(Date.now()+7*86400000)).catch(e=>({error:e.message,classes:[]})),
      pawnote.gradesOverview(session).catch(e=>({error:e.message})),
      pawnote.assignmentsFromIntervals(session,new Date(),new Date(Date.now()+14*86400000)).catch(e=>[])
    ]);
    lastSuccess={time:new Date().toISOString(),method:'qr',user:session.user?.name};
    res.json({success:true,user:{name:session.user?.name,class:session.user?.studentClass?.name},instance:{url:clean},timetable,grades,homeworks});
  }catch(err){
    console.error('[login-qr] error',err);
    lastError={time:new Date().toISOString(),endpoint:'login-qr',pin,error:err.message,name:err.name,stack:err.stack?.substring(0,1500)};
    let friendly=err.message;
    if(err.name==='PageUnavailableError') friendly=`🚫 ENT Toutatice bloque Render: ${err.message}. Ton lycée utilise un ENT qui refuse les connexions depuis les serveurs US. Solution: Utilise le BOOKMARKLET (onglet 🔖) - ça extrait tes données directement depuis ton navigateur quand tu es dans Pronote.`;
    if(err.name==='BadCredentialsError') friendly='PIN ou QR incorrect - Le QR expire après 10 min! Génère un NOUVEAU QR et note bien le PIN à 4 chiffres (pas 0000).';
    res.status(500).json({error:friendly,originalError:err.message,name:err.name});
  }
});

app.get('/browse', async (req,res)=>{
  const targetUrl=req.query.url; if(!targetUrl) return res.status(400).send('url manquant');
  try{
    const r=await fetch(targetUrl,{headers:{'User-Agent':'Mozilla/5.0'}});
    const html=await r.text();
    res.send(html);
  }catch(e){res.status(500).send(e.message);}
});

const PORT=process.env.PORT||10000;
app.listen(PORT,'0.0.0.0',()=>console.log('MyNote ENT fix listening',PORT));
