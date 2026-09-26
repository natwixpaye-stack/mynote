import express from 'express';
import cors from 'cors';
import * as pawnote from 'pawnote';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

app.get('/api/health',(req,res)=>res.json({ok:true,flow:'autosync'}));

app.get('/mynote-autosync.user.js', (req,res)=>{
  res.set('Content-Type','application/javascript');
  res.sendFile('mynote-autosync.user.js', {root: '.'});
});

app.get('/api/test-pronote', async (req,res)=>{
  try{
    const clean=pawnote.cleanURL(req.query.url);
    const instance=await pawnote.instance(clean);
    res.json({success:true,instance:{name:instance.name, hasCAS:!!instance.casURL}});
  }catch(e){ res.status(500).json({error:e.message, name:e.name}); }
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
    res.json({success:true,user:{name:session.user?.name, class:session.user?.studentClass?.name},instance:{url:clean},timetable,grades,homeworks,token:refresh.token,method:'autosync'});
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
app.listen(PORT,'0.0.0.0',()=>console.log('autosync listening',PORT));
