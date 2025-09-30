// Cloudflare Worker: Nuvia share + embed + oEmbed endpoints
import { neon } from '@neondatabase/serverless';
// - /share/:id -> SEO/OG/Twitter meta for link previews (image/video)
// - /embed/:id -> Lightweight HTML5 video player iframe (for twitter:player)
// - /oembed?url=... -> oEmbed JSON for generic consumers
// Keeps demo workflow handler for default route

export interface Env {
  MY_WORKFLOW: any;
  DATABASE_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_STATE_SECRET: string;
}

// Static config (mirrors client config already public in repo)
const FIREBASE_PROJECT_ID = "jchat-1";
const FIREBASE_API_KEY = "AIzaSyDz-8N0totzvMCvonF9pKj9RsoH3J8xL0w";
const APP_ID = "default-app-id"; // override in query ?appId=

// ===== Database & API helpers =====
const allowedTables = {
  users: ["id"],
  profiles: ["user_id"],
  posts: ["id"],
  comments: ["id"],
  likes: ["user_id", "post_id"],
  follows: ["follower_id", "following_id"],
  messages: ["id"],
  groups: ["id"],
  group_members: ["group_id", "user_id"],
  notifications: ["id"],
  reports: ["id"],
  wallets: ["user_id"],
  transactions: ["id"],
  levels: ["level"],
  achievements: ["id"],
  user_achievements: ["user_id", "achievement_id"],
  settings: ["user_id"],
} as const;

type TableName = keyof typeof allowedTables;
const columnsCache = new Map<string, string[]>();
let schemaReady = false;

const SCHEMA_SQL = `
create table if not exists users (
  id text primary key,
  email text unique not null,
  password_hash text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists profiles (
  user_id text primary key references users(id) on delete cascade,
  bio text,
  avatar_url text,
  cover_url text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists posts (
  id text primary key,
  author_id text not null references users(id) on delete cascade,
  content text not null,
  media_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists posts_author_id_idx on posts(author_id);

create table if not exists comments (
  id text primary key,
  post_id text not null references posts(id) on delete cascade,
  author_id text not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists comments_post_id_idx on comments(post_id);

create table if not exists likes (
  user_id text not null references users(id) on delete cascade,
  post_id text not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, post_id)
);

create table if not exists follows (
  follower_id text not null references users(id) on delete cascade,
  following_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists messages (
  id text primary key,
  sender_id text not null references users(id) on delete cascade,
  recipient_id text not null references users(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_pair_idx on messages(least(sender_id, recipient_id), greatest(sender_id, recipient_id));

create table if not exists groups (
  id text primary key,
  name text not null unique,
  owner_id text not null references users(id) on delete cascade,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id text not null references groups(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key(group_id, user_id)
);

create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id text primary key,
  reporter_id text not null references users(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  reason text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists wallets (
  user_id text primary key references users(id) on delete cascade,
  balance numeric(20,8) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  amount numeric(20,8) not null,
  kind text not null,
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on transactions(user_id);

create table if not exists levels (
  level integer primary key,
  name text not null,
  min_xp integer not null,
  created_at timestamptz not null default now()
);

create table if not exists achievements (
  id text primary key,
  code text unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists user_achievements (
  user_id text not null references users(id) on delete cascade,
  achievement_id text not null references achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key(user_id, achievement_id)
);

create table if not exists settings (
  user_id text primary key references users(id) on delete cascade,
  prefs jsonb not null default '{}'
);
`;

function placeholders(count: number, startAt = 1) {
  return Array.from({ length: count }, (_, i) => `$${i + startAt}`).join(", ");
}

async function ensureSchema(sql: ReturnType<typeof neon>) {
  if (schemaReady) return;
  await sql(SCHEMA_SQL);
  schemaReady = true;
}

async function getColumns(sql: ReturnType<typeof neon>, table: TableName) {
  const key = String(table);
  if (columnsCache.has(key)) return columnsCache.get(key)!;
  const rows = await sql(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [key]
  );
  const cols = rows.map((r: any) => r.column_name as string);
  columnsCache.set(key, cols);
  return cols;
}

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  } as Record<string, string>;
}

async function readJson<T = any>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) return {} as any;
  return JSON.parse(text);
}

function nowIso() { return new Date().toISOString(); }

async function handleApi(req: Request, env: Env, url: URL) {
  const parts = url.pathname.split('/').filter(Boolean);
  const table = parts[1] as TableName | undefined;
  if (!table || !(table in allowedTables)) return new Response('Not found', { status: 404 });

  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { headers: cors() });

  const sql = neon(env.DATABASE_URL);
  await ensureSchema(sql);

  // Preload columns & whitelist
  const cols = await getColumns(sql, table);
  const pk = (allowedTables as any)[table] as string[];

  // List
  if (parts.length === 2 && method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    const where: string[] = [];
    const params: any[] = [];
    let p = 1;
    for (const [k, v] of url.searchParams.entries()) {
      if (k === 'limit' || k === 'offset' || k === 'order' || k === 'dir') continue;
      if (!cols.includes(k)) continue;
      where.push(`${k} = $${p++}`);
      params.push(v);
    }
    const order = url.searchParams.get('order');
    const dir = (url.searchParams.get('dir') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const orderBy = order && cols.includes(order) ? `order by ${order} ${dir}` : (cols.includes('created_at') ? `order by created_at desc` : '');
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const rows = await sql(
      `select * from ${table} ${whereSql} ${orderBy} limit ${limit} offset ${offset}`,
      params
    );
    return new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json', ...cors() } });
  }

  // Single by key(s)
  if (parts.length === 3 && method === 'GET') {
    const params: any[] = [];
    const clauses: string[] = [];
    let p = 1;
    if (pk.length === 1) {
      const key = pk[0];
      const val = decodeURIComponent(parts[2]);
      clauses.push(`${key} = $${p++}`);
      params.push(val);
    } else {
      for (const key of pk) {
        const val = url.searchParams.get(key);
        if (!val) return new Response(`Missing key ${key}`, { status: 400, headers: cors() });
        clauses.push(`${key} = $${p++}`);
        params.push(val);
      }
    }
    const row = await sql(
      `select * from ${table} where ${clauses.join(' and ')} limit 1`,
      params
    );
    return row[0]
      ? new Response(JSON.stringify(row[0]), { headers: { 'content-type': 'application/json', ...cors() } })
      : new Response('Not found', { status: 404, headers: cors() });
  }

  // Create
  if (parts.length === 2 && method === 'POST') {
    const body = await readJson<Record<string, any>>(req);
    const data: Record<string, any> = {};
    for (const k of cols) {
      if (k in body) data[k] = body[k];
    }
    if (pk.length === 1 && !(pk[0] in data) && pk[0] === 'id') {
      data.id = crypto.randomUUID();
    }
    if (Object.keys(data).length === 0) return new Response('Empty body', { status: 400, headers: cors() });

    const keys = Object.keys(data);
    const values = keys.map(k => data[k]);
    const sqlText = `insert into ${table} (${keys.join(',')}) values (${placeholders(keys.length)}) returning *`;
    const rows = await sql(sqlText, values);
    return new Response(JSON.stringify(rows[0]), { status: 201, headers: { 'content-type': 'application/json', ...cors() } });
  }

  // Update
  if (parts.length === 3 && (method === 'PATCH' || method === 'PUT')) {
    const body = await readJson<Record<string, any>>(req);
    const data: Record<string, any> = {};
    for (const k of cols) {
      if (k in body && !pk.includes(k)) data[k] = body[k];
    }
    if ('updated_at' in cols) {
      (data as any).updated_at = nowIso();
    }
    const setKeys = Object.keys(data);
    if (setKeys.length === 0) return new Response('No changes', { status: 400, headers: cors() });

    const whereVals: any[] = [];
    const whereClauses: string[] = [];
    if (pk.length === 1) {
      whereClauses.push(`${pk[0]} = $${setKeys.length + 1}`);
      whereVals.push(decodeURIComponent(parts[2]));
    } else {
      let idx = setKeys.length + 1;
      for (const key of pk) {
        const v = url.searchParams.get(key);
        if (!v) return new Response(`Missing key ${key}`, { status: 400, headers: cors() });
        whereClauses.push(`${key} = $${idx++}`);
        whereVals.push(v);
      }
    }

    const sqlText = `update ${table} set ${setKeys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where ${whereClauses.join(' and ')} returning *`;
    const rows = await sql(sqlText, [...setKeys.map(k => data[k]), ...whereVals]);
    return rows[0]
      ? new Response(JSON.stringify(rows[0]), { headers: { 'content-type': 'application/json', ...cors() } })
      : new Response('Not found', { status: 404, headers: cors() });
  }

  // Delete
  if (parts.length === 3 && method === 'DELETE') {
    const whereVals: any[] = [];
    const whereClauses: string[] = [];
    if (pk.length === 1) {
      whereClauses.push(`${pk[0]} = $1`);
      whereVals.push(decodeURIComponent(parts[2]));
    } else {
      let idx = 1;
      for (const key of pk) {
        const v = url.searchParams.get(key);
        if (!v) return new Response(`Missing key ${key}`, { status: 400, headers: cors() });
        whereClauses.push(`${key} = $${idx++}`);
        whereVals.push(v);
      }
    }
    const rows = await sql(`delete from ${table} where ${whereClauses.join(' and ')} returning *`, whereVals);
    return rows[0]
      ? new Response(JSON.stringify(rows[0]), { headers: { 'content-type': 'application/json', ...cors() } })
      : new Response('Not found', { status: 404, headers: cors() });
  }

  return new Response('Method not allowed', { status: 405, headers: cors() });
}

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
  const siteName = "Nuvia";
  const logo = "https://cdn.builder.io/api/v1/image/assets%2Faaaa97254b5c4256a69bb9a7bf91885c%2F9ed0b590d93440a085bb243bd84ed163?format=png&width=512";
  const img = (post?.imageUrl || (post?.mediaType?.startsWith("video") ? null : post?.mediaUrl)) || logo;
  const hasVideo = !!(post?.mediaUrl && /\.(mp4|webm|ogg)(\?|$)/i.test(post.mediaUrl));
  const video = hasVideo ? post.mediaUrl : null;
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

function b64urlFromBytes(bytes: ArrayBuffer | Uint8Array) {
  const bin = Array.from(new Uint8Array(bytes)).map(b => String.fromCharCode(b)).join('');
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(data));
  return b64urlFromBytes(sig);
}
function b64urlEncodeString(s: string) {
  return btoa(unescape(encodeURIComponent(s))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecodeString(s: string) {
  try { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); } catch { return ''; }
}
async function packState(redirect: string, secret: string) {
  const payload = JSON.stringify({ t: Date.now(), r: redirect });
  const sig = await hmacSha256(secret, 'v1.' + payload);
  return b64urlEncodeString(payload) + '.' + sig;
}
async function unpackState(state: string, secret: string): Promise<{ r: string } | null> {
  const idx = state.indexOf('.');
  if (idx < 0) return null;
  const pay = state.slice(0, idx);
  const mac = state.slice(idx + 1);
  const payloadStr = b64urlDecodeString(pay);
  if (!payloadStr) return null;
  const expected = await hmacSha256(secret, 'v1.' + payloadStr);
  if (expected !== mac) return null;
  try {
    const obj = JSON.parse(payloadStr);
    if (!obj || typeof obj.r !== 'string') return null;
    // Optional: 10 minute expiry
    if (typeof obj.t === 'number' && Date.now() - obj.t > 10 * 60 * 1000) return null;
    return { r: obj.r };
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = `${url.protocol}//${url.host}`;

    // GitHub OAuth start
    if (url.pathname === '/auth/github/start') {
      if (req.method === 'OPTIONS') return new Response(null, { headers: cors() });
      const redirectBack = url.searchParams.get('redirect') || origin + '/login.html';
      const state = await packState(redirectBack, env.GITHUB_STATE_SECRET);
      const callback = `${origin}/auth/github/callback`;
      const authUrl = new URL('https://github.com/login/oauth/authorize');
      authUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', callback);
      authUrl.searchParams.set('scope', 'read:user user:email');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('allow_signup', 'true');
      return new Response(null, { status: 302, headers: { Location: authUrl.toString(), ...cors() } });
    }

    // GitHub OAuth callback
    if (url.pathname === '/auth/github/callback') {
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || '';
      const unpacked = await unpackState(state, env.GITHUB_STATE_SECRET);
      const back = unpacked?.r || origin + '/login.html';
      if (!code || !unpacked) {
        return new Response(null, { status: 302, headers: { Location: back + '#error=github_oauth_state', ...cors() } });
      }
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${origin}/auth/github/callback`
        })
      });
      if (!tokenRes.ok) {
        return new Response(null, { status: 302, headers: { Location: back + '#error=github_oauth_exchange', ...cors() } });
      }
      const tokenJson: any = await tokenRes.json();
      const access = tokenJson.access_token || '';
      if (!access) {
        return new Response(null, { status: 302, headers: { Location: back + '#error=github_oauth_no_token', ...cors() } });
      }
      // Redirect back with token in hash for client to finalize via Firebase signInWithCredential
      return new Response(null, { status: 302, headers: { Location: back + '#gh_token=' + encodeURIComponent(access), ...cors() } });
    }

    // API router
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(req, env, url);
      } catch (err: any) {
        return new Response('Server error', { status: 500, headers: cors() });
      }
    }

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
