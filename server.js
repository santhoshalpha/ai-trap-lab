const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 10000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());
app.use(cors());

// The AI Bot List
const AI_BOTS = {
  'GPTBot': 'OpenAI GPT',
  'ChatGPT-User': 'ChatGPT',
  'ClaudeBot': 'Anthropic Claude',
  'claude-web': 'Anthropic Claude',
  'PerplexityBot': 'Perplexity AI',
  'CCBot': 'Common Crawl',
  'Diffbot': 'Diffbot',
  'FacebookBot': 'Meta AI',
  'Google-Extended': 'Google Gemini',
  'Amazonbot': 'Amazon Alexa'
};

// ... (Keep your existing POST /api/websites and POST /api/track endpoints here) ...
app.post('/api/websites', async (req, res) => {
    const { id, name, url, api_key } = req.body;
    const { data, error } = await supabase.from('websites').insert({ id, name, url, api_key }).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Website Registered", data });
});

app.post('/api/track', async (req, res) => {
    // ... (Your existing code) ...
    // You can copy the code from your previous version or leave it as is if you want to keep JS tracking too
    res.json({ status: "ok" });
});

// 👇👇👇 NEW: THE PIXEL TRAP 👇👇👇
app.get('/api/pixel', async (req, res) => {
    const { website_id, user_agent, path } = req.query;
    
    // 1. Detect Bot from User-Agent (Header or Query Param)
    const agent = user_agent || req.headers['user-agent'];
    
    const detectedBotKey = Object.keys(AI_BOTS).find(bot => 
        agent && agent.includes(bot)
    );

    if (detectedBotKey) {
        const botName = AI_BOTS[detectedBotKey];
        console.log(`🚨 PIXEL TRAP: ${botName} caught on ${path}`);

        // 2. Log to Supabase
        await supabase.from('bot_visits').insert({
            website_id: website_id,
            bot_signature: botName,
            user_agent: agent,
            path: path
        });
    }

    // 3. Return a 1x1 transparent GIF (so the browser/bot doesn't show a broken image icon)
    const img = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': img.length
    });
    res.end(img);
});

// Analytics Endpoint
app.get('/api/logs', async (req, res) => {
    const { website_id } = req.query;
    const { data } = await supabase.from('bot_visits').select('*').eq('website_id', website_id).order('timestamp', { ascending: false });
    res.json(data);
});

app.listen(port, () => console.log(`Backend running on port ${port}`));