import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { installAuth, publicUser } from './auth.js';
import { bump, ensureAcademics, newId, revision, transaction, dateInCollege } from './db.js';
import { assert, text, integer, interval, conflictsFor, availableSeats, expireRequests, userPlan, validDate } from './domain.js';
import { DEFAULT_POLICY } from '../src/config/vesit.js';
import { validateSemester, validatePolicy, planSemester } from '../shared/planner.js';
import { resolvePublicOrigins } from '../shared/origins.js';
import { developmentIdentity } from './dev-support.js';
import { forecastAttendance } from '../shared/attendance.js';
import { loadDemoData, resetDemoData, demoStatus, isDemoUser } from './demo.js';
import { installAssignmentRoutes, taskViews } from './assignments.js';
import { notify, notificationViews } from './notifications.js';

export function createApp(db, options = {}) {
  const config={authMode:'demo',publicOrigin:options.publicOrigin ?? resolvePublicOrigins(process.env).join(','),cookieSecure:false,sessionHours:8,...options};
  config.demoToolsEnabled=config.authMode==='demo'&&!config.production&&process.env.NODE_ENV!=='production';
  config.demoStatus=()=>demoStatus(db);
  const allowedOrigins = new Set(config.publicOrigin.split(',').map(origin=>origin.trim()));
  const app=express();
  if (config.trustProxy) app.set('trust proxy',1);
  app.disable('x-powered-by');
  app.use(express.json({limit:'512kb'}));
  app.use('/api', (req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      req.body ??= {};
      if(typeof req.body!=='object'||Array.isArray(req.body))return res.status(400).json({error:'A JSON object is required.'});
      if (!allowedOrigins.has(req.get('origin'))) return res.status(403).json({error:'Origin not allowed. Use the configured app origin.'});
      if (req.is('application/json')===false && Object.keys(req.body||{}).length) return res.status(415).json({error:'JSON required.'});
    }
    next();
  });
  app.get('/api/health',(_req,res)=>res.json({app:'Campus360',status:'ok',database:'sqlite',authMode:config.authMode,...(process.env.NODE_ENV!=='production'?{developmentInstance:developmentIdentity(config)}:{})}));
  const auth=installAuth(app,db,config);
  app.post('/api/demo/load',(req,res)=>{
    assert(config.demoToolsEnabled,404,'Development demo tools are unavailable.');
    res.json(loadDemoData(db));
  });
  const api=express.Router();
  app.use('/api',auth.requireAuth,api);
  api.post('/demo/reset',(req,res)=>{
    assert(config.demoToolsEnabled,404,'Development demo tools are unavailable.');
    assert(req.body.confirm==='RESET_DEMO_DATA',400,'Confirm reset of the isolated DEMO rehearsal workspace. Other accounts remain unchanged.');
    assert(isDemoUser(db,req.user.id),403,'Enter a DEMO workspace account to reset its rehearsal data.');
    res.json(resetDemoData(db));
  });
  api.post('/notifications/read-all',(req,res)=>{
    db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(new Date().toISOString(),req.user.id);bump(db);res.json({saved:true});
  });
  api.post('/notifications/:id/read',(req,res)=>{
    assert(typeof req.body.read==='boolean',400,'Choose read or unread.');
    const notification=db.prepare('SELECT id FROM notifications WHERE id=? AND user_id=?').get(req.params.id,req.user.id);assert(notification,404,'Notification not found.');
    db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').run(req.body.read?new Date().toISOString():null,notification.id,req.user.id);bump(db);res.json({saved:true});
  });
  const secret=randomBytes(32);
  const savedConfig=()=>JSON.parse(db.prepare("SELECT value FROM meta WHERE key='config'").get()?.value || '{}');
  const policyFor=id=>JSON.parse(db.prepare('SELECT policy FROM user_settings WHERE user_id=?').get(id)?.policy || JSON.stringify(DEFAULT_POLICY));
  const token=(userId,payload)=>createHmac('sha256',secret).update(JSON.stringify({userId,payload,revision:revision(db)})).digest('hex');
  function rideById(id,user) {
    const ride=db.prepare('SELECT r.*,u.name owner_name FROM rides r JOIN users u ON u.id=r.owner_id WHERE r.id=?').get(id);
    assert(ride,404,'Ride not found.');
    const cl=db.prepare('SELECT college_id FROM classes WHERE id=?').get(user.classId);
    assert(db.prepare('SELECT college_id FROM classes WHERE id=?').get(ride.class_id).college_id===cl.college_id,403,'Outside your college.');
    return ride;
  }
  function rideView(ride,user) {
    const requests=db.prepare('SELECT q.*,u.name rider_name FROM ride_requests q JOIN users u ON u.id=q.rider_id WHERE q.ride_id=?').all(ride.id)
      .filter(q=>q.rider_id===user.id||ride.owner_id===user.id)
      .map(q=>({id:q.id,riderId:q.rider_id,riderName:q.rider_name,status:q.status,expiresAt:q.expires_at,confirmedAt:q.confirmed_at}));
    return {id:ride.id,ownerId:ride.owner_id,ownerName:ride.owner_name,classId:ride.class_id,pickup:ride.pickup,dropoff:ride.dropoff,date:ride.date,departure:ride.departure,start:ride.start,end:ride.end,capacity:ride.capacity,remainingSeats:availableSeats(db,ride),bufferMinutes:ride.buffer_minutes,costNote:ride.cost_note,status:ride.status,version:ride.version,lat:ride.lat,lng:ride.lng,requests,demo:Boolean(ride.demo),instantDemo:config.demoToolsEnabled&&Boolean(ride.instant_demo)&&isDemoUser(db,ride.owner_id)};
  }
  function scheduleView(s,user) {
    const joined=Boolean(db.prepare('SELECT 1 FROM participation WHERE schedule_id=? AND user_id=?').get(s.id,user.id));
    return {id:s.id,classId:s.class_id,title:s.title,start:s.start,end:s.end,tags:JSON.parse(s.tags),kind:s.kind,version:s.version,joined,location:s.location,lectureType:s.lecture_type,sessionType:s.lecture_type,subjectCode:s.subject_code,demo:Boolean(s.demo),conflicts:joined||s.kind==='class'?conflictsFor(db,user.id,s,{excludeSchedule:s.id}):[]};
  }
  function directory() { return db.prepare('SELECT record FROM directory ORDER BY id').all().map(r=>JSON.parse(r.record)); }
  function suggestions(user,item,affected=[]) {
    const targetRoutes=affected.filter(a=>a.kind==='ride');
    const all=db.prepare("SELECT r.*,u.name owner_name FROM rides r JOIN users u ON u.id=r.owner_id JOIN classes c ON c.id=r.class_id WHERE c.college_id=(SELECT college_id FROM classes WHERE id=?) AND r.status='available'").all(user.classId);
    return all.filter(r=>r.owner_id!==user.id && Date.parse(r.start)>Date.now() && availableSeats(db,r)>0 && Date.parse(r.start)>=Date.parse(item.end)+r.buffer_minutes*60000 && dateInCollege(new Date(r.start))===dateInCollege(new Date(item.start)) && (!targetRoutes.length||targetRoutes.some(a=>{const old=db.prepare('SELECT pickup,dropoff FROM rides WHERE id=?').get(a.id);return old?.pickup===r.pickup&&old?.dropoff===r.dropoff;})) && !conflictsFor(db,user.id,r,{excludeSchedule:item.id,buffer:r.buffer_minutes}).some(c=>!affected.some(a=>a.id===c.id)))
      .map(r=>({rideId:r.id,ride:rideView(r,user),reason:`${targetRoutes.length?'Matches your affected ride route':'Available pickup option on this date'}: ${r.pickup} to ${r.dropoff}, ${availableSeats(db,r)} seat(s), leaving after ${item.title} plus ${r.buffer_minutes} minutes. Existing bookings stay unchanged; cancel a conflicting booking explicitly.`,help:directory().filter(d=>d.category==='Senior'&&d.interests.some(i=>[...(user.interests||[]),...(item.tags||[])].includes(i)))}));
  }
  function getAcademics(user) {
    ensureAcademics(db,user.id);
    const semesters=Object.fromEntries(db.prepare('SELECT * FROM academics WHERE user_id=?').all(user.id).map(r=>[r.semester,{...JSON.parse(r.record),version:r.version}]));
    return {semesters,policy:policyFor(user.id)};
  }
  api.get('/state',(req,res)=>{
    expireRequests(db);
    const {user}=req;
    const college=db.prepare('SELECT college_id FROM classes WHERE id=?').get(user.classId).college_id;
    const rides=db.prepare('SELECT r.*,u.name owner_name FROM rides r JOIN users u ON u.id=r.owner_id JOIN classes c ON c.id=r.class_id WHERE c.college_id=? ORDER BY r.start').all(college).map(r=>rideView(r,user));
    const schedule=db.prepare('SELECT * FROM schedule WHERE class_id=? ORDER BY start').all(user.classId).map(s=>scheduleView(s,user));
    const tasks=taskViews(db,user);
    const classes=db.prepare('SELECT c.id,c.name,COALESCE(SUM(p.points),0) points FROM classes c LEFT JOIN points_ledger p ON p.class_id=c.id WHERE c.college_id=? GROUP BY c.id ORDER BY points DESC,c.name,c.id').all(college);
    const students=db.prepare('SELECT u.id,u.name,COALESCE(SUM(p.points),0) points FROM users u LEFT JOIN points_ledger p ON p.user_id=u.id AND p.class_id=? WHERE u.class_id=? GROUP BY u.id ORDER BY points DESC,u.name,u.id').all(user.classId,user.classId);
    const demo={...demoStatus(db),enabled:config.demoToolsEnabled,account:isDemoUser(db,user.id)};
    res.json({me:user,demo,notifications:notificationViews(db,user.id),config:{...savedConfig(),...(demo.account?{collegeName:'VESIT, Mumbai',demoDate:demo.date,synthetic:true}:{}),policy:undefined,authMode:config.authMode},classes:db.prepare('SELECT id,name FROM classes WHERE college_id=?').all(college),academics:getAcademics(user),rides,schedule,tasks,leaderboard:{classes,students},directory:directory(),members:user.role==='moderator'?db.prepare('SELECT * FROM users WHERE class_id=?').all(user.classId).map(publicUser):[]});
  });
  api.put('/profile',(req,res)=>{
    const name=text(req.body.name,'name',80);
    const tags=(value)=>{assert(Array.isArray(value)&&value.length<=30&&value.every(t=>typeof t==='string'&&t.length<=80),400,'Invalid subject/interest tags.');return JSON.stringify([...new Set(value.map(t=>t.trim()).filter(Boolean))]);};
    const cl=req.body.classId || req.user.classId;
    const preferences=req.body.contactPreferences;
    if(preferences!==undefined)assert(preferences&&typeof preferences==='object'&&!Array.isArray(preferences)&&typeof preferences.emailNotifications==='boolean'&&typeof preferences.pushNotifications==='boolean'&&preferences.preferredContact==='in-app',400,'Choose valid contact preferences; in-app is the supported delivery channel.');
    assert(db.prepare('SELECT 1 FROM classes WHERE id=? AND college_id=(SELECT college_id FROM classes WHERE id=?)').get(cl,req.user.classId),400,'Invalid class.');
    assert(cl===req.user.classId||req.user.membership!=='approved',403,'Approved class changes need moderator review.');
    db.prepare('UPDATE users SET name=?,subjects=?,interests=?,class_id=?,onboarding=1,membership=? WHERE id=?').run(name,tags(req.body.subjects),tags(req.body.interests),cl,cl===req.user.classId?req.user.membership:'unverified',req.user.id);if(preferences!==undefined)db.prepare('UPDATE users SET contact_preferences=? WHERE id=?').run(JSON.stringify({emailNotifications:preferences.emailNotifications,pushNotifications:preferences.pushNotifications,preferredContact:'in-app'}),req.user.id);bump(db);res.json({saved:true});
  });
  api.post('/membership/request',(req,res)=>{
    assert(req.user.membership!=='approved',409,'Membership is already approved.');
    db.prepare("UPDATE users SET membership='pending' WHERE id=?").run(req.user.id);bump(db);res.json({status:'pending'});
  });
  api.post('/membership/:id',auth.requireModerator,(req,res)=>{
    assert(['approved','rejected'].includes(req.body.status),400,'Invalid membership status.');
    const target=db.prepare('SELECT * FROM users WHERE id=? AND class_id=?').get(req.params.id,req.user.classId);assert(target&&target.role!=='moderator',404,'Student not found in your class.');
    db.prepare('UPDATE users SET membership=? WHERE id=?').run(req.body.status,target.id);bump(db);res.json({saved:true});
  });
  api.post('/academics',(req,res)=>{
    const semester=integer(req.body.semester,'semester',1,2);ensureAcademics(db,req.user.id);
    const stored=db.prepare('SELECT * FROM academics WHERE user_id=? AND semester=?').get(req.user.id,semester);
    assert(stored.version===req.body.version,409,'Academic data changed. Reload before saving.');
    try {validateSemester(req.body.record);if(req.body.policy)validatePolicy(req.body.policy);}catch(e){assert(false,400,e.message);}
    const prior=JSON.parse(stored.record);
    assert(prior.courses.every(c=>req.body.record.courses.some(n=>n.code===c.code)),400,'Existing courses cannot be removed; preserve academic history.');
    for(const c of req.body.record.courses)for(const [key,value] of Object.entries(prior.marks[c.code]||{}))assert(value==null||(c.maxima[key]!=null&&value<=c.maxima[key]),400,'The new scheme would invalidate previously saved marks.');
    assert(JSON.stringify(req.body.record.attendance)===JSON.stringify(prior.attendance)&&JSON.stringify(req.body.record.events)===JSON.stringify(prior.events),400,'Use the attendance endpoints to edit lecture records.');
    const record={...req.body.record};delete record.version;
    const changedPolicy=req.body.policy&&JSON.stringify(req.body.policy)!==JSON.stringify(policyFor(req.user.id));
    if(changedPolicy)record.confirmed=false;
    if(record.confirmed) assert(planSemester(record,req.body.policy||policyFor(req.user.id)).currentSGPA!=null,400,'Only complete results with configured rules can be confirmed.');
    transaction(db,()=>{
      db.prepare('UPDATE academics SET record=?,version=version+1 WHERE user_id=? AND semester=?').run(JSON.stringify(record),req.user.id,semester);
      if(changedPolicy)for(const other of db.prepare('SELECT * FROM academics WHERE user_id=? AND semester!=?').all(req.user.id,semester)){const r=JSON.parse(other.record);r.confirmed=false;db.prepare('UPDATE academics SET record=?,version=version+1 WHERE user_id=? AND semester=?').run(JSON.stringify(r),req.user.id,other.semester);}
      if(req.body.policy)db.prepare('INSERT INTO user_settings VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET policy=excluded.policy').run(req.user.id,JSON.stringify(req.body.policy));bump(db);
    });notify(db,req.user.id,{title:'Marks updated',body:`Semester ${semester} marks, target and saved rules were updated. Planning estimates remain separate.`,kind:'marks',link:'/marks'});res.json({saved:true,version:stored.version+1});
  });
  api.post('/academics/import',(req,res)=>{
    ensureAcademics(db,req.user.id);
    assert(req.body.confirm===true,400,'Preview the import and explicitly confirm.');
    const incoming=req.body.semesters;assert(incoming&&typeof incoming==='object',400,'Semesters required.');
    transaction(db,()=>{for(const sem of [1,2]){if(!incoming[sem])continue;const previous=JSON.parse(db.prepare('SELECT record FROM academics WHERE user_id=? AND semester=?').get(req.user.id,sem).record);assert(!Object.keys(previous.marks).length&&!previous.events.length&& !Object.keys(previous.attendance).length,409,'Server records already exist. Import never overwrites them.');try{validateSemester(incoming[sem]);}catch(e){assert(false,400,e.message);}const record={...incoming[sem],confirmed:false};delete record.version;db.prepare('UPDATE academics SET record=?,version=version+1 WHERE user_id=? AND semester=?').run(JSON.stringify(record),req.user.id,sem);}bump(db);});res.json({imported:true});
  });
  api.post('/attendance',(req,res)=>{
    const {code,type,present,date}=req.body;const sem=integer(req.body.semester,'semester',1,2);ensureAcademics(db,req.user.id);
    const stored=db.prepare('SELECT * FROM academics WHERE user_id=? AND semester=?').get(req.user.id,sem);const record=JSON.parse(stored.record);const course=record.courses.find(c=>c.code===code);
    assert(course&&(type==='theory'?course.credits>course.practicalCredits:type==='practical'&&course.practicalCredits>0)&&typeof present==='boolean'&&validDate(date),400,'Invalid lecture.');
    const key=`${code}:${type}`;const count=record.attendance[key]||{present:0,total:0};record.attendance[key]={present:count.present+Number(present),total:count.total+1};record.events.push({id:newId(),code,type,present,date});
    db.prepare('UPDATE academics SET record=?,version=version+1 WHERE user_id=? AND semester=?').run(JSON.stringify(record),req.user.id,sem);bump(db);const target=policyFor(req.user.id).attendanceThreshold;const savedCount=record.attendance[key];notify(db,req.user.id,{title:target&&savedCount.present/savedCount.total*100<target?'Attendance below planning target':'Attendance saved',body:`${course.subject} ${type}: ${savedCount.present}/${savedCount.total} attended (${(100*savedCount.present/savedCount.total).toFixed(1)}%). Self-reported record.`,kind:'attendance',link:'/attendance'});res.status(201).json({saved:true});
  });
  api.post('/attendance/plan',(req,res)=>{
    const sem=integer(req.body.semester,'semester',1,2);
    ensureAcademics(db,req.user.id);
    const stored=db.prepare('SELECT * FROM academics WHERE user_id=? AND semester=?').get(req.user.id,sem);
    assert(Number.isInteger(req.body.version)&&req.body.version===stored.version,409,'Attendance records changed. Refresh and review the plan before saving.');
    const record=JSON.parse(stored.record);
    const {code,type,remaining,plannedPresent,target}=req.body;
    const course=record.courses.find(c=>c.code===code);
    assert(course&&(type==='theory'?course.credits>course.practicalCredits:type==='practical'&&course.practicalCredits>0),400,'Choose an existing subject and attendance type.');
    assert(Number.isSafeInteger(remaining)&&Number.isSafeInteger(plannedPresent)&&typeof target==='number',400,'A plan requires whole lecture counts and a numeric target.');
    const key=`${code}:${type}`;
    const counts=record.attendance[key]||{present:0,total:0};
    try{forecastAttendance({...counts,remaining,plannedPresent,target});}catch(error){assert(false,400,error.message);}
    record.attendancePlans={...record.attendancePlans,[key]:{remaining,plannedPresent,target}};
    db.prepare('UPDATE academics SET record=?,version=version+1 WHERE user_id=? AND semester=?').run(JSON.stringify(record),req.user.id,sem);
    bump(db);res.json({saved:true,plan:record.attendancePlans[key]});
  });
  api.delete('/attendance/:id',(req,res)=>{
    const sem=integer(Number(req.query.semester),'semester',1,2);const stored=db.prepare('SELECT * FROM academics WHERE user_id=? AND semester=?').get(req.user.id,sem);assert(stored,404,'Semester not found.');const record=JSON.parse(stored.record);const event=record.events.find(e=>e.id===req.params.id);assert(event,404,'Attendance record not found.');const count=record.attendance[`${event.code}:${event.type}`];count.total--;count.present-=Number(event.present);record.events=record.events.filter(e=>e.id!==event.id);db.prepare('UPDATE academics SET record=?,version=version+1 WHERE user_id=? AND semester=?').run(JSON.stringify(record),req.user.id,sem);bump(db);res.json({saved:true});
  });
  // Rides, schedule and class-board routes share the same database and authorization.
  installBusinessRoutes(api,{db,auth,config,savedConfig,token,rideById,rideView,scheduleView,suggestions,directory});
  app.use('/api',(_req,res)=>res.status(404).json({error:'Unknown API route.'}));
  const dist=resolve('dist');
  if(existsSync(resolve(dist,'index.html'))){app.use(express.static(dist));app.get(/.*/,(_req,res)=>res.sendFile(resolve(dist,'index.html')));}
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.status?error.message:'The server could not complete this request.'}));
  return app;
}

function installBusinessRoutes(api,ctx) {
  const {db,auth,config,token,rideById,suggestions,directory}=ctx;
  installAssignmentRoutes(api,{db,auth,notify});
  const requiredVersion=(given,current)=>assert(given===current,409,'This record changed. Preview again before continuing.');
  function requestRow(id,user) {
    const request=db.prepare('SELECT * FROM ride_requests WHERE id=?').get(id);assert(request,404,'Request not found.');const ride=rideById(request.ride_id,user);assert(ride.owner_id===user.id||request.rider_id===user.id,403,'This request belongs to another account.');return {request,ride};
  }
  function offerInput(body,user) {
    const {date,departure}=body;
    assert(validDate(date)&&typeof departure==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(departure),400,'Ride date/time required.');
    const start=`${date}T${departure}:00+05:30`;
    assert(Date.parse(start)>Date.now(),400,'Departure must be in the future.');
    const end=new Date(Date.parse(start)+30*60000).toISOString();
    return {ownerId:user.id,date,departure,start,end,pickup:text(body.pickup,'pickup',100),dropoff:text(body.dropoff,'drop-off',100),capacity:integer(body.capacity,'capacity',1,8),buffer:integer(body.bufferMinutes??10,'buffer',0,120),costNote:String(body.costNote||'').slice(0,200)};
  }
  api.post('/rides/offer-preview',auth.requireApproved,(req,res)=>{
    const item=offerInput(req.body,req.user);
    res.json({conflicts:conflictsFor(db,req.user.id,item,{buffer:item.buffer}),previewToken:token(req.user.id,{purpose:'offer',item})});
  });
  api.post('/rides',auth.requireApproved,(req,res)=>{
    const item=offerInput(req.body,req.user);
    assert(req.body.previewToken===token(req.user.id,{purpose:'offer',item}),409,'The plan changed. Preview this ride offer before saving.');
    const conflicts=conflictsFor(db,req.user.id,item,{buffer:item.buffer});
    assert(!conflicts.length||req.body.acknowledgeConflicts===true,409,'Creating this ride conflicts with your plan. Review before saving.');
    const id=newId();db.prepare('INSERT INTO rides(id,owner_id,class_id,pickup,dropoff,date,departure,start,end,capacity,buffer_minutes,cost_note,lat,lng) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,req.user.id,req.user.classId,item.pickup,item.dropoff,item.date,item.departure,item.start,item.end,item.capacity,item.buffer,item.costNote,19.045,72.889);bump(db);res.status(201).json({id});
  });
  api.post('/rides/preview',(req,res)=>{expireRequests(db);const ride=rideById(req.body.rideId,req.user);res.json({version:ride.version,previewToken:token(req.user.id,{purpose:'request',rideId:ride.id,version:ride.version}),conflicts:conflictsFor(db,req.user.id,ride,{excludeRide:ride.id,buffer:ride.buffer_minutes})});});
  api.post('/rides/:id/requests',auth.requireApproved,(req,res)=>{
    expireRequests(db);
    let booking;
    transaction(db,()=>{
      const ride=rideById(req.params.id,req.user);
      requiredVersion(req.body.version,ride.version);
      assert(req.body.previewToken===token(req.user.id,{purpose:'request',rideId:ride.id,version:ride.version}),409,'The day plan changed. Preview this request again.');
      assert(ride.owner_id!==req.user.id,400,'You cannot book your own ride.');
      assert(ride.status==='available'&&Date.parse(ride.start)>Date.now(),409,'This ride has departed or is unavailable.');
      assert(availableSeats(db,ride)>0,409,'No seats remain.');
      assert(!db.prepare("SELECT 1 FROM ride_requests WHERE ride_id=? AND rider_id=? AND status IN('pending','confirmed')").get(ride.id,req.user.id),409,'An active request already exists.');
      const conflicts=conflictsFor(db,req.user.id,ride,{buffer:ride.buffer_minutes});
      assert(!conflicts.length||req.body.acknowledgeConflicts===true,409,'Review schedule conflicts before requesting.');
      const instant=config.demoToolsEnabled&&req.user.demo&&ride.demo&&ride.instant_demo&&isDemoUser(db,ride.owner_id);
      const id=newId();
      db.prepare('INSERT INTO ride_requests(id,ride_id,rider_id,status,created_at,expires_at,confirmed_at) VALUES(?,?,?,?,?,?,?)')
        .run(id,ride.id,req.user.id,instant?'confirmed':'pending',Date.now(),Date.now()+900000,instant?Date.now():null);
      db.prepare('UPDATE rides SET version=version+1 WHERE id=?').run(ride.id);
      notify(db,req.user.id,{title:instant?'DEMO ride booking confirmed':'Ride request saved',body:instant?`${ride.pickup} to ${ride.dropoff}: one simulated seat reserved. No transport is arranged and no payment is taken.`:`Your request for ${ride.pickup} to ${ride.dropoff} awaits the driver.`,kind:'ride',link:`/rides?ride=${ride.id}`});
      notify(db,ride.owner_id,{title:instant?'DEMO seat reserved':'New ride request',body:`${req.user.name}: ${ride.pickup} to ${ride.dropoff}.`,kind:'ride',link:`/rides?ride=${ride.id}`});
      bump(db);booking={id,requested:!instant,confirmed:Boolean(instant)};
    });
    res.status(201).json(booking);
  });
  api.post('/requests/:id/preview',(req,res)=>{expireRequests(db);const {ride,request}=requestRow(req.params.id,req.user);res.json({version:ride.version,previewToken:token(req.user.id,{purpose:'confirm',requestId:request.id,version:ride.version}),conflicts:conflictsFor(db,request.rider_id,ride,{excludeRide:ride.id,buffer:ride.buffer_minutes})});});
  api.post('/requests/:id',(req,res)=>{
    expireRequests(db);transaction(db,()=>{
      const {request,ride}=requestRow(req.params.id,req.user);const action=req.body.action;
      if(action==='cancel'){assert(request.rider_id===req.user.id,403,'Only the rider can cancel.');if(request.status==='cancelled')return;assert(['pending','confirmed'].includes(request.status),409,'Request is no longer active.');db.prepare("UPDATE ride_requests SET status='cancelled',cancelled_at=? WHERE id=?").run(Date.now(),request.id);notify(db,req.user.id,{title:'Ride booking cancelled',body:`${ride.pickup} to ${ride.dropoff}: any reserved seat was released.`,kind:'ride',link:`/rides?ride=${ride.id}`});}
      else {assert(req.user.membership==='approved',403,'Approved membership is required.');assert(ride.owner_id===req.user.id,403,'Only the ride owner may approve or reject.');assert(['confirm','reject'].includes(action),400,'Invalid request action.');if(action==='confirm'&&request.status==='confirmed')return;assert(request.status==='pending'&&request.expires_at>Date.now()&&Date.parse(ride.start)>Date.now(),409,'Request expired or departure has passed.');if(action==='confirm')requiredVersion(req.body.version,ride.version);
        if(action==='confirm'){assert(req.body.previewToken===token(req.user.id,{purpose:'confirm',requestId:request.id,version:ride.version}),409,'The day plan changed. Preview this confirmation again.');const rider=db.prepare('SELECT membership FROM users WHERE id=?').get(request.rider_id);assert(rider.membership==='approved',403,'Rider membership is not approved.');assert(availableSeats(db,ride)>0,409,'The final seat was already taken.');const conflicts=conflictsFor(db,request.rider_id,ride,{excludeRide:ride.id,buffer:ride.buffer_minutes});assert(!conflicts.length||req.body.acknowledgeConflicts===true,409,'The rider has schedule conflicts; preview and acknowledge before confirming.');db.prepare("UPDATE ride_requests SET status='confirmed',confirmed_at=? WHERE id=?").run(Date.now(),request.id);notify(db,request.rider_id,{title:'Ride booking confirmed',body:`${ride.pickup} to ${ride.dropoff}: one seat reserved.`,kind:'ride',link:`/rides?ride=${ride.id}`});}
        else db.prepare("UPDATE ride_requests SET status='rejected' WHERE id=?").run(request.id);
      }
      db.prepare('UPDATE rides SET version=version+1 WHERE id=?').run(ride.id);bump(db);
    });res.json({saved:true});
  });
  function scheduleInput(body,user) {
    const current=body.id?db.prepare('SELECT * FROM schedule WHERE id=? AND class_id=?').get(body.id,user.classId):null;assert(!body.id||current,404,'Schedule item not found.');if(current)requiredVersion(body.version,current.version);interval(body.start,body.end);
    return {id:current?.id||null,title:text(body.title,'title',120),start:body.start,end:body.end,version:current?.version||0,tags:Array.isArray(body.tags)?body.tags.filter(t=>typeof t==='string').slice(0,10):current?JSON.parse(current.tags):[]};
  }
  function previewSchedule(item,user) {
    const existing=item.id?db.prepare('SELECT kind FROM schedule WHERE id=?').get(item.id):null;
    const participants=existing?.kind==='class'?db.prepare('SELECT id FROM users WHERE class_id=?').all(user.classId).map(u=>u.id):item.id?db.prepare('SELECT user_id FROM participation WHERE schedule_id=?').all(item.id).map(p=>p.user_id):[user.id];
    const affected=participants.flatMap(id=>conflictsFor(db,id,item,{excludeSchedule:item.id}).map(c=>({...c,userId:id})));
    return {conflicts:conflictsFor(db,user.id,item,{excludeSchedule:item.id}),affected,suggestions:participants.flatMap(id=>{const u=publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));return suggestions(u,item,affected.filter(a=>a.userId===id));}),version:item.version,previewToken:token(user.id,item)};
  }
  api.post('/schedule/preview',auth.requireModerator,(req,res)=>res.json(previewSchedule(scheduleInput(req.body,req.user),req.user)));
  api.post('/schedule',auth.requireModerator,(req,res)=>{
    const item=scheduleInput(req.body,req.user);assert(req.body.previewToken===token(req.user.id,item),409,'The plan changed. Preview this schedule edit again.');const preview=previewSchedule(item,req.user);assert(!preview.affected.length||req.body.acknowledgeConflicts===true,409,'Acknowledge affected plans before saving.');
    if(item.id)db.prepare('UPDATE schedule SET title=?,start=?,end=?,tags=?,version=version+1 WHERE id=?').run(item.title,item.start,item.end,JSON.stringify(item.tags),item.id);
    else db.prepare('INSERT INTO schedule(id,class_id,title,start,end,tags) VALUES(?,?,?,?,?,?)').run(newId(),req.user.classId,item.title,item.start,item.end,JSON.stringify(item.tags));for(const user of db.prepare('SELECT id FROM users WHERE class_id=?').all(req.user.classId))notify(db,user.id,{title:'Class schedule updated',body:`${item.title}: ${item.start}. Review your day plan for conflicts.`,kind:'schedule',link:'/updates'});bump(db);res.json({saved:true,affected:preview.affected});
  });
  api.post('/schedule/:id/preview',(req,res)=>{const s=db.prepare('SELECT * FROM schedule WHERE id=? AND class_id=?').get(req.params.id,req.user.classId);assert(s,404,'Schedule item not found.');res.json({version:s.version,previewToken:token(req.user.id,{purpose:'join',id:s.id,version:s.version}),conflicts:conflictsFor(db,req.user.id,s,{excludeSchedule:s.id})});});
  api.post('/schedule/:id/join',(req,res)=>{const s=db.prepare('SELECT * FROM schedule WHERE id=? AND class_id=?').get(req.params.id,req.user.classId);assert(s,404,'Schedule item not found.');requiredVersion(req.body.version,s.version);assert(req.body.previewToken===token(req.user.id,{purpose:'join',id:s.id,version:s.version}),409,'The plan changed. Preview joining again.');assert(Date.parse(s.end)>Date.now(),409,'This event has ended.');const conflicts=conflictsFor(db,req.user.id,s,{excludeSchedule:s.id});assert(!conflicts.length||req.body.acknowledgeConflicts===true,409,'Review conflicts before joining.');db.prepare('INSERT OR IGNORE INTO participation VALUES(?,?)').run(s.id,req.user.id);bump(db);res.json({joined:true});});
  api.get('/today',(req,res)=>{
    const date=req.query.date||dateInCollege();assert(/^\d{4}-\d{2}-\d{2}$/.test(date),400,'Invalid date.');const plan=userPlan(db,req.user.id).filter(p=>dateInCollege(new Date(p.start))===date);const items=plan.map(p=>({id:p.id,title:p.title,start:p.start,end:p.end,kind:p.kind,location:p.location||'',lectureType:p.lecture_type||'',sessionType:p.lecture_type||'',demo:Boolean(p.demo),conflicts:conflictsFor(db,req.user.id,p,{excludeSchedule:p.kind!=='ride'?p.id:null,excludeRide:p.kind==='ride'?p.id:null})}));
    const suggested=plan.filter(p=>p.kind!=='ride').flatMap(p=>suggestions(req.user,{...p,tags:JSON.parse(p.tags||'[]')},items.find(i=>i.id===p.id)?.conflicts||[]));res.json({date,items,suggestions:suggested,help:directory().filter(d=>d.category==='Senior'&&d.interests.some(i=>req.user.interests.includes(i)))});
  });
}
