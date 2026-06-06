// pong-api — Cloudflare Worker
// Routes: auth, user profile, game save, admin stubs (Phase 2)

const TOKEN_TTL       = 7 * 24 * 60 * 60; // 7 days
const ADMIN_TOKEN_TTL = 4 * 60 * 60;       // 4 hours

// ── CORS ──────────────────────────────────────────────────────
function corsHeaders(env, origin) {
  if (origin !== env.ALLOWED_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  };
}

function json(data, status = 200, env = {}, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, origin) },
  });
}
function err(msg, status = 400, env = {}, origin = '') {
  return json({ error: msg }, status, env, origin);
}

// ── JWT (HMAC-SHA256) ─────────────────────────────────────────
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
async function jwtSign(payload, secret) {
  const enc = new TextEncoder();
  const h   = b64url(enc.encode(JSON.stringify({ alg:'HS256', typ:'JWT' })));
  const b   = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${h}.${b}`));
  return `${h}.${b}.${b64url(sig)}`;
}
async function jwtVerify(token, secret) {
  try {
    const [h, b, s] = token.split('.');
    if (!h || !b || !s) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret),
      { name:'HMAC', hash:'SHA-256' }, false, ['verify']);
    const sigBuf = Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', key, sigBuf, enc.encode(`${h}.${b}`));
    if (!ok) return null;
    const p = JSON.parse(atob(b.replace(/-/g,'+').replace(/_/g,'/')));
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

// ── PBKDF2 password hashing (mirrors the game client) ────────
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
const generateSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', hash:'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}

// ── Rate limiting (KV, TTL 5 min) ────────────────────────────
async function checkRateLimit(KV, key) {
  const raw = await KV.get(`rl:${key}`);
  const d = raw ? JSON.parse(raw) : { a:0, t:0 };
  if (Date.now() < d.t) throw new Error(`TOO MANY ATTEMPTS — WAIT ${Math.ceil((d.t - Date.now())/1000)}S`);
}
async function recordFail(KV, key) {
  const raw = await KV.get(`rl:${key}`);
  const d = raw ? JSON.parse(raw) : { a:0, t:0 };
  d.a = (d.a||0) + 1;
  if (d.a >= 5) { d.t = Date.now() + 30000; d.a = 0; }
  await KV.put(`rl:${key}`, JSON.stringify(d), { expirationTtl: 300 });
}
async function clearRateLimit(KV, key) { await KV.delete(`rl:${key}`); }

// ── Auth helpers ──────────────────────────────────────────────
async function requireAuth(request, env) {
  const auth  = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return jwtVerify(token, env.JWT_SECRET);
}
async function requireAdmin(request, env) {
  const p = await requireAuth(request, env);
  return p?.admin ? p : null;
}

// ── POST /api/auth/register ───────────────────────────────────
async function handleRegister(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  const { username, email, password } = body;
  if (!username || username.length < 2)                        return err('USERNAME TOO SHORT (MIN 2)', 400, env, origin);
  if (!/^[A-Za-z0-9_]+$/.test(username))                      return err('LETTERS, NUMBERS AND _ ONLY', 400, env, origin);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))    return err('ENTER A VALID EMAIL', 400, env, origin);
  if (!password || password.length < 4)                        return err('PASSWORD TOO SHORT (MIN 4)', 400, env, origin);

  const id = username.toUpperCase();
  const [taken, emailTaken] = await Promise.all([
    env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first(),
    env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first(),
  ]);
  if (taken)      return err('USERNAME ALREADY TAKEN', 409, env, origin);
  if (emailTaken) return err('EMAIL ALREADY REGISTERED', 409, env, origin);

  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  const avatars = ['🕹️','👾','🎮','⚡','🔥','💎'];
  const avatar  = avatars[Math.floor(Math.random() * avatars.length)];
  const now     = Date.now();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id,username,email,password_hash,salt,avatar,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, id, email.toLowerCase(), hash, salt, avatar, now),
    env.DB.prepare('INSERT INTO stats (user_id) VALUES (?)').bind(id),
  ]);

  const token = await jwtSign({ sub:id, iat:Math.floor(now/1000), exp:Math.floor(now/1000)+TOKEN_TTL }, env.JWT_SECRET);
  return json({ token, username:id, avatar }, 201, env, origin);
}

// ── POST /api/auth/login ──────────────────────────────────────
async function handleLogin(request, env, origin) {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username) return err('ENTER A USERNAME', 400, env, origin);
  if (!password) return err('ENTER A PASSWORD', 400, env, origin);
  const id = username.toUpperCase();

  try { await checkRateLimit(env.KV, id); } catch(e) { return err(e.message, 429, env, origin); }

  const acc = await env.DB.prepare(
    'SELECT id,password_hash,salt,avatar,xp,streak,banned FROM users WHERE id = ?'
  ).bind(id).first();

  if (!acc) { await recordFail(env.KV, id); return err('INVALID USERNAME OR PASSWORD', 401, env, origin); }
  if (acc.banned) return err('ACCOUNT SUSPENDED', 403, env, origin);

  const hash = await hashPassword(password, acc.salt);
  if (hash !== acc.password_hash) { await recordFail(env.KV, id); return err('INVALID USERNAME OR PASSWORD', 401, env, origin); }

  await clearRateLimit(env.KV, id);
  const now = Math.floor(Date.now()/1000);
  const token = await jwtSign({ sub:id, iat:now, exp:now+TOKEN_TTL }, env.JWT_SECRET);
  return json({ token, username:acc.id, avatar:acc.avatar, xp:acc.xp, streak:acc.streak }, 200, env, origin);
}

// ── GET /api/user/me ──────────────────────────────────────────
async function handleGetMe(request, env, origin) {
  const p = await requireAuth(request, env);
  if (!p) return err('UNAUTHORIZED', 401, env, origin);

  const [row, achs] = await Promise.all([
    env.DB.prepare(
      `SELECT u.id,u.username,u.avatar,u.xp,u.streak,u.created_at,
              s.games_played,s.wins,s.losses,s.total_play_time_sec,
              s.longest_rally,s.max_ball_speed,s.high_score
       FROM users u LEFT JOIN stats s ON s.user_id=u.id WHERE u.id=?`
    ).bind(p.sub).first(),
    env.DB.prepare('SELECT achievement_id,earned_at FROM achievements WHERE user_id=?').bind(p.sub).all(),
  ]);
  if (!row) return err('NOT FOUND', 404, env, origin);

  const achievements = {};
  for (const a of achs.results) achievements[a.achievement_id] = a.earned_at;
  return json({ ...row, achievements }, 200, env, origin);
}

// ── POST /api/game/save ───────────────────────────────────────
async function handleSaveGame(request, env, origin) {
  const p = await requireAuth(request, env);
  if (!p) return err('UNAUTHORIZED', 401, env, origin);

  const { won, playerScore, aiScore, rallyMax, maxSpeed, playTimeSec, wasTrailing, mode } =
    await request.json().catch(() => ({}));
  const uid = p.sub;

  const [user, stats] = await Promise.all([
    env.DB.prepare('SELECT xp,streak FROM users WHERE id=?').bind(uid).first(),
    env.DB.prepare('SELECT * FROM stats WHERE user_id=?').bind(uid).first(),
  ]);
  if (!user || !stats) return err('NOT FOUND', 404, env, origin);

  let xpGained = 20 + (playerScore||0)*5;
  if (won)                  xpGained += 50;
  if (won && aiScore === 0) xpGained += 30;
  if ((rallyMax||0) >= 10)  xpGained += 10;
  if ((rallyMax||0) >= 20)  xpGained += 15;

  const newXp     = (user.xp||0) + xpGained;
  const oldLevel  = Math.floor((user.xp||0)/500)+1;
  const newLevel  = Math.floor(newXp/500)+1;
  const newStreak = won ? (user.streak||0)+1 : 0;

  const newHS    = Math.max(stats.high_score||0,    playerScore||0);
  const newRally = Math.max(stats.longest_rally||0,  rallyMax||0);
  const newSpeed = Math.max(stats.max_ball_speed||0, maxSpeed||0);
  const newTime  = (stats.total_play_time_sec||0) + Math.round(playTimeSec||0);
  const newGames = (stats.games_played||0)+1;
  const newWins  = (stats.wins||0) + (won?1:0);

  await env.DB.batch([
    env.DB.prepare('UPDATE users SET xp=?,streak=? WHERE id=?').bind(newXp, newStreak, uid),
    env.DB.prepare(
      `UPDATE stats SET games_played=games_played+1, wins=wins+?, losses=losses+?,
       total_play_time_sec=?, longest_rally=?, max_ball_speed=?, high_score=? WHERE user_id=?`
    ).bind(won?1:0, won?0:1, newTime, newRally, newSpeed, newHS, uid),
    env.DB.prepare(
      'INSERT INTO games (id,user_id,won,player_score,ai_score,rally_max,max_speed,play_time_sec,mode,played_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(crypto.randomUUID(), uid, won?1:0, playerScore, aiScore, rallyMax, maxSpeed, playTimeSec, mode||'single', Date.now()),
  ]);

  // Achievements
  const [achRows, cfgRow] = await Promise.all([
    env.DB.prepare('SELECT achievement_id FROM achievements WHERE user_id=?').bind(uid).all(),
    env.DB.prepare("SELECT value FROM config WHERE key='achievements'").first(),
  ]);
  const have    = new Set(achRows.results.map(r => r.achievement_id));
  const allAchs = cfgRow ? JSON.parse(cfgRow.value) : [];
  const newAchs = [];

  const checks = [
    ['first_win',    won && newWins === 1],
    ['win_streak_3', won && newStreak >= 3],
    ['win_streak_5', won && newStreak >= 5],
    ['shutout',      won && aiScore === 0],
    ['rally_10',     (rallyMax||0) >= 10],
    ['rally_20',     (rallyMax||0) >= 20],
    ['speed_demon',  (maxSpeed||0) >= 12],
    ['games_10',     newGames >= 10],
    ['games_50',     newGames >= 50],
    ['level_5',      newLevel >= 5],
    ['level_10',     newLevel >= 10],
    ['play_hour',    newTime >= 3600],
    ['comeback',     won && wasTrailing],
  ];

  const achInserts = [];
  for (const [id, cond] of checks) {
    if (!have.has(id) && cond) {
      achInserts.push(
        env.DB.prepare('INSERT OR IGNORE INTO achievements (user_id,achievement_id,earned_at) VALUES (?,?,?)')
          .bind(uid, id, Date.now())
      );
      const def = allAchs.find(a => a.id === id);
      if (def) newAchs.push(def);
    }
  }
  if (achInserts.length) await env.DB.batch(achInserts);

  return json({ xpGained, leveled: newLevel > oldLevel, newLevel, newAchievements: newAchs }, 200, env, origin);
}

// ── POST /api/admin/auth ──────────────────────────────────────
async function handleAdminLogin(request, env, origin) {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password) return err('CREDENTIALS REQUIRED', 400, env, origin);

  const admin = await env.DB.prepare('SELECT * FROM admins WHERE username=?').bind(username.toUpperCase()).first();
  if (!admin) return err('INVALID CREDENTIALS', 401, env, origin);

  const hash = await hashPassword(password, admin.salt);
  if (hash !== admin.password_hash) return err('INVALID CREDENTIALS', 401, env, origin);

  const now = Math.floor(Date.now()/1000);
  const token = await jwtSign({ sub:admin.username, admin:true, iat:now, exp:now+ADMIN_TOKEN_TTL }, env.JWT_SECRET);
  return json({ token }, 200, env, origin);
}

// ── Admin stubs (Phase 2) ─────────────────────────────────────
function notImplemented(env, origin) {
  return err('NOT YET IMPLEMENTED — PHASE 2', 501, env, origin);
}

// ── Main router ───────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { method, url } = request;
    const path = new URL(url).pathname;

    if (method === 'OPTIONS') {
      return new Response(null, { status:204, headers: corsHeaders(env, origin) });
    }

    try {
      if (method==='POST' && path==='/api/auth/register') return handleRegister(request, env, origin);
      if (method==='POST' && path==='/api/auth/login')    return handleLogin(request, env, origin);
      if (method==='GET'  && path==='/api/user/me')       return handleGetMe(request, env, origin);
      if (method==='POST' && path==='/api/game/save')     return handleSaveGame(request, env, origin);
      if (method==='POST' && path==='/api/admin/auth')    return handleAdminLogin(request, env, origin);

      if (path.startsWith('/api/admin/')) {
        const adminP = await requireAdmin(request, env);
        if (!adminP) return err('UNAUTHORIZED', 401, env, origin);
        return notImplemented(env, origin);
      }

      return err('NOT FOUND', 404, env, origin);
    } catch(e) {
      console.error(e.stack || e.message);
      return err('INTERNAL SERVER ERROR', 500, env, origin);
    }
  },
};
