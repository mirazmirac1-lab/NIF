const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection — Railway injects DATABASE_URL automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create tables on startup if they don't exist
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id BIGINT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id BIGINT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      member_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id BIGINT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contributions (
      id BIGINT PRIMARY KEY,
      contributor_name TEXT NOT NULL,
      member_id TEXT NOT NULL,
      contribution_type TEXT NOT NULL,
      contribution_amount TEXT NOT NULL,
      control_number TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leader_access_attempts (
      id SERIAL PRIMARY KEY,
      department TEXT NOT NULL,
      passcode TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hq_access_attempts (
      id SERIAL PRIMARY KEY,
      member TEXT NOT NULL,
      passcode TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Database tables ready.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Block sensitive files
app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/backendData.json'];
  if (blocked.includes(req.path)) return res.status(404).end();
  next();
});

app.use(express.static(__dirname));

function ok(message, payload = null) {
  return { success: true, message, payload };
}

// Redirect root to home page
app.get('/', (req, res) => res.redirect('/nif2.html'));

// Health check
app.get('/api/status', (req, res) => res.json(ok('Backend is running.')));

// Contact
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email || !message)
    return res.status(400).json({ success: false, message: 'Missing required contact fields.' });

  const id = Date.now();
  await pool.query(
    'INSERT INTO contacts (id, name, email, phone, message) VALUES ($1,$2,$3,$4,$5)',
    [id, name, email, phone || '', message]
  );
  res.json(ok('Contact submission received.', { id, name, email, phone, message }));
});

// Membership
app.post('/api/membership', async (req, res) => {
  const { fullName, email, phone, memberType } = req.body;
  if (!fullName || !email || !phone || !memberType)
    return res.status(400).json({ success: false, message: 'Missing required membership fields.' });

  const id = Date.now();
  await pool.query(
    'INSERT INTO memberships (id, full_name, email, phone, member_type) VALUES ($1,$2,$3,$4,$5)',
    [id, fullName, email, phone, memberType]
  );
  res.json(ok('Membership request submitted.', { id, fullName, email, phone, memberType, status: 'pending' }));
});

// Announcement
app.post('/api/announcement', async (req, res) => {
  const { title, content, author } = req.body;
  if (!title || !content || !author)
    return res.status(400).json({ success: false, message: 'Missing required announcement fields.' });

  const id = Date.now();
  await pool.query(
    'INSERT INTO announcements (id, title, content, author) VALUES ($1,$2,$3,$4)',
    [id, title, content, author]
  );
  res.json(ok('Announcement posted.', { id, title, content, author }));
});

// Contribution
app.post('/api/contribution', async (req, res) => {
  const { contributorName, memberId, contributionType, contributionAmount } = req.body;
  if (!contributorName || !memberId || !contributionType || !contributionAmount)
    return res.status(400).json({ success: false, message: 'Missing required contribution fields.' });

  const id = Date.now();
  const controlNumber = `CN-${id}-${Math.floor(1000 + Math.random() * 9000)}`;
  await pool.query(
    'INSERT INTO contributions (id, contributor_name, member_id, contribution_type, contribution_amount, control_number) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, contributorName, memberId, contributionType, contributionAmount, controlNumber]
  );
  res.json(ok('Contribution created.', { id, contributorName, memberId, contributionType, contributionAmount, controlNumber }));
});

// Verify contribution
app.post('/api/verify', async (req, res) => {
  const { controlNumber } = req.body;
  if (!controlNumber)
    return res.status(400).json({ success: false, message: 'Control number is required.' });

  const result = await pool.query(
    'SELECT * FROM contributions WHERE control_number = $1',
    [controlNumber]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ success: false, message: 'Contribution not found.' });

  res.json(ok('Contribution found.', result.rows[0]));
});

// Leader access
app.post('/api/leader-access', async (req, res) => {
  const { department, passcode } = req.body;
  if (!department || !passcode)
    return res.status(400).json({ success: false, message: 'Department and passcode are required.' });

  const passcodes = {
    finance: 'finance2026',
    information: 'infocom2026',
    education: 'education2026',
    charity: 'charity2026',
    hq: 'hqmaster2026'
  };

  await pool.query(
    'INSERT INTO leader_access_attempts (department, passcode) VALUES ($1,$2)',
    [department, passcode]
  );

  if (passcodes[department] && passcodes[department] === passcode) {
    res.json(ok('Leader access granted.', { department }));
  } else {
    res.status(401).json({ success: false, message: 'Invalid leader passcode.' });
  }
});

// HQ access
app.post('/api/hq-access', async (req, res) => {
  const { member, passcode } = req.body;
  if (!member || !passcode)
    return res.status(400).json({ success: false, message: 'Member and passcode are required.' });

  const passcodes = {
    chairperson: 'chair2026',
    secretary: 'secretary2026',
    treasurer: 'treasury2026'
  };

  await pool.query(
    'INSERT INTO hq_access_attempts (member, passcode) VALUES ($1,$2)',
    [member, passcode]
  );

  if (passcodes[member] && passcodes[member] === passcode) {
    res.json(ok('HQ access granted.', { member }));
  } else {
    res.status(401).json({ success: false, message: 'Invalid HQ passcode.' });
  }
});

// View all data (admin use)
app.get('/api/data', async (req, res) => {
  const [contacts, memberships, announcements, contributions] = await Promise.all([
    pool.query('SELECT * FROM contacts ORDER BY created_at DESC'),
    pool.query('SELECT * FROM memberships ORDER BY created_at DESC'),
    pool.query('SELECT * FROM announcements ORDER BY created_at DESC'),
    pool.query('SELECT * FROM contributions ORDER BY created_at DESC')
  ]);
  res.json(ok('Current stored data.', {
    contacts: contacts.rows,
    memberships: memberships.rows,
    announcements: announcements.rows,
    contributions: contributions.rows
  }));
});

// Start server
initDB()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
