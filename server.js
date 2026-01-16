const express = require('express');
const Database = require('better-sqlite3');
const app = express();
const port = process.env.PORT || 3000;

// Database Setup
const db = new Database('ai_trap_logs.db');

// Create tables
db.prepare(`
  CREATE TABLE IF NOT EXISTS bot_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id TEXT,
    bot_signature TEXT,
    user_agent TEXT,
    ip_address TEXT,
    path TEXT,
    referrer TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Create websites table for tracking multiple sites
db.prepare(`
  CREATE TABLE IF NOT EXISTS websites (
    id TEXT PRIMARY KEY,
    name TEXT,
    url TEXT,
    api_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

app.use(express.json());
app.use(express.static('public'));

// AI Bot Detection
const AI_BOTS = {
  'GPTBot': 'OpenAI GPT',
  'ChatGPT-User': 'ChatGPT',
  'Google-Extended': 'Google Bard/Gemini',
  'PerplexityBot': 'Perplexity AI',
  'ClaudeBot': 'Anthropic Claude',
  'claude-web': 'Anthropic Claude',
  'CCBot': 'Common Crawl',
  'Diffbot': 'Diffbot',
  'anthropic-ai': 'Anthropic Claude',
  'Bytespider': 'ByteDance AI',
  'Applebot-Extended': 'Apple Intelligence',
  'cohere-ai': 'Cohere AI',
  'YouBot': 'You.com AI'
};

// ===== TRACKING ENDPOINT =====
// This endpoint receives tracking data from your website
app.post('/api/track', (req, res) => {
  const { website_id, api_key, user_agent, ip, path, referrer } = req.body;

  // Validate API key (basic auth)
  const website = db.prepare('SELECT * FROM websites WHERE id = ? AND api_key = ?')
    .get(website_id, api_key);

  if (!website) {
    return res.status(401).json({ error: 'Invalid website_id or api_key' });
  }

  // Check if it's a bot
  const detectedBot = Object.keys(AI_BOTS).find(bot => 
    user_agent.toLowerCase().includes(bot.toLowerCase())
  );

  if (detectedBot) {
    try {
      const stmt = db.prepare(`
        INSERT INTO bot_visits (website_id, bot_signature, user_agent, ip_address, path, referrer) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(website_id, detectedBot, user_agent, ip, path, referrer);
      
      console.log(`🚨 Tracked: ${AI_BOTS[detectedBot]} on ${website.name}${path}`);
      
      return res.json({ tracked: true, bot: AI_BOTS[detectedBot] });
    } catch (err) {
      console.error('Database Error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  res.json({ tracked: false });
});

// ===== WEBSITE MANAGEMENT =====

// Register a new website
app.post('/api/websites/register', (req, res) => {
  const { name, url } = req.body;
  const id = name.toLowerCase().replace(/\s+/g, '-');
  const api_key = Math.random().toString(36).substring(2, 15) + 
                  Math.random().toString(36).substring(2, 15);

  try {
    const stmt = db.prepare(`
      INSERT INTO websites (id, name, url, api_key) 
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, name, url, api_key);

    res.json({ 
      success: true,
      website_id: id,
      api_key: api_key,
      tracking_code: generateTrackingCode(id, api_key)
    });
  } catch (err) {
    res.status(400).json({ error: 'Website already registered or invalid data' });
  }
});

// List all websites
app.get('/api/websites', (req, res) => {
  const websites = db.prepare('SELECT id, name, url, created_at FROM websites').all();
  res.json({ websites });
});

// ===== ANALYTICS ENDPOINTS =====

app.get('/api/analytics/summary', (req, res) => {
  const website_id = req.query.website_id;
  
  let whereClause = '';
  let params = [];
  
  if (website_id) {
    whereClause = 'WHERE website_id = ?';
    params = [website_id];
  }

  const totalVisits = db.prepare(`SELECT COUNT(*) as count FROM bot_visits ${whereClause}`)
    .get(...params);
  
  const botBreakdown = db.prepare(`
    SELECT 
      bot_signature,
      COUNT(*) as count,
      COUNT(DISTINCT ip_address) as unique_ips
    FROM bot_visits 
    ${whereClause}
    GROUP BY bot_signature 
    ORDER BY count DESC
  `).all(...params);

  const pageBreakdown = db.prepare(`
    SELECT 
      path,
      COUNT(*) as count
    FROM bot_visits 
    ${whereClause}
    GROUP BY path 
    ORDER BY count DESC
    LIMIT 20
  `).all(...params);

  const recentActivity = db.prepare(`
    SELECT 
      DATE(timestamp) as date,
      COUNT(*) as count
    FROM bot_visits 
    ${whereClause ? whereClause + ' AND' : 'WHERE'} timestamp >= datetime('now', '-30 days')
    GROUP BY DATE(timestamp)
    ORDER BY date DESC
  `).all(...params);

  res.json({
    total_visits: totalVisits.count,
    bot_breakdown: botBreakdown.map(b => ({
      bot: AI_BOTS[b.bot_signature] || b.bot_signature,
      signature: b.bot_signature,
      visits: b.count,
      unique_ips: b.unique_ips
    })),
    page_breakdown: pageBreakdown,
    recent_activity: recentActivity
  });
});

app.get('/api/logs', (req, res) => {
  const website_id = req.query.website_id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  let whereClause = '';
  let params = [limit, offset];
  
  if (website_id) {
    whereClause = 'WHERE website_id = ?';
    params = [website_id, limit, offset];
  }

  const stmt = db.prepare(`
    SELECT bv.*, w.name as website_name
    FROM bot_visits bv
    LEFT JOIN websites w ON bv.website_id = w.id
    ${whereClause}
    ORDER BY timestamp DESC 
    LIMIT ? OFFSET ?
  `);
  const logs = stmt.all(...params);

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM bot_visits ${whereClause}`);
  const { total } = website_id ? countStmt.get(website_id) : countStmt.get();

  res.json({
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    logs: logs.map(log => ({
      ...log,
      bot_name: AI_BOTS[log.bot_signature] || log.bot_signature
    }))
  });
});

// ===== DASHBOARD =====

app.get('/admin/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Crawler Analytics Dashboard</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #f5f7fa;
          padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        header { 
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }
        h1 { color: #2c3e50; margin-bottom: 10px; }
        h2 { color: #2c3e50; margin-bottom: 20px; }
        .subtitle { color: #7f8c8d; margin-bottom: 20px; }
        .website-selector {
          margin-top: 20px;
        }
        select {
          padding: 10px 15px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 14px;
          min-width: 250px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: white;
          padding: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-value { 
          font-size: 36px; 
          font-weight: bold; 
          color: #3498db;
          margin: 10px 0;
        }
        .stat-label { 
          color: #7f8c8d; 
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .chart-container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: white;
        }
        th, td {
          padding: 15px;
          text-align: left;
          border-bottom: 1px solid #ecf0f1;
        }
        th {
          background: #f8f9fa;
          font-weight: 600;
          color: #2c3e50;
        }
        tr:hover { background: #f8f9fa; }
        .bot-badge {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 600;
        }
        .badge-gpt { background: #10a37f; color: white; }
        .badge-claude { background: #cc785c; color: white; }
        .badge-perplexity { background: #1fb8cd; color: white; }
        .badge-google { background: #4285f4; color: white; }
        .badge-other { background: #95a5a6; color: white; }
        .loading { text-align: center; padding: 50px; color: #7f8c8d; }
        .btn {
          background: #3498db;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          margin-right: 10px;
        }
        .btn:hover { background: #2980b9; }
        .btn-success { background: #2ecc71; }
        .btn-success:hover { background: #27ae60; }
        .setup-section {
          background: #fff3cd;
          border: 1px solid #ffc107;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 30px;
        }
        .code-block {
          background: #2c3e50;
          color: #ecf0f1;
          padding: 15px;
          border-radius: 5px;
          overflow-x: auto;
          margin-top: 10px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>🤖 AI Crawler Analytics Dashboard</h1>
          <p class="subtitle">Monitor AI bot activity across your websites</p>
          
          <div class="website-selector">
            <label for="websiteSelect"><strong>Select Website:</strong></label>
            <select id="websiteSelect" onchange="loadData()">
              <option value="">All Websites</option>
            </select>
            <button class="btn btn-success" onclick="showSetup()">+ Add New Website</button>
            <button class="btn" onclick="loadData()">↻ Refresh</button>
          </div>
        </header>

        <div id="setupSection" class="setup-section" style="display: none;">
          <h2>📋 Setup New Website</h2>
          <p style="margin-bottom: 15px;">Add tracking to your website in 3 simple steps:</p>
          
          <div style="margin-bottom: 20px;">
            <label><strong>Website Name:</strong></label><br>
            <input type="text" id="siteName" placeholder="My Awesome Site" style="padding: 10px; width: 100%; max-width: 400px; margin-top: 5px;">
          </div>
          
          <div style="margin-bottom: 20px;">
            <label><strong>Website URL:</strong></label><br>
            <input type="text" id="siteUrl" placeholder="https://mysite.com" style="padding: 10px; width: 100%; max-width: 400px; margin-top: 5px;">
          </div>
          
          <button class="btn btn-success" onclick="registerWebsite()">Generate Tracking Code</button>
          <button class="btn" onclick="document.getElementById('setupSection').style.display='none'">Cancel</button>
          
          <div id="trackingCode" style="display: none; margin-top: 20px;">
            <h3>✅ Website Registered!</h3>
            <p>Add this code to your website (before closing &lt;/body&gt; tag):</p>
            <div class="code-block" id="codeSnippet"></div>
            <p style="margin-top: 10px;"><strong>Save these credentials:</strong></p>
            <div id="credentials" style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-top: 10px;"></div>
          </div>
        </div>

        <div class="stats-grid" id="statsGrid">
          <div class="loading">Loading statistics...</div>
        </div>

        <div class="chart-container">
          <h2>Bot Activity Breakdown</h2>
          <div id="botChart"></div>
        </div>

        <div class="chart-container">
          <h2>Most Visited Pages</h2>
          <div id="pageChart"></div>
        </div>

        <div class="chart-container">
          <h2>Recent Activity (Last 30 Days)</h2>
          <div id="timelineChart"></div>
        </div>

        <div class="chart-container">
          <h2>Latest Crawler Visits</h2>
          <table id="logsTable">
            <thead>
              <tr>
                <th>Time</th>
                <th>Website</th>
                <th>Bot</th>
                <th>Page</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="5" class="loading">Loading logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <script>
        function getBotBadgeClass(signature) {
          if (signature.includes('GPT') || signature.includes('ChatGPT')) return 'badge-gpt';
          if (signature.includes('Claude')) return 'badge-claude';
          if (signature.includes('Perplexity')) return 'badge-perplexity';
          if (signature.includes('Google')) return 'badge-google';
          return 'badge-other';
        }

        async function loadWebsites() {
          const res = await fetch('/api/websites');
          const data = await res.json();
          
          const select = document.getElementById('websiteSelect');
          select.innerHTML = '<option value="">All Websites</option>';
          
          data.websites.forEach(site => {
            const option = document.createElement('option');
            option.value = site.id;
            option.textContent = site.name;
            select.appendChild(option);
          });
        }

        async function loadData() {
          const websiteId = document.getElementById('websiteSelect').value;
          const params = websiteId ? \`?website_id=\${websiteId}\` : '';
          
          try {
            const summaryRes = await fetch(\`/api/analytics/summary\${params}\`);
            const summary = await summaryRes.json();

            const statsHtml = \`
              <div class="stat-card">
                <div class="stat-label">Total Visits</div>
                <div class="stat-value">\${summary.total_visits.toLocaleString()}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Unique Bots</div>
                <div class="stat-value">\${summary.bot_breakdown.length}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Pages Crawled</div>
                <div class="stat-value">\${summary.page_breakdown.length}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Most Active Bot</div>
                <div class="stat-value" style="font-size: 20px;">
                  \${summary.bot_breakdown[0]?.bot || 'N/A'}
                </div>
              </div>
            \`;
            document.getElementById('statsGrid').innerHTML = statsHtml;

            const botChartHtml = summary.bot_breakdown.map(b => \`
              <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span><strong>\${b.bot}</strong></span>
                  <span>\${b.visits} visits (\${b.unique_ips} unique IPs)</span>
                </div>
                <div style="background: #ecf0f1; border-radius: 5px; height: 10px;">
                  <div style="background: #3498db; width: \${(b.visits / summary.total_visits * 100)}%; height: 100%; border-radius: 5px;"></div>
                </div>
              </div>
            \`).join('');
            document.getElementById('botChart').innerHTML = botChartHtml || '<p>No bot activity yet</p>';

            const pageChartHtml = summary.page_breakdown.slice(0, 10).map(p => \`
              <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span><strong>\${p.path}</strong></span>
                  <span>\${p.count} visits</span>
                </div>
                <div style="background: #ecf0f1; border-radius: 5px; height: 10px;">
                  <div style="background: #2ecc71; width: \${(p.count / summary.total_visits * 100)}%; height: 100%; border-radius: 5px;"></div>
                </div>
              </div>
            \`).join('');
            document.getElementById('pageChart').innerHTML = pageChartHtml || '<p>No page visits yet</p>';

            const timelineHtml = summary.recent_activity.reverse().map(d => \`
              <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span>\${d.date}</span>
                  <span>\${d.count} visits</span>
                </div>
                <div style="background: #ecf0f1; border-radius: 5px; height: 8px;">
                  <div style="background: #e74c3c; width: \${Math.min(100, d.count * 10)}%; height: 100%; border-radius: 5px;"></div>
                </div>
              </div>
            \`).join('');
            document.getElementById('timelineChart').innerHTML = timelineHtml || '<p>No recent activity</p>';

            const logsRes = await fetch(\`/api/logs?limit=20\${params.replace('?', '&')}\`);
            const logs = await logsRes.json();

            const logsHtml = logs.logs.map(log => \`
              <tr>
                <td>\${new Date(log.timestamp).toLocaleString()}</td>
                <td>\${log.website_name || log.website_id}</td>
                <td><span class="bot-badge \${getBotBadgeClass(log.bot_signature)}">\${log.bot_name}</span></td>
                <td>\${log.path}</td>
                <td>\${log.ip_address}</td>
              </tr>
            \`).join('');
            document.querySelector('#logsTable tbody').innerHTML = logsHtml || '<tr><td colspan="5">No visits yet</td></tr>';

          } catch (error) {
            console.error('Error loading data:', error);
          }
        }

        function showSetup() {
          document.getElementById('setupSection').style.display = 'block';
          document.getElementById('trackingCode').style.display = 'none';
        }

        async function registerWebsite() {
          const name = document.getElementById('siteName').value;
          const url = document.getElementById('siteUrl').value;

          if (!name || !url) {
            alert('Please fill in both fields');
            return;
          }

          const res = await fetch('/api/websites/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, url })
          });

          const data = await res.json();

          if (data.success) {
            document.getElementById('codeSnippet').textContent = data.tracking_code;
            document.getElementById('credentials').innerHTML = \`
              <strong>Website ID:</strong> \${data.website_id}<br>
              <strong>API Key:</strong> \${data.api_key}
            \`;
            document.getElementById('trackingCode').style.display = 'block';
            loadWebsites();
          } else {
            alert('Error: ' + data.error);
          }
        }

        loadWebsites();
        loadData();
        setInterval(loadData, 30000);
      </script>
    </body>
    </html>
  `);
});

// Helper function to generate tracking code
function generateTrackingCode(website_id, api_key) {
  const analyticsUrl = process.env.ANALYTICS_URL || 'http://localhost:3000';
  
  return `<script>
  (function() {
    const websiteId = '${website_id}';
    const apiKey = '${api_key}';
    const analyticsUrl = '${analyticsUrl}';
    
    function trackVisit() {
      const data = {
        website_id: websiteId,
        api_key: apiKey,
        user_agent: navigator.userAgent,
        ip: '', // IP will be captured server-side
        path: window.location.pathname,
        referrer: document.referrer
      };
      
      fetch(analyticsUrl + '/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(err => console.log('Analytics tracking failed:', err));
    }
    
    // Track on page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', trackVisit);
    } else {
      trackVisit();
    }
  })();
</script>`;
}

// Start Server
app.listen(port, () => {
  console.log(`🚀 AI Crawler Analytics running on port ${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/admin/dashboard`);
  console.log(`🔧 To monitor your Render site, register it in the dashboard!`);
});