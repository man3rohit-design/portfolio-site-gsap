const express=require('express'),multer=require('multer'),fs=require('fs'),path=require('path'),crypto=require('crypto');
try{fs.readFileSync(path.join(__dirname,'.env'),'utf8').split('\n').forEach(l=>{const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2')})}catch{}
const PORT=process.env.PORT||3000;let PASS=process.env.ADMIN_PASSWORD;
if(!PASS||PASS.length<8){console.error('Set ADMIN_PASSWORD (8+ chars) in .env (copy .env.example to .env)');process.exit(1)}
const SECRET=process.env.SESSION_SECRET||crypto.createHash('sha256').update('sess:'+PASS).digest('hex');
const DATA=path.join(__dirname,'data'),UP=path.join(DATA,'uploads');fs.mkdirSync(UP,{recursive:true});
const f=n=>path.join(DATA,n+'.json'),load=(n,d=[])=>{try{return JSON.parse(fs.readFileSync(f(n),'utf8'))}catch(e){if(e.code==='ENOENT')return d;throw e}},save=(n,v)=>{fs.writeFileSync(f(n)+'.tmp',JSON.stringify(v,null,2));fs.renameSync(f(n)+'.tmp',f(n))};
const seed=require('./seed.json');['projects','certs'].forEach(c=>{if(!fs.existsSync(f(c)))save(c,seed[c].map(x=>({...x,id:crypto.randomUUID()})))});
const SEED_RESUME=path.join(__dirname,'seed-resume.pdf'),RESUME_PATH=path.join(DATA,'resume.pdf');if(!fs.existsSync(RESUME_PATH)&&fs.existsSync(SEED_RESUME))fs.copyFileSync(SEED_RESUME,RESUME_PATH);
const app=express();app.set('trust proxy',1);app.disable('x-powered-by');app.use(express.json({limit:'20kb'}));
app.use((q,s,n)=>{s.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'});n()});
app.use('/api',(q,s,n)=>{s.set('Cache-Control','no-store');n()});
/* rate limit + auth */
const hits=new Map(),limit=(max,ms)=>(q,s,n)=>{const k=q.ip+q.path,t=Date.now(),a=(hits.get(k)||[]).filter(x=>t-x<ms);if(a.length>=max)return s.status(429).json({error:'Too many requests, try later'});a.push(t);hits.set(k,a);n()};
setInterval(()=>{const t=Date.now();for(const[k,a]of hits)if(!a.length||t-a[a.length-1]>36e5)hits.delete(k)},10*60e3).unref();
const sign=v=>crypto.createHmac('sha256',SECRET).update(String(v)).digest('hex'),same=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const cookie=q=>((q.headers.cookie||'').split(';').map(c=>c.trim().split('=')).find(c=>c[0]==='sid')||[])[1];
const valid=t=>{if(!t)return false;const[e,s]=t.split('.');return !!e&&!!s&&Date.now()<+e&&same(s,sign(e))};
const auth=(q,s,n)=>valid(cookie(q))?n():s.status(401).json({error:'Login required'});
app.post('/api/login',limit(8,15*60e3),(q,s)=>{if(!same(sign(String((q.body||{}).password||'')),sign(PASS)))return s.status(401).json({error:'Wrong password'});const e=Date.now()+12*36e5;s.set('Set-Cookie',`sid=${e}.${sign(e)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.NODE_ENV==='production'?'; Secure':''}`);s.json({ok:true})});
app.post('/api/logout',(q,s)=>{s.set('Set-Cookie','sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');s.json({ok:true})});
app.get('/api/me',auth,(q,s)=>s.json({ok:true}));
/* public */
app.get('/api/projects',(q,s)=>s.json(load('projects')));
app.get('/api/certs',(q,s)=>s.json(load('certs')));
app.post('/api/contact',limit(5,60*60e3),(q,s)=>{const b=q.body||{};if(b.website)return s.json({ok:true});/* honeypot */
 const name=String(b.name||'').trim().slice(0,100),email=String(b.email||'').trim().slice(0,150),message=String(b.message||'').trim().slice(0,3000);
 if(!name||!message||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return s.status(400).json({error:'Please fill name, a valid email and message'});
 const l=load('messages');l.unshift({id:crypto.randomUUID(),name,email,message,date:new Date().toISOString(),read:false});save('messages',l.slice(0,1000));s.json({ok:true})});
app.get('/resume.pdf',(q,s)=>{const p=path.join(DATA,'resume.pdf');fs.existsSync(p)?s.set({'Content-Disposition':'inline; filename="Rohit-Kumar-Mandal-Resume.pdf"','Cache-Control':'no-cache'}).sendFile(p):s.status(404).send('Resume not uploaded yet')});
app.use('/uploads',express.static(UP,{maxAge:'7d'}));
/* admin */
const FIELDS={projects:['title','tools','overview','problem','results','github','demo','color','image'],certs:['title','issuer','url']};
const safeUrl=v=>/^(https?:\/\/|\/uploads\/)/.test(v)?v:'';
const clean=(c,b)=>{const o={};for(const k of FIELDS[c]){let v=b[k];if(k==='tools'){o[k]=(Array.isArray(v)?v:String(v||'').split(',')).map(x=>String(x).trim().slice(0,40)).filter(Boolean).slice(0,12)}else{v=String(v??'').trim().slice(0,1200);o[k]=['github','demo','image','url'].includes(k)?safeUrl(v):k==='color'?(/^#[0-9a-f]{6}$/i.test(v)?v:'#0d0d0d'):v}}return o};
const dropImg=u=>{if(typeof u==='string'&&u.startsWith('/uploads/'))try{fs.unlinkSync(path.join(UP,path.basename(u)))}catch{}};
const col=(q,s,n)=>FIELDS[q.params.col]?n():s.sendStatus(404);
app.get('/api/admin/messages',auth,(q,s)=>s.json(load('messages')));
app.patch('/api/admin/messages/:id',auth,(q,s)=>{const l=load('messages'),m=l.find(x=>x.id===q.params.id);if(!m)return s.sendStatus(404);m.read=!!q.body.read;save('messages',l);s.json(m)});
app.delete('/api/admin/messages/:id',auth,(q,s)=>{save('messages',load('messages').filter(x=>x.id!==q.params.id));s.json({ok:true})});
app.post('/api/admin/:col(projects|certs)',auth,col,(q,s)=>{const c=clean(q.params.col,q.body);if(!c.title)return s.status(400).json({error:'Title is required'});const l=load(q.params.col),i={id:crypto.randomUUID(),...c};l.push(i);save(q.params.col,l);s.json(i)});
app.put('/api/admin/:col(projects|certs)/:id',auth,col,(q,s)=>{const c=clean(q.params.col,q.body);if(!c.title)return s.status(400).json({error:'Title is required'});const l=load(q.params.col),i=l.findIndex(x=>x.id===q.params.id);if(i<0)return s.sendStatus(404);const old=l[i].image;l[i]={id:l[i].id,...c};save(q.params.col,l);if(old&&old!==l[i].image)dropImg(old);s.json(l[i])});
app.delete('/api/admin/:col(projects|certs)/:id',auth,col,(q,s)=>{const l=load(q.params.col),g=l.find(x=>x.id===q.params.id);save(q.params.col,l.filter(x=>x.id!==q.params.id));if(g&&g.image)dropImg(g.image);s.json({ok:true})});
const mem=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}});
app.post('/api/admin/resume',auth,mem.single('file'),(q,s)=>{if(!q.file||q.file.buffer.slice(0,4).toString()!=='%PDF')return s.status(400).json({error:'Upload a PDF file'});fs.writeFileSync(path.join(DATA,'resume.pdf'),q.file.buffer);s.json({ok:true})});
app.post('/api/admin/upload',auth,mem.single('file'),(q,s)=>{const b=q.file&&q.file.buffer,t=b&&(b.slice(0,3).toString('hex')==='ffd8ff'?'jpg':b.slice(0,4).toString('hex')==='89504e47'?'png':(b.slice(0,4).toString()==='RIFF'&&b.slice(8,12).toString()==='WEBP')?'webp':null);if(!t)return s.status(400).json({error:'Upload a JPG, PNG or WEBP image'});const n=crypto.randomBytes(8).toString('hex')+'.'+t;fs.writeFileSync(path.join(UP,n),b);s.json({url:'/uploads/'+n})});
app.use((e,q,s,n)=>{const st=e.status||(e.name==='MulterError'?400:500);if(st>=500)console.error(e);s.status(st).json({error:st>=500?'Server error':(e.message||'Bad request')})});
app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
app.listen(PORT,()=>console.log(`Portfolio: http://localhost:${PORT}  Admin: http://localhost:${PORT}/admin`)).on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${PORT} is already in use. Set PORT in .env`:e.message);process.exit(1)});
