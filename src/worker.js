/* The Pastel Stop: backend
 *
 * Static pages are served straight from the assets binding. This Worker only runs for
 *   POST /api/subscribe   newsletter sign-up  -> MailerLite
 *   POST /api/story       Pause Files story   -> D1 (status "pending")
 *   GET  /api/stories     approved stories    -> JSON
 *   /admin                private review page (passphrase)
 *
 * Secrets (set in Cloudflare, never in this repo):
 *   TURNSTILE_SECRET_KEY, MAILERLITE_API_KEY, ADMIN_PASSPHRASE
 * Plain variable (wrangler.jsonc):
 *   MAILERLITE_GROUP_ID   optional: which MailerLite group new subscribers join
 */

const WANTS = ["advice", "second-opinion", "vent"];
const STORY_MIN = 10;
const STORY_MAX = 1500;
const SESSION_SECONDS = 60 * 60 * 12;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILS = 8;

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, story TEXT NOT NULL, want TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, reviewed_at TEXT)"
      ),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_stories_status ON stories (status, created_at)"),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS login_fails (ip TEXT NOT NULL, at INTEGER NOT NULL)")
    ]).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api/subscribe") return await subscribe(request, env);
      if (path === "/api/story") return await submitStory(request, env);
      if (path === "/api/stories") return await approvedStories(request, env);
      if (path === "/admin" || path.startsWith("/admin/")) return await admin(request, env, url);
    } catch (err) {
      console.error("worker error", path, err && err.message);
      return json({ error: "server" }, 500);
    }
    return env.ASSETS.fetch(request);
  }
};

/* ---------- helpers ---------- */

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY"
    }
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // non-browser callers still have to pass Turnstile / the passphrase
  return origin === new URL(request.url).origin;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

async function verifyTurnstile(token, env, request) {
  if (!env.TURNSTILE_SECRET_KEY || typeof token !== "string" || !token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success === true;
}

/* ---------- newsletter ---------- */

async function subscribe(request, env) {
  if (request.method !== "POST") return json({ error: "method" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const body = await readJson(request);
  if (!body) return json({ error: "bad request" }, 400);

  if (typeof body.website === "string" && body.website) return json({ ok: true }); // honeypot: pretend it worked

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "email" }, 400);
  if (!(await verifyTurnstile(body.token, env, request))) return json({ error: "verification" }, 403);

  if (!env.MAILERLITE_API_KEY) return json({ error: "not configured" }, 503);
  const payload = { email };
  if (env.MAILERLITE_GROUP_ID) payload.groups = [env.MAILERLITE_GROUP_ID];
  const res = await fetch((env.MAILERLITE_API_URL || "https://connect.mailerlite.com") + "/api/subscribers", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.MAILERLITE_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 200 || res.status === 201) return json({ ok: true });
  console.error("mailerlite status", res.status);
  return json({ error: "upstream" }, 502);
}

/* ---------- stories ---------- */

async function submitStory(request, env) {
  if (request.method !== "POST") return json({ error: "method" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const body = await readJson(request);
  if (!body) return json({ error: "bad request" }, 400);

  if (typeof body.website === "string" && body.website) return json({ ok: true }); // honeypot

  const story = typeof body.story === "string" ? body.story.trim() : "";
  const want = WANTS.includes(body.want) ? body.want : "advice";
  if (story.length < STORY_MIN || story.length > STORY_MAX) return json({ error: "story" }, 400);
  if (body.consent !== true) return json({ error: "consent" }, 400);
  if (!(await verifyTurnstile(body.token, env, request))) return json({ error: "verification" }, 403);

  await ensureSchema(env);
  await env.DB.prepare("INSERT INTO stories (id, story, want, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .bind(crypto.randomUUID(), story, want, new Date().toISOString())
    .run();
  return json({ ok: true });
}

async function approvedStories(request, env) {
  if (request.method !== "GET") return json({ error: "method" }, 405, { Allow: "GET" });
  await ensureSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT id, story, want, created_at FROM stories WHERE status = 'approved' ORDER BY created_at DESC LIMIT 50"
  ).all();
  return json({ stories: results }, 200, { "Cache-Control": "public, max-age=60" });
}

/* ---------- admin (private review page) ---------- */

const enc = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function passphraseMatches(given, env) {
  // compare HMACs of both so the check takes the same time however close the guess is
  const [a, b] = await Promise.all([hmac("compare", given), hmac("compare", env.ADMIN_PASSPHRASE)]);
  return equalBytes(a, b);
}

async function makeSession(env) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return expires + "." + hex(await hmac(env.ADMIN_PASSPHRASE, "session:" + expires));
}

async function hasSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)tps_admin=([^;]+)/);
  if (!match) return false;
  const [expires, sig] = match[1].split(".");
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false;
  const expected = hex(await hmac(env.ADMIN_PASSPHRASE, "session:" + expires));
  return equalBytes(enc.encode(sig), enc.encode(expected));
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", ...extraHeaders } });
}

async function admin(request, env, url) {
  if (!env.ADMIN_PASSPHRASE) return html(page("Not set up", "<p>The review page isn&rsquo;t set up yet.</p>"), 503);
  await ensureSchema(env);
  const path = url.pathname.replace(/\/+$/, "") || "/admin";

  if (path === "/admin/login" && request.method === "POST") return login(request, env);
  if (path === "/admin/logout" && request.method === "POST") {
    if (!sameOrigin(request)) return html(page("Nope", "<p>Request blocked.</p>"), 403);
    return redirect("/admin", { "Set-Cookie": "tps_admin=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict" });
  }

  if (!(await hasSession(request, env))) return html(loginPage(url.searchParams.get("error")));

  if (path === "/admin/action" && request.method === "POST") {
    if (!sameOrigin(request)) return html(page("Nope", "<p>Request blocked.</p>"), 403);
    return storyAction(request, env);
  }
  if (path !== "/admin") return html(page("Not found", "<p>Nothing here.</p>"), 404);
  return reviewPage(env, url);
}

async function login(request, env) {
  if (!sameOrigin(request)) return html(page("Nope", "<p>Request blocked.</p>"), 403);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const since = Math.floor(Date.now() / 1000) - LOGIN_WINDOW_SECONDS;
  await env.DB.prepare("DELETE FROM login_fails WHERE at < ?").bind(since).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_fails WHERE ip = ? AND at >= ?").bind(ip, since).first();
  if (row && row.n >= LOGIN_MAX_FAILS) {
    return html(loginPage("Too many tries. Please wait a little while and try again."), 429);
  }
  const form = await request.formData();
  const given = String(form.get("passphrase") || "");
  if (!(await passphraseMatches(given, env))) {
    await env.DB.prepare("INSERT INTO login_fails (ip, at) VALUES (?, ?)").bind(ip, Math.floor(Date.now() / 1000)).run();
    return html(loginPage("That wasn&rsquo;t it."), 401);
  }
  return redirect("/admin", {
    "Set-Cookie": `tps_admin=${await makeSession(env)}; Path=/admin; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
  });
}

async function storyAction(request, env) {
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const action = String(form.get("action") || "");
  const tab = ["pending", "approved", "rejected"].includes(String(form.get("tab"))) ? String(form.get("tab")) : "pending";
  const now = new Date().toISOString();

  if (action === "delete") {
    await env.DB.prepare("DELETE FROM stories WHERE id = ?").bind(id).run();
  } else if (action === "approve" || action === "reject" || action === "restore" || action === "save") {
    const text = String(form.get("story") || "").trim();
    const edited = text.length >= STORY_MIN && text.length <= STORY_MAX;
    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "restore" ? "pending" : null;
    if (status) {
      if (edited) {
        await env.DB.prepare("UPDATE stories SET story = ?, status = ?, reviewed_at = ? WHERE id = ?").bind(text, status, now, id).run();
      } else {
        await env.DB.prepare("UPDATE stories SET status = ?, reviewed_at = ? WHERE id = ?").bind(status, now, id).run();
      }
    } else if (edited) {
      await env.DB.prepare("UPDATE stories SET story = ? WHERE id = ?").bind(text, id).run();
    }
  }
  return redirect("/admin?tab=" + tab);
}

async function reviewPage(env, url) {
  const tab = ["pending", "approved", "rejected"].includes(url.searchParams.get("tab")) ? url.searchParams.get("tab") : "pending";
  const counts = {};
  const { results: countRows } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM stories GROUP BY status").all();
  countRows.forEach((r) => (counts[r.status] = r.n));
  const { results } = await env.DB.prepare(
    "SELECT id, story, want, status, created_at FROM stories WHERE status = ? ORDER BY created_at DESC LIMIT 200"
  ).bind(tab).all();

  const tabs = ["pending", "approved", "rejected"]
    .map((t) => `<a class="tab${t === tab ? " on" : ""}" href="/admin?tab=${t}">${t} (${counts[t] || 0})</a>`)
    .join("");

  const cards = results.length
    ? results
        .map((s) => {
          const buttons =
            tab === "pending"
              ? `<button name="action" value="approve">Approve</button><button name="action" value="reject" class="quiet">Reject</button>`
              : tab === "approved"
                ? `<button name="action" value="restore" class="quiet">Move back to pending</button>`
                : `<button name="action" value="restore">Move back to pending</button>`;
          return `<form class="card" method="post" action="/admin/action">
  <input type="hidden" name="id" value="${esc(s.id)}"><input type="hidden" name="tab" value="${tab}">
  <p class="meta">${esc(s.created_at.slice(0, 16).replace("T", " "))} UTC &middot; wants: ${esc(s.want)}</p>
  <textarea name="story" rows="6" maxlength="${STORY_MAX}">${esc(s.story)}</textarea>
  <div class="row">${buttons}<button name="action" value="save" class="quiet">Save edits</button><button name="action" value="delete" class="danger" onclick="return confirm('Delete this story for good?')">Delete</button></div>
</form>`;
        })
        .join("")
    : `<p class="empty">Nothing here yet.</p>`;

  return html(
    page(
      "Stories",
      `<div class="bar"><h1>Pause Files review</h1><form method="post" action="/admin/logout"><button class="quiet">Log out</button></form></div>
<nav>${tabs}</nav>${cards}`
    )
  );
}

function loginPage(error) {
  return page(
    "Log in",
    `<h1>Pause Files review</h1>
<form class="login" method="post" action="/admin/login">
  ${error ? `<p class="error">${error}</p>` : ""}
  <label for="p">Passphrase</label>
  <input id="p" name="passphrase" type="password" autocomplete="current-password" required autofocus>
  <button>Log in</button>
</form>`
  );
}

function page(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)} — thepastelstop.</title>
<style>
:root{--ink:#3F170E;--pink:#ED86C3;--cream:#FFFFF1;--line:rgba(63,23,14,.28)}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.6 "Courier New",monospace;padding:32px 20px 80px}
body{max-width:800px;margin:0 auto}
h1{font:800 2rem/1.1 system-ui,sans-serif;text-transform:lowercase;margin:0 0 20px}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px}
nav{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 24px}.tab{padding:8px 14px;border:1px solid var(--line);color:var(--ink);text-decoration:none;text-transform:uppercase;font-size:.75rem;letter-spacing:.08em}.tab.on{background:var(--ink);color:var(--cream)}
.card{border:1px solid var(--line);padding:18px;margin:0 0 18px}.meta{margin:0 0 10px;font-size:.75rem;color:rgba(63,23,14,.62);text-transform:uppercase;letter-spacing:.06em}
textarea,input[type=password]{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:0;padding:12px}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
button{font:inherit;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;background:var(--ink);color:var(--cream);border:1px solid var(--ink);padding:10px 16px;border-radius:0;cursor:pointer}
button.quiet{background:transparent;color:var(--ink)}button.danger{background:transparent;color:#A3324F;border-color:#A3324F;margin-left:auto}
.login{display:grid;gap:12px;max-width:360px}.error{color:#A3324F;margin:0}.empty{color:rgba(63,23,14,.62)}
</style></head><body>${body}</body></html>`;
}
