const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL,
      email VARCHAR(180) UNIQUE NOT NULL, role VARCHAR(80) NOT NULL DEFAULT 'Developer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY, name VARCHAR(160) NOT NULL,
      description TEXT NOT NULL DEFAULT '', status VARCHAR(30) NOT NULL DEFAULT 'Planning'
        CHECK (status IN ('Planning','Active','Completed','On Hold')),
      start_date DATE, end_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL DEFAULT '', status VARCHAR(30) NOT NULL DEFAULT 'To Do'
        CHECK (status IN ('To Do','In Progress','Done')),
      priority VARCHAR(20) NOT NULL DEFAULT 'Medium'
        CHECK (priority IN ('Low','Medium','High')),
      due_date DATE, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  `);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM projects');
  if (!rows[0].count) {
    await pool.query(`
      INSERT INTO members(name,email,role) VALUES
        ('Nguyễn Minh An','an@example.com','Project Manager'),
        ('Trần Thu Hà','ha@example.com','Developer'),
        ('Lê Quốc Huy','huy@example.com','Tester');
      INSERT INTO projects(name,description,status,start_date,end_date) VALUES
        ('Website bán hàng','Xây dựng website thương mại điện tử','Active',CURRENT_DATE,CURRENT_DATE+60),
        ('Ứng dụng nội bộ','Số hóa quy trình quản lý','Planning',CURRENT_DATE,CURRENT_DATE+90);
      INSERT INTO tasks(title,status,priority,due_date,project_id,assignee_id) VALUES
        ('Thiết kế cơ sở dữ liệu','Done','High',CURRENT_DATE+3,1,2),
        ('Xây dựng API sản phẩm','In Progress','High',CURRENT_DATE+10,1,2),
        ('Viết test case','To Do','Medium',CURRENT_DATE+14,1,3);
    `);
  }
}

module.exports = { pool, initDb };

