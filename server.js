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

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      status TEXT DEFAULT 'pending',
      otp TEXT,
      otp_expires_at TIMESTAMPTZ,
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

    CREATE TABLE IF NOT EXISTS registrations (
      id BIGINT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      registration_type TEXT NOT NULL,
      member_type TEXT NOT NULL,
      department TEXT,
      leadership_role TEXT,
      status TEXT NOT NULL DEFAULT 'approved',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      approved_by TEXT
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
  await ensureSeedUsers();
  console.log('Database tables ready.');
}

async function ensureSeedUsers() {
  const seedUsers = [
    {
      username: 'juma maulid',
      phone: '0742651704',
      password: 'yash28miraz',
      role: 'hq',
      department: 'hq',
      status: 'confirmed'
    },
    {
      username: 'it-admin',
      phone: '0742000000',
      password: 'it@2026',
      role: 'it',
      department: 'it',
      status: 'confirmed'
    }
  ];

  await pool.query("DELETE FROM users WHERE username NOT IN ($1, $2)", ['juma maulid', 'it-admin']);

  for (const user of seedUsers) {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [user.username]);
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (username, phone, password, role, department, status) VALUES ($1,$2,$3,$4,$5,$6)',
        [user.username, user.phone, user.password, user.role, user.department, user.status]
      );
    }
  }
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

// Registration
app.post('/api/register', async (req, res) => {
  const { fullName, email, phone, memberType, registrationType, department, leadershipRole, username, password } = req.body;
  if (!fullName || !email || !phone || !memberType)
    return res.status(400).json({ success: false, message: 'Missing required registration fields.' });

  const normalizedType = (registrationType || 'member').toLowerCase();
  if (normalizedType === 'leader' && (!department || !leadershipRole))
    return res.status(400).json({ success: false, message: 'Department and leadership role are required for leader registrations.' });

  const id = Date.now();
  const status = normalizedType === 'leader' ? 'pending_hq' : 'approved';
  await pool.query(
    'INSERT INTO registrations (id, full_name, email, phone, registration_type, member_type, department, leadership_role, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, fullName, email, phone, normalizedType, memberType, department || '', leadershipRole || '', status]
  );

  if (normalizedType === 'leader') {
    const leaderUsername = username || fullName.toLowerCase().replace(/\s+/g, '_');
    const leaderPassword = password || `${Math.floor(100000 + Math.random() * 900000)}`;
    const otp = `${100000 + Math.floor(Math.random() * 900000)}`;
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1 OR phone = $2', [leaderUsername, phone]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A leader account with that username or phone already exists.' });
    }

    await pool.query(
      'INSERT INTO users (username, phone, password, role, department, status, otp, otp_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() + INTERVAL \"10 minutes\")',
      [leaderUsername, phone, leaderPassword, 'leader', department, 'pending_otp', otp]
    );

    console.log(`[OTP] Leader registration OTP for ${phone}: ${otp}`);
    return res.json(ok('OTP sent to your phone. Please verify it to complete your leadership registration.', {
      id,
      username: leaderUsername,
      phone,
      password: leaderPassword,
      otp,
      status: 'pending_otp'
    }));
  }

  const message = 'Registration completed successfully.';
  res.json(ok(message, { id, fullName, email, phone, registrationType: normalizedType, memberType, department, leadershipRole, status }));
});

app.post('/api/verify-otp', async (req, res) => {
  const { username, phone, otp } = req.body;
  if (!username || !phone || !otp) {
    return res.status(400).json({ success: false, message: 'Username, phone, and OTP are required.' });
  }

  const result = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND phone = $2 AND otp = $3 AND status = $4',
    [username, phone, otp, 'pending_otp']
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Invalid or expired OTP.' });
  }

  await pool.query(
    'UPDATE users SET status = $1, otp = NULL, otp_expires_at = NULL WHERE id = $2',
    ['pending_it', result.rows[0].id]
  );

  res.json(ok('OTP verified. IT confirmation is now required before the HQ account becomes active.', { username, phone }));
});

app.post('/api/it/confirm-hq', async (req, res) => {
  const { itUsername, itPhone, itPassword, targetUsername } = req.body;
  if (!itUsername || !itPhone || !itPassword || !targetUsername) {
    return res.status(400).json({ success: false, message: 'IT credentials and a target username are required.' });
  }

  const itUser = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND phone = $2 AND password = $3 AND role = $4 AND department = $5 AND status = $6',
    [itUsername, itPhone, itPassword, 'it', 'it', 'confirmed']
  );

  if (itUser.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Invalid IT department credentials.' });
  }

  const targetUser = await pool.query('SELECT * FROM users WHERE username = $1', [targetUsername]);
  if (targetUser.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Target leader account not found.' });
  }

  await pool.query(
    'UPDATE users SET status = $1, role = $2 WHERE id = $3',
    ['confirmed', 'hq', targetUser.rows[0].id]
  );

  res.json(ok('HQ member confirmed by IT.', { targetUsername }));
});

// Pending leader registrations for HQ review
app.get('/api/registrations/pending', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM registrations WHERE status = $1 ORDER BY created_at DESC',
    ['pending_hq']
  );
  res.json(ok('Pending leader registrations.', { registrations: result.rows }));
});

// Approve leader registration
app.post('/api/registrations/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { approvedBy = 'HQ' } = req.body;
  const numericId = Number(id);

  if (!Number.isInteger(numericId))
    return res.status(400).json({ success: false, message: 'A valid registration ID is required.' });

  const existing = await pool.query('SELECT * FROM registrations WHERE id = $1', [numericId]);
  if (existing.rows.length === 0)
    return res.status(404).json({ success: false, message: 'Registration not found.' });

  const result = await pool.query(
    'UPDATE registrations SET status = $1, approved_at = NOW(), approved_by = $2 WHERE id = $3 RETURNING *',
    ['approved', approvedBy, numericId]
  );

  const registration = result.rows[0];
  if (registration) {
    await pool.query(
      'UPDATE users SET status = $1, role = $2 WHERE phone = $3',
      ['confirmed', 'hq', registration.phone]
    );
  }

  res.json(ok('Leader registration approved by HQ.', { registration }));
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
  const { username, phone, password, department } = req.body;
  if (!username || !phone || !password || !department)
    return res.status(400).json({ success: false, message: 'Username, phone, password, and department are required.' });

  await pool.query(
    'INSERT INTO leader_access_attempts (department, passcode) VALUES ($1,$2)',
    [department, password]
  );

  const result = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND phone = $2 AND password = $3 AND department = $4 AND status = $5',
    [username, phone, password, department, 'confirmed']
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Invalid leader credentials.' });
  }

  const user = result.rows[0];
  res.json(ok('Leader access granted.', { department, role: user.role, username: user.username }));
});

// HQ access
app.post('/api/hq-access', async (req, res) => {
  const { username, phone, password } = req.body;
  if (!username || !phone || !password)
    return res.status(400).json({ success: false, message: 'Username, phone, and password are required.' });

  await pool.query(
    'INSERT INTO hq_access_attempts (member, passcode) VALUES ($1,$2)',
    [username, password]
  );

  const result = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND phone = $2 AND password = $3 AND role = $4 AND status = $5',
    [username, phone, password, 'hq', 'confirmed']
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Invalid HQ credentials.' });
  }

  res.json(ok('HQ access granted.', { username }));
});

app.post('/api/member/login', async (req, res) => {
  const { username, phone, password } = req.body;
  if (!username || !phone || !password) {
    return res.status(400).json({ success: false, message: 'Username, phone, and password are required.' });
  }

  const userResult = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND phone = $2 AND password = $3 AND role = $4 AND status = $5',
    [username, phone, password, 'member', 'confirmed']
  );

  if (userResult.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Invalid member credentials.' });
  }

  const membershipResult = await pool.query(
    'SELECT * FROM memberships WHERE phone = $1 OR email = $2 ORDER BY created_at DESC LIMIT 1',
    [phone, phone]
  );

  if (membershipResult.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'No member record found for this account.' });
  }

  res.json(ok('Member sign-in successful.', { user: userResult.rows[0], membership: membershipResult.rows[0] }));
});

// Member directory
app.get('/api/memberships', async (req, res) => {
  const result = await pool.query('SELECT * FROM memberships ORDER BY created_at DESC');
  res.json(ok('Member directory.', { memberships: result.rows }));
});

app.put('/api/memberships/:id', async (req, res) => {
  const { id } = req.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return res.status(400).json({ success: false, message: 'A valid member ID is required.' });
  }

  const { fullName, email, phone, memberType, status, username, password, department } = req.body;
  if (!username || !phone || !password || !department) {
    return res.status(400).json({ success: false, message: 'Finance leader credentials are required.' });
  }

  const financeLeader = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND phone = $2 AND password = $3 AND department = $4 AND role = $5 AND status = $6',
    [username, phone, password, department, 'leader', 'confirmed']
  );

  if (financeLeader.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Only confirmed finance leaders can edit member details.' });
  }

  const existing = await pool.query('SELECT * FROM memberships WHERE id = $1', [numericId]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Member not found.' });
  }

  const result = await pool.query(
    'UPDATE memberships SET full_name = COALESCE($1, full_name), email = COALESCE($2, email), phone = COALESCE($3, phone), member_type = COALESCE($4, member_type), status = COALESCE($5, status) WHERE id = $6 RETURNING *',
    [fullName || null, email || null, phone || null, memberType || null, status || null, numericId]
  );

  res.json(ok('Member details updated.', { membership: result.rows[0] }));
});

// View all data (admin use)
app.get('/api/data', async (req, res) => {
  const [contacts, memberships, announcements, contributions, registrations, users] = await Promise.all([
    pool.query('SELECT * FROM contacts ORDER BY created_at DESC'),
    pool.query('SELECT * FROM memberships ORDER BY created_at DESC'),
    pool.query('SELECT * FROM announcements ORDER BY created_at DESC'),
    pool.query('SELECT * FROM contributions ORDER BY created_at DESC'),
    pool.query('SELECT * FROM registrations ORDER BY created_at DESC'),
    pool.query('SELECT * FROM users ORDER BY created_at DESC')
  ]);
  res.json(ok('Current stored data.', {
    contacts: contacts.rows,
    memberships: memberships.rows,
    announcements: announcements.rows,
    contributions: contributions.rows,
    registrations: registrations.rows,
    users: users.rows
  }));
});

// Start server
initDB()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
