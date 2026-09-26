import express from 'express';
import cors from 'cors';
import * as pawnote from 'pawnote';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

app.get('/api/health',(req,res)=>res.json({ok:true,flow:'client-side-direct'}));

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
    res.json({success:true,user:{name:session.user?.name, class:session.user?.studentClass?.name},instance:{url:clean},timetable,grades,homeworks,token:refresh.token,method:'ent-callback-server'});
  }catch(err){
    res.status(500).json({error:err.message, name:err.name});
  }
});

const PORT=process.env.PORT||10000;
app.listen(PORT,'0.0.0.0',()=>console.log('client-side-direct listening',PORT));
