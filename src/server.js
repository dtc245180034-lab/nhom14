const express = require('express');
const helmet = require('helmet');
const client = require('prom-client');
const { pool, initDb } = require('./db');

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

client.collectDefaultMetrics({ prefix: 'project_app_' });
const httpDuration = new client.Histogram({ name: 'project_app_http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method','route','status'], buckets: [0.01,0.05,0.1,0.3,1,3] });
app.use((req,res,next) => { const end=httpDuration.startTimer(); res.on('finish',()=>end({method:req.method,route:req.route?.path||req.path,status:String(res.statusCode)})); next(); });

const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const allowed = {
  projectStatus: ['Planning','Active','Completed','On Hold'],
  taskStatus: ['To Do','In Progress','Done'], priority: ['Low','Medium','High']
};
const clean = value => String(value || '').trim();

app.get('/health', asyncRoute(async (_req,res) => { await pool.query('SELECT 1'); res.json({status:'ok'}); }));
app.get('/metrics', asyncRoute(async (_req,res) => { res.set('Content-Type',client.register.contentType); res.end(await client.register.metrics()); }));

app.get('/api/dashboard', asyncRoute(async (_req,res) => {
  const [projects,tasks,members,recent] = await Promise.all([
    pool.query("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='Active')::int active FROM projects"),
    pool.query("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='Done')::int done, COUNT(*) FILTER (WHERE status='In Progress')::int progress FROM tasks"),
    pool.query('SELECT COUNT(*)::int total FROM members'),
    pool.query(`SELECT t.*,p.name project_name,m.name assignee_name FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN members m ON m.id=t.assignee_id ORDER BY t.created_at DESC LIMIT 8`)
  ]);
  res.json({projects:projects.rows[0],tasks:tasks.rows[0],members:members.rows[0],recent:recent.rows});
}));

app.get('/api/projects', asyncRoute(async (_req,res) => res.json((await pool.query('SELECT * FROM projects ORDER BY id DESC')).rows)));
app.post('/api/projects', asyncRoute(async (req,res) => {
  const {name,description,start_date,end_date}=req.body; const status=allowed.projectStatus.includes(req.body.status)?req.body.status:'Planning';
  if (!clean(name)) return res.status(400).json({error:'Tên dự án là bắt buộc'});
  const q=await pool.query('INSERT INTO projects(name,description,status,start_date,end_date) VALUES($1,$2,$3,$4,$5) RETURNING *',[clean(name),clean(description),status,start_date||null,end_date||null]); res.status(201).json(q.rows[0]);
}));
app.put('/api/projects/:id', asyncRoute(async (req,res) => {
  const status=allowed.projectStatus.includes(req.body.status)?req.body.status:'Planning';
  const q=await pool.query('UPDATE projects SET name=$1,description=$2,status=$3,start_date=$4,end_date=$5 WHERE id=$6 RETURNING *',[clean(req.body.name),clean(req.body.description),status,req.body.start_date||null,req.body.end_date||null,req.params.id]); if(!q.rowCount)return res.status(404).json({error:'Không tìm thấy'}); res.json(q.rows[0]);
}));
app.delete('/api/projects/:id', asyncRoute(async (req,res) => { const q=await pool.query('DELETE FROM projects WHERE id=$1',[req.params.id]); res.status(q.rowCount?204:404).end(); }));

app.get('/api/members', asyncRoute(async (_req,res) => res.json((await pool.query('SELECT * FROM members ORDER BY id DESC')).rows)));
app.post('/api/members', asyncRoute(async (req,res) => { if(!clean(req.body.name)||!clean(req.body.email))return res.status(400).json({error:'Tên và email là bắt buộc'}); const q=await pool.query('INSERT INTO members(name,email,role) VALUES($1,$2,$3) RETURNING *',[clean(req.body.name),clean(req.body.email).toLowerCase(),clean(req.body.role)||'Developer']);res.status(201).json(q.rows[0]); }));
app.put('/api/members/:id', asyncRoute(async (req,res) => { const q=await pool.query('UPDATE members SET name=$1,email=$2,role=$3 WHERE id=$4 RETURNING *',[clean(req.body.name),clean(req.body.email).toLowerCase(),clean(req.body.role)||'Developer',req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Không tìm thấy'});res.json(q.rows[0]); }));
app.delete('/api/members/:id', asyncRoute(async (req,res) => { const q=await pool.query('DELETE FROM members WHERE id=$1',[req.params.id]);res.status(q.rowCount?204:404).end(); }));

app.get('/api/tasks', asyncRoute(async (_req,res) => res.json((await pool.query(`SELECT t.*,p.name project_name,m.name assignee_name FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN members m ON m.id=t.assignee_id ORDER BY t.id DESC`)).rows)));
app.post('/api/tasks', asyncRoute(async (req,res) => { const status=allowed.taskStatus.includes(req.body.status)?req.body.status:'To Do'; const priority=allowed.priority.includes(req.body.priority)?req.body.priority:'Medium'; if(!clean(req.body.title)||!req.body.project_id)return res.status(400).json({error:'Tiêu đề và dự án là bắt buộc'}); const q=await pool.query('INSERT INTO tasks(title,description,status,priority,due_date,project_id,assignee_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[clean(req.body.title),clean(req.body.description),status,priority,req.body.due_date||null,req.body.project_id,req.body.assignee_id||null]);res.status(201).json(q.rows[0]); }));
app.put('/api/tasks/:id', asyncRoute(async (req,res) => { const status=allowed.taskStatus.includes(req.body.status)?req.body.status:'To Do';const priority=allowed.priority.includes(req.body.priority)?req.body.priority:'Medium';const q=await pool.query('UPDATE tasks SET title=$1,description=$2,status=$3,priority=$4,due_date=$5,project_id=$6,assignee_id=$7 WHERE id=$8 RETURNING *',[clean(req.body.title),clean(req.body.description),status,priority,req.body.due_date||null,req.body.project_id,req.body.assignee_id||null,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Không tìm thấy'});res.json(q.rows[0]); }));
app.delete('/api/tasks/:id', asyncRoute(async (req,res) => { const q=await pool.query('DELETE FROM tasks WHERE id=$1',[req.params.id]);res.status(q.rowCount?204:404).end(); }));

app.use(express.static('src/public'));
app.use((err,_req,res,_next) => { console.error(JSON.stringify({level:'error',message:err.message})); res.status(err.code==='23505'?409:500).json({error:err.code==='23505'?'Email đã tồn tại':'Lỗi máy chủ'}); });

const port=process.env.PORT||3000;
async function start(){ for(let i=1;i<=20;i++){ try{await initDb();break;}catch(e){if(i===20)throw e;console.log(`Waiting for database (${i}/20)`);await new Promise(r=>setTimeout(r,2000));} } app.listen(port,'0.0.0.0',()=>console.log(`Project Management listening on ${port}`)); }
if(require.main===module) start().catch(e=>{console.error(e);process.exit(1)});
module.exports=app;

