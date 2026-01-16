export default async (request, context) => {
  // 1. Get the "Fingerprints"
  const userAgent = request.headers.get("user-agent") || "unknown";
  const path = new URL(request.url).pathname;

  // 2. The Wanted List (Bot Signatures)
  const bots = ["GPTBot", "ChatGPT-User", "Google-Extended", "PerplexityBot", "ClaudeBot"];
  const isBot = bots.some(bot => userAgent.includes(bot));

  // 3. LOG IT! (This goes to your Netlify Function Logs)
  if (isBot) {
    console.log(JSON.stringify({
      level: "ALERT",
      msg: "🚨 AI BOT DETECTED",
      bot: isBot ? "YES" : "NO",
      path: path,
      ua: userAgent,
      time: new Date().toISOString()
    }));
  } else {
    // Optional: Log humans too for testing
    console.log(`[Human Visitor] ${path} | ${userAgent}`);
  }

  return context.next();
};

// 4. Configure to run on ALL pages
export const config = { path: "/*" };