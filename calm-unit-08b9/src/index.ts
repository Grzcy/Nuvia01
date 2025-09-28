// Cloudflare Worker: Nuvia share + embed + oEmbed endpoints
import { neon } from '@neondatabase/serverless';
// - /share/:id -> SEO/OG/Twitter meta for link previews (image/video)
// - /embed/:id -> Lightweight HTML5 video player iframe (for twitter:player)
// - /oembed?url=... -> oEmbed JSON for generic consumers
// Keeps demo workflow handler for default route

export interface Env {
  MY_WORKFLOW: any;
  DATABASE_URL: string;
}

// Static config (mirrors client config already public in repo)
const FIREBASE_PROJECT_ID = "jchat-1";
const FIREBASE_API_KEY = "AIzaSyDz-8N0totzvMCvonF9pKj9RsoH3J8xL0w";
const APP_ID = "default-app-id"; // override in query ?appId=

// Utility: fetch post by id from Firestore public path
async function fetchPost(id: string, appId = APP_ID) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/artifacts/${encodeURIComponent(appId)}/public/data/posts/${encodeURIComponent(id)}?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
  const res = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 60 } });
  if (!res.ok) return null;
  const json = await res.json<any>();
  const fields = json.fields || {};
  function f(k: string) {
    const v = fields[k];
    if (!v) return null;
    return v.stringValue ?? v.integerValue ?? v.doubleValue ?? (v.booleanValue ?? null);
  }
  return {
    id,
    title: f("title") || f("caption") || "Nuvia Post",
    description: f("description") || f("text") || "Shared from Nuvia",
    mediaType: f("mediaType") || "text",
    mediaUrl: f("mediaUrl") || null,
    imageUrl: f("imageUrl") || f("thumbnailUrl") || null,
    author: f("authorName") || null,
  };
}

function htmlEscape(s: string) { return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c] as string)); }

function shareHtml(origin: string, id: string, post: any) {
  const canonical = `${origin}/share/${encodeURIComponent(id)}`;
  const title = post?.title || "Nuvia";
  const desc = post?.description || "Shared from Nuvia";
  const img = (post?.imageUrl || (post?.mediaType?.startsWith("video") ? null : post?.mediaUrl)) || logo;
  const hasVideo = !!(post?.mediaUrl && /\.(mp4|webm|ogg)(\?|$)/i.test(post.mediaUrl));
  const video = hasVideo ? post.mediaUrl : null;
  const siteName = "Nuvia";
  const logo = "https://cdn.builder.io/api/v1/image/assets%2Faaaa97254b5c4256a69bb9a7bf91885c%2F9ed0b590d93440a085bb243bd84ed163?format=png&width=512";
  const playerUrl = `${origin}/embed/${encodeURIComponent(id)}`;
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${canonical}">
<title>${htmlEscape(title)} - Nuvia</title>
<meta name="description" content="${htmlEscape(desc)}">
<meta property="og:title" content="${htmlEscape(title)}">
<meta property="og:description" content="${htmlEscape(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${siteName}">
<meta property="og:type" content="${video ? "video.other" : "article"}">
${img ? `<meta property="og:image" content="${img}">\n<meta property="og:image:alt" content="${htmlEscape(title)}">` : ""}
${video ? `<meta property="og:video" content="${video}">\n<meta property="og:video:secure_url" content="${video}">\n<meta property="og:video:type" content="video/mp4">\n<meta property="og:video:width" content="1280">\n<meta property="og:video:height" content="720">` : ""}
<meta name="twitter:card" content="${video ? "player" : "summary_large_image"}">
<meta name="twitter:title" content="${htmlEscape(title)}">
<meta name="twitter:description" content="${htmlEscape(desc)}">
${video ? `<meta name="twitter:player" content="${playerUrl}">\n<meta name="twitter:player:width" content="720">\n<meta name="twitter:player:height" content="405">\n<meta name="twitter:player:stream" content="${video}">\n<meta name="twitter:player:stream:content_type" content="video/mp4">` : img ? `<meta name="twitter:image" content="${img}">` : ""}
<link rel="icon" href="${logo}">
<link rel="alternate" type="application/json+oembed" href="${origin}/oembed?url=${encodeURIComponent(canonical)}" title="${htmlEscape(title)}">
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px} .card{max-width:860px;width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden} .hero{position:relative;background:#111} .hero img, .hero video{width:100%;height:auto;display:block} .meta{padding:14px 16px} .brand{display:flex;align-items:center;gap:10px;margin-bottom:6px} .brand img{width:28px;height:28px;border-radius:6px} .title{font-weight:800;margin:0 0 6px 0} .desc{opacity:.85;margin:0}</style>
</head><body>
<div class="card"><div class="hero">${video ? `<video controls preload="metadata" poster="${img||""}"><source src="${video}" type="video/mp4"></video>` : (img ? `<img src="${img}" alt="${htmlEscape(title)}">` : "")}</div><div class="meta"><div class="brand"><img src="${logo}" alt="Nuvia logo"><strong>Nuvia</strong></div><h1 class="title">${htmlEscape(title)}</h1><p class="desc">${htmlEscape(desc)}</p></div></div>
</body></html>`;
}

function embedHtml(title: string, videoUrl: string, poster?: string) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(title)} - Nuvia Player</title>
<style>html,body{margin:0;height:100%;background:#000} .wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000} video{width:100%;height:100%;object-fit:contain;background:#000}</style>
</head><body>
<div class="wrap"><video controls playsinline ${poster?`poster="${poster}"`:''}><source src="${videoUrl}" type="video/mp4"></video></div>
</body></html>`;
}

function oembedJson({ origin, url, title, thumbnail_url, html }: { origin: string; url: string; title: string; thumbnail_url?: string; html: string; }) {
  return JSON.stringify({
    version: "1.0",
    type: "video",
    provider_name: "Nuvia",
    provider_url: origin,
    title,
    thumbnail_url: thumbnail_url || undefined,
    html,
    width: 720,
    height: 405,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = `${url.protocol}//${url.host}`;

    // DB health check endpoint (uses Neon serverless driver; does not expose secrets)
    if (url.pathname === '/api/db/ping') {
      try {
        const sql = neon(env.DATABASE_URL);
        const rows = await sql`select 1 as ok`;
        return Response.json({ ok: rows[0]?.ok === 1 });
      } catch (_) {
        return new Response('DB error', { status: 500 });
      }
    }

    // /share/:id
    const shareMatch = url.pathname.match(/^\/(share|p)\/(.+)$/);
    if (shareMatch) {
      const id = decodeURIComponent(shareMatch[2]);
      const appId = url.searchParams.get('appId') || APP_ID;
      let post: any = null;
      try { post = await fetchPost(id, appId); } catch (_) {}
      const html = shareHtml(origin, id, post);
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120, s-maxage=600' } });
    }

    // /embed/:id  or /embed?video=...
    const embedMatch = url.pathname.match(/^\/embed\/(.+)$/);
    if (embedMatch || url.pathname === '/embed') {
      const id = embedMatch ? decodeURIComponent(embedMatch[1]) : (url.searchParams.get('id') || '');
      const appId = url.searchParams.get('appId') || APP_ID;
      let video = url.searchParams.get('video') || '';
      let poster = url.searchParams.get('poster') || '';
      let title = url.searchParams.get('title') || 'Nuvia Post';
      if (!video && id) {
        const post = await fetchPost(id, appId);
        video = post?.mediaUrl || '';
        poster = post?.imageUrl || '';
        title = post?.title || title;
      }
      if (!video) return new Response('No video', { status: 404 });
      return new Response(embedHtml(title, video, poster), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
    }

    // /oembed?url=https://.../share/:id
    if (url.pathname === '/oembed') {
      const target = url.searchParams.get('url') || '';
      const u = new URL(target);
      const id = u.pathname.split('/').pop() || '';
      const appId = u.searchParams.get('appId') || APP_ID;
      const post = id ? await fetchPost(id, appId) : null;
      const player = `${origin}/embed/${encodeURIComponent(id)}`;
      const html = `<iframe src="${player}" width="720" height="405" frameborder="0" allowfullscreen></iframe>`;
      const body = oembedJson({ origin, url: target, title: post?.title || 'Nuvia Post', thumbnail_url: post?.imageUrl || undefined, html });
      return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
    }

    // Existing demo workflow status/creation preserved at /
    if (url.pathname.startsWith('/favicon')) {
      return new Response(null, { status: 204 });
    }
    const id = url.searchParams.get('instanceId');
    if (id) {
      const instance = await (env as any).MY_WORKFLOW.get(id);
      return Response.json({ status: await instance.status() });
    }
    const instance = await (env as any).MY_WORKFLOW.create();
    return Response.json({ id: instance.id, details: await instance.status() });
  }
};
