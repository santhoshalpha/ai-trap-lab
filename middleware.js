import { NextResponse } from 'next/server';

export function middleware(request) {
  // 1. Get the "Fingerprints"
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const path = request.nextUrl.pathname;

  // 2. Define the Bot Signatures we are looking for
  const bots = ['GPTBot', 'ChatGPT-User', 'Google-Extended', 'PerplexityBot', 'ClaudeBot'];
  
  // 3. Check if the visitor is a bot
  const isBot = bots.some(bot => userAgent.includes(bot));

  // 4. LOG IT! (This goes to Vercel Dashboard)
  // We use a special tag "🚨 AI-TRAP" so you can search for it easily
  if (isBot) {
    console.log(JSON.stringify({
      level: 'alert',
      message: '🚨 AI BOT DETECTED',
      bot_signature: isBot ? 'YES - MATCHED' : 'NO',
      path: path,
      user_agent: userAgent,
      timestamp: new Date().toISOString()
    }));
  } else {
    // Optional: Log humans too if you want to test with your own phone
    console.log(`[Human Visitor] Path: ${path} | UA: ${userAgent}`);
  }

  return NextResponse.next();
}

// Configure which paths to track (ignore images/css to save logs)
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};