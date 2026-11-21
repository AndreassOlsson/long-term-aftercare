import type { NextRequest } from "next/server";

// The site is closed. Every request is answered here, before any page, action
// or API route runs, so nothing can reach the Anthropic key or the Blob store.
// To open it again, set the environment variable SITE_OPEN=1 in Vercel and
// redeploy; nothing else in the app was changed.

const CLOSED_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Long-term aftercare</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #f6f7f8; color: #17212b;
         font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 .75rem; }
  p { margin: 0; color: #5b6875; line-height: 1.5; }
</style>
</head>
<body>
<main>
  <h1>Closed for now</h1>
  <p>Long-term aftercare was a hackathon demo, built in a day in November 2026. The demo is over and the site is switched off.</p>
</main>
</body>
</html>`;

export function proxy(request: NextRequest) {
  if (process.env.SITE_OPEN === "1") return;
  const { pathname, search } = request.nextUrl;
  // The plain health check stays readable; its storage test writes, so not that.
  if (pathname === "/api/health" && search === "") return;
  return new Response(CLOSED_PAGE, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = { matcher: "/:path*" };
