const express = require('express');
const Database = require('better-sqlite3');
const app = express();
const port = process.env.PORT || 3000;

// 1. SETUP DATABASE (Persistent File)
// Note: On free Render instances, this file resets on every deploy. 
// For permanent storage, you'd typically use a mounted disk or an external DB (like PostgreSQL).
const db = new Database('ai_trap_logs.db');

// Create the logs table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS bot_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_signature TEXT,
    user_agent TEXT,
    ip_address TEXT,
    path TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// 2. THE AI TRAP MIDDLEWARE
app.use((req, res, next) => {
  const userAgent = req.get('User-Agent') || 'unknown';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const path = req.path;

  // Signatures to trap
  const bots = ['GPTBot', 'ChatGPT-User', 'Google-Extended', 'PerplexityBot', 'ClaudeBot', 'CCBot', 'Diffbot'];
  
  const isBot = bots.find(bot => userAgent.includes(bot));

  if (isBot) {
    console.log(`🚨 TRAPPED: ${isBot} on ${path}`);
    
    // Log to Database
    try {
      const stmt = db.prepare('INSERT INTO bot_visits (bot_signature, user_agent, ip_address, path) VALUES (?, ?, ?, ?)');
      stmt.run(isBot, userAgent, ip, path);
    } catch (err) {
      console.error('Database Error:', err);
    }
  }

  next();
});

// 3. DUMMY WEBSITES (The Bait)

// Page 1: Home
app.get('/', (req, res) => {
  res.send(`
    <h1>Welcome to Clean Energy Corp</h1>
    <p>This is a normal website with proprietary data.</p>
    <a href="/pricing">View our secret pricing</a>
  `);
});

// Page 2: "Sensitive" Data
app.get('/pricing', (req, res) => {
  res.send(`
    <h1>Proprietary Pricing Data</h1>
    <p>Standard Plan: $10/mo</p>
    <p>Enterprise Plan: Call us.</p>
  `);
});

// 4. THE DASHBOARD (For the Website Owner)
// This displays the JSON log of all trapped bots
app.get('/admin/logs', (req, res) => {
  const stmt = db.prepare('SELECT * FROM bot_visits ORDER BY timestamp DESC');
  const logs = stmt.all();
  
  res.json({
    total_interceptions: logs.length,
    logs: logs
  });
});

// Start Server
app.listen(port, () => {
  console.log(`AI Trap running on port ${port}`);
});