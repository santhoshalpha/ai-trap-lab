const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 10000;

// ===== SUPABASE CONFIG =====
// We use environment variables so your keys aren't exposed in the code
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(cors()); // vital for separate deployment

// ===== THE WANTED LIST (AI BOTS) =====
const AI_BOTS = {
  'GPTBot': 'OpenAI GPT',
  'ChatGPT-User': 'ChatGPT',
  'ClaudeBot': 'Anthropic Claude',
  'claude-web': 'Anthropic Claude',
  'PerplexityBot': 'Perplexity AI',
  'CCBot': 'Common Crawl',
  'Diffbot': 'Diffbot',
  'FacebookBot': 'Meta AI',
  'Google-Extended': 'Google Gemini/Bard',
  'Amazonbot': 'Amazon Alexa'
};

// ===== API: REGISTER A NEW WEBSITE =====
app.post('/api/websites', async (req, res) => {
  const { id, name, url, api_key } = req.body;
  const { data, error } = await supabase
    .from('websites')
    .insert({ id, name, url, api_key })
    .select();
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Website Registered", data });
});

// ===== API: THE TRAP (Records Visits) =====
app.post('/api/track', async (req, res) => {
  const { website_id, api_key, user_agent, path } = req.body;

  // 1. Verify the Website
  const { data: site } = await supabase
    .from('websites')
    .select('id')
    .eq('id', website_id)
    .eq('api_key', api_key)
    .single();

  if (!site) return res.status(401).json({ error: "Invalid Credentials" });

  // 2. Detect Bot
  const detectedBotKey = Object.keys(AI_BOTS).find(bot => 
    user_agent && user_agent.includes(bot)
  );

  if (detectedBotKey) {
    const botName = AI_BOTS[detectedBotKey];
    console.log(`🚨 TRAP ACTIVATED: ${botName} visited ${path}`);

    // 3. Log to Database
    await supabase.from('bot_visits').insert({
      website_id,
      bot_signature: botName,
      user_agent,
      path
    });
  }

  res.json({ success: true });
});

// ===== API: VIEW LOGS =====
app.get('/api/logs', async (req, res) => {
  const { website_id } = req.query;
  const { data } = await supabase
    .from('bot_visits')
    .select('*')
    .eq('website_id', website_id)
    .order('timestamp', { ascending: false });
  
  res.json(data);
});

app.listen(port, () => console.log(`Backend running on port ${port}`));