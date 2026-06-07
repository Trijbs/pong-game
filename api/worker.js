// pong-api — Cloudflare Worker
// Phase 1: auth, user profile, game save
// Phase 2: full admin API (stats, users, leaderboard, games, config)

const TOKEN_TTL       = 7 * 24 * 60 * 60; // 7 days
const ADMIN_TOKEN_TTL = 8 * 60 * 60;       // 8 hours

// ── CORS ──────────────────────────────────────────────────────
function corsHeaders(env, origin) {
  const base = (env.ALLOWED_ORIGIN || 'https://pong.trijbsworld.nl').replace(/^https?:\/\//, '');
  const originBase = (origin || '').replace(/^https?:\/\//, '');
  if (originBase !== base) return {};
  return {
    'Access-Control-Allow-Origin':  origin,   // reflect actual origin (handles both http/https)
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
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

// ── PBKDF2 password hashing ───────────────────────────────────
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
const generateSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', hash:'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}

// ── Rate limiting (KV) ────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════
// PHASE 1 — Auth + Game routes
// ═══════════════════════════════════════════════════════════════

async function handleRegister(request, env, origin) {
  const { username, email, password } = await request.json().catch(() => ({}));
  if (!username || username.length < 2)                     return err('USERNAME TOO SHORT (MIN 2)', 400, env, origin);
  if (!/^[A-Za-z0-9_]+$/.test(username))                   return err('LETTERS, NUMBERS AND _ ONLY', 400, env, origin);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('ENTER A VALID EMAIL', 400, env, origin);
  if (!password || password.length < 4)                     return err('PASSWORD TOO SHORT (MIN 4)', 400, env, origin);

  const id = username.toUpperCase();
  const [taken, emailTaken] = await Promise.all([
    env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first(),
    env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first(),
  ]);
  if (taken)      return err('USERNAME ALREADY TAKEN', 409, env, origin);
  if (emailTaken) return err('EMAIL ALREADY REGISTERED', 409, env, origin);

  const salt   = generateSalt();
  const hash   = await hashPassword(password, salt);
  const avatar = ['🕹️','👾','🎮','⚡','🔥','💎'][Math.floor(Math.random() * 6)];
  const now    = Date.now();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id,username,email,password_hash,salt,avatar,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, id, email.toLowerCase(), hash, salt, avatar, now),
    env.DB.prepare('INSERT INTO stats (user_id) VALUES (?)').bind(id),
  ]);

  const token = await jwtSign({ sub:id, iat:Math.floor(now/1000), exp:Math.floor(now/1000)+TOKEN_TTL }, env.JWT_SECRET);
  return json({ token, username:id, avatar }, 201, env, origin);
}

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

  if ((await hashPassword(password, acc.salt)) !== acc.password_hash) {
    await recordFail(env.KV, id);
    return err('INVALID USERNAME OR PASSWORD', 401, env, origin);
  }

  await clearRateLimit(env.KV, id);
  const now = Math.floor(Date.now()/1000);
  const token = await jwtSign({ sub:id, iat:now, exp:now+TOKEN_TTL }, env.JWT_SECRET);
  return json({ token, username:acc.id, avatar:acc.avatar, xp:acc.xp, streak:acc.streak }, 200, env, origin);
}

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
  const newGames  = (stats.games_played||0)+1;
  const newWins   = (stats.wins||0)+(won?1:0);
  const newTime   = (stats.total_play_time_sec||0)+Math.round(playTimeSec||0);

  await env.DB.batch([
    env.DB.prepare('UPDATE users SET xp=?,streak=? WHERE id=?').bind(newXp, newStreak, uid),
    env.DB.prepare(
      `UPDATE stats SET games_played=games_played+1,wins=wins+?,losses=losses+?,
       total_play_time_sec=?,longest_rally=?,max_ball_speed=?,high_score=? WHERE user_id=?`
    ).bind(won?1:0, won?0:1, newTime,
      Math.max(stats.longest_rally||0, rallyMax||0),
      Math.max(stats.max_ball_speed||0, maxSpeed||0),
      Math.max(stats.high_score||0, playerScore||0), uid),
    env.DB.prepare(
      'INSERT INTO games (id,user_id,won,player_score,ai_score,rally_max,max_speed,play_time_sec,mode,played_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(crypto.randomUUID(), uid, won?1:0, playerScore, aiScore, rallyMax, maxSpeed, playTimeSec, mode||'single', Date.now()),
  ]);

  const [achRows, cfgRow] = await Promise.all([
    env.DB.prepare('SELECT achievement_id FROM achievements WHERE user_id=?').bind(uid).all(),
    env.DB.prepare("SELECT value FROM config WHERE key='achievements'").first(),
  ]);
  const have    = new Set(achRows.results.map(r => r.achievement_id));
  const allAchs = cfgRow ? JSON.parse(cfgRow.value) : [];
  const newAchs = [];
  const checks  = [
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
  const inserts = [];
  for (const [id, cond] of checks) {
    if (!have.has(id) && cond) {
      inserts.push(env.DB.prepare('INSERT OR IGNORE INTO achievements (user_id,achievement_id,earned_at) VALUES (?,?,?)').bind(uid, id, Date.now()));
      const def = allAchs.find(a => a.id === id);
      if (def) newAchs.push(def);
    }
  }
  if (inserts.length) await env.DB.batch(inserts);

  return json({ xpGained, leveled: newLevel > oldLevel, newLevel, newAchievements: newAchs }, 200, env, origin);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2 — Admin routes (require admin JWT)
// ═══════════════════════════════════════════════════════════════

// POST /api/admin/auth
async function handleAdminLogin(request, env, origin) {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password) return err('CREDENTIALS REQUIRED', 400, env, origin);
  const id = username.toUpperCase();

  try { await checkRateLimit(env.KV, `admin:${id}`); } catch(e) { return err(e.message, 429, env, origin); }

  const admin = await env.DB.prepare('SELECT * FROM admins WHERE username=?').bind(id).first();
  if (!admin) { await recordFail(env.KV, `admin:${id}`); return err('INVALID CREDENTIALS', 401, env, origin); }

  if ((await hashPassword(password, admin.salt)) !== admin.password_hash) {
    await recordFail(env.KV, `admin:${id}`);
    return err('INVALID CREDENTIALS', 401, env, origin);
  }

  await clearRateLimit(env.KV, `admin:${id}`);
  const now = Math.floor(Date.now()/1000);
  const token = await jwtSign({ sub:id, admin:true, iat:now, exp:now+ADMIN_TOKEN_TTL }, env.JWT_SECRET);
  return json({ token }, 200, env, origin);
}

// GET /api/admin/stats
async function handleAdminStats(request, env, origin) {
  const week = Date.now() - 7*24*3600*1000;
  const [totals, weekly] = await Promise.all([
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users)                        AS total_users,
        (SELECT COUNT(*) FROM users WHERE banned = 1)       AS banned_users,
        (SELECT COUNT(*) FROM games)                        AS total_games,
        (SELECT COALESCE(SUM(xp), 0) FROM users)            AS total_xp,
        (SELECT COUNT(*) FROM achievements)                 AS total_achievements_earned,
        (SELECT COUNT(*) FROM admins)                       AS total_admins
    `).first(),
    env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users      WHERE created_at > ?) AS new_users_7d,
        (SELECT COUNT(*) FROM games      WHERE played_at  > ?) AS games_7d,
        (SELECT COUNT(*) FROM games      WHERE played_at  > ? AND won = 1) AS wins_7d,
        (SELECT COALESCE(SUM(xp), 0) FROM users WHERE created_at > ?) AS xp_7d
    `).bind(week, week, week, week).first(),
  ]);
  return json({ ...totals, ...weekly }, 200, env, origin);
}

// GET /api/admin/users?page=1&limit=50&search=x&sort=xp&dir=desc
async function handleAdminUsers(request, env, origin) {
  const url    = new URL(request.url);
  const page   = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
  const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
  const search = url.searchParams.get('search') || '';
  const sortKey= ['xp','wins','games_played','created_at'].includes(url.searchParams.get('sort'))
    ? url.searchParams.get('sort') : 'created_at';
  const dir    = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;
  const sortCol= { xp:'u.xp', wins:'s.wins', games_played:'s.games_played', created_at:'u.created_at' }[sortKey];

  const where   = search ? 'WHERE (u.id LIKE ? OR u.email LIKE ?)' : '';
  const sParams = search ? [`%${search.toUpperCase()}%`, `%${search.toLowerCase()}%`] : [];

  const [rows, countRow] = await Promise.all([
    env.DB.prepare(
      `SELECT u.id,u.username,u.avatar,u.email,u.xp,u.streak,u.banned,u.created_at,
              s.games_played,s.wins,s.losses,s.high_score
       FROM users u LEFT JOIN stats s ON s.user_id=u.id
       ${where} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`
    ).bind(...sParams, limit, offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM users u ${where}`).bind(...sParams).first(),
  ]);

  return json({ users: rows.results, total: countRow.cnt, page, limit, pages: Math.ceil(countRow.cnt / limit) }, 200, env, origin);
}

// GET /api/admin/users/:id
async function handleAdminGetUser(request, env, origin, userId) {
  const [row, achs, recentGames] = await Promise.all([
    env.DB.prepare(
      `SELECT u.*,s.games_played,s.wins,s.losses,s.total_play_time_sec,
              s.longest_rally,s.max_ball_speed,s.high_score
       FROM users u LEFT JOIN stats s ON s.user_id=u.id WHERE u.id=?`
    ).bind(userId).first(),
    env.DB.prepare('SELECT achievement_id,earned_at FROM achievements WHERE user_id=? ORDER BY earned_at DESC').bind(userId).all(),
    env.DB.prepare('SELECT * FROM games WHERE user_id=? ORDER BY played_at DESC LIMIT 10').bind(userId).all(),
  ]);
  if (!row) return err('NOT FOUND', 404, env, origin);
  const achievements = {};
  for (const a of achs.results) achievements[a.achievement_id] = a.earned_at;
  const { password_hash, salt, ...safeRow } = row;
  return json({ ...safeRow, achievements, recent_games: recentGames.results }, 200, env, origin);
}

// DELETE /api/admin/users/:id
async function handleAdminDeleteUser(request, env, origin, userId) {
  const user = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first();
  if (!user) return err('NOT FOUND', 404, env, origin);
  await env.DB.prepare('DELETE FROM users WHERE id=?').bind(userId).run();
  return json({ deleted: userId }, 200, env, origin);
}

// POST /api/admin/users/:id/ban  (toggles)
async function handleAdminBan(request, env, origin, userId) {
  const user = await env.DB.prepare('SELECT id,banned FROM users WHERE id=?').bind(userId).first();
  if (!user) return err('NOT FOUND', 404, env, origin);
  const newBan = user.banned ? 0 : 1;
  await env.DB.prepare('UPDATE users SET banned=? WHERE id=?').bind(newBan, userId).run();
  // Clear any active sessions via KV (best-effort)
  await env.KV.delete(`session:${userId}`).catch(() => {});
  return json({ userId, banned: !!newBan }, 200, env, origin);
}

// POST /api/admin/users/:id/reset-password
async function handleAdminResetPassword(request, env, origin, userId) {
  const user = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first();
  if (!user) return err('NOT FOUND', 404, env, origin);
  const tempPass = hex(crypto.getRandomValues(new Uint8Array(8)));
  const salt     = generateSalt();
  const hash     = await hashPassword(tempPass, salt);
  await env.DB.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=?').bind(hash, salt, userId).run();
  return json({ userId, tempPassword: tempPass, note: 'Share with the user — ask them to change it immediately.' }, 200, env, origin);
}

// GET /api/admin/leaderboard?by=xp&limit=25
async function handleAdminLeaderboard(request, env, origin) {
  const url    = new URL(request.url);
  const by     = ['xp','wins','streak','games_played','high_score'].includes(url.searchParams.get('by'))
    ? url.searchParams.get('by') : 'xp';
  const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')));
  const colMap = { xp:'u.xp', wins:'s.wins', streak:'u.streak', games_played:'s.games_played', high_score:'s.high_score' };
  const rows   = await env.DB.prepare(
    `SELECT u.id,u.username,u.avatar,u.xp,u.streak,
            s.wins,s.losses,s.games_played,s.high_score
     FROM users u LEFT JOIN stats s ON s.user_id=u.id
     WHERE u.banned=0
     ORDER BY ${colMap[by]} DESC LIMIT ?`
  ).bind(limit).all();
  return json({ leaderboard: rows.results, by, limit }, 200, env, origin);
}

// GET /api/admin/games?page=1&limit=50&user=USERNAME
async function handleAdminGames(request, env, origin) {
  const url    = new URL(request.url);
  const page   = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
  const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
  const userId = url.searchParams.get('user')?.toUpperCase() || null;
  const offset = (page - 1) * limit;
  const where  = userId ? 'WHERE g.user_id=?' : '';
  const params = userId ? [userId, limit, offset] : [limit, offset];

  const [rows, countRow] = await Promise.all([
    env.DB.prepare(
      `SELECT g.*,u.username FROM games g
       LEFT JOIN users u ON u.id=g.user_id
       ${where} ORDER BY g.played_at DESC LIMIT ? OFFSET ?`
    ).bind(...params).all(),
    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM games g ${where}`).bind(...(userId ? [userId] : [])).first(),
  ]);
  return json({ games: rows.results, total: countRow.cnt, page, limit, pages: Math.ceil(countRow.cnt / limit) }, 200, env, origin);
}

// GET /api/admin/config
async function handleAdminGetConfig(request, env, origin) {
  const [gs, achs] = await Promise.all([
    env.DB.prepare("SELECT value,updated_at FROM config WHERE key='game_settings'").first(),
    env.DB.prepare("SELECT value,updated_at FROM config WHERE key='achievements'").first(),
  ]);
  return json({
    game_settings: gs   ? { ...JSON.parse(gs.value),   updated_at: gs.updated_at }   : null,
    achievements:  achs ? { items: JSON.parse(achs.value), updated_at: achs.updated_at } : null,
  }, 200, env, origin);
}

// PUT /api/admin/config
async function handleAdminUpdateConfig(request, env, origin) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return err('Expected config object', 400, env, origin);
  const allowed = ['win_score','ai_win_score','max_ball_speed','init_speed','xp_per_win','xp_per_game','xp_per_point'];
  const filtered = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(filtered).length) return err('No valid config keys', 400, env, origin);
  await env.DB.prepare("INSERT OR REPLACE INTO config (key,value,updated_at) VALUES ('game_settings',?,?)").bind(JSON.stringify(filtered), Date.now()).run();
  return json({ updated: true, config: filtered }, 200, env, origin);
}

// PUT /api/admin/achievements
async function handleAdminUpdateAchievements(request, env, origin) {
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body)) return err('Expected array of achievement definitions', 400, env, origin);
  for (const a of body) {
    if (!a.id || !a.icon || !a.label) return err(`Achievement missing id/icon/label`, 400, env, origin);
  }
  await env.DB.prepare("INSERT OR REPLACE INTO config (key,value,updated_at) VALUES ('achievements',?,?)").bind(JSON.stringify(body), Date.now()).run();
  return json({ updated: true, count: body.length }, 200, env, origin);
}

// POST /api/admin/users  (create admin user — only callable with existing admin JWT)
async function handleAdminCreateAdmin(request, env, origin) {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password || password.length < 8) return err('Username + password (min 8 chars) required', 400, env, origin);
  const id = username.toUpperCase();
  const existing = await env.DB.prepare('SELECT username FROM admins WHERE username=?').bind(id).first();
  if (existing) return err('ADMIN USERNAME TAKEN', 409, env, origin);
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  await env.DB.prepare('INSERT INTO admins (username,password_hash,salt,created_at) VALUES (?,?,?,?)').bind(id, hash, salt, Date.now()).run();
  return json({ created: id }, 201, env, origin);
}

// ═══════════════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { method } = request;
    const path = new URL(request.url).pathname;

    if (method === 'OPTIONS') {
      return new Response(null, { status:204, headers: corsHeaders(env, origin) });
    }

    try {
      // ── Public game routes ───────────────────────────────────
      if (method==='POST' && path==='/api/auth/register') return handleRegister(request, env, origin);
      if (method==='POST' && path==='/api/auth/login')    return handleLogin(request, env, origin);
      if (method==='GET'  && path==='/api/user/me')       return handleGetMe(request, env, origin);
      if (method==='POST' && path==='/api/game/save')     return handleSaveGame(request, env, origin);
      if (method==='POST' && path==='/api/admin/auth')    return handleAdminLogin(request, env, origin);

      // ── Admin routes (JWT required) ──────────────────────────
      if (path.startsWith('/api/admin/')) {
        const adminP = await requireAdmin(request, env);
        if (!adminP) return err('UNAUTHORIZED', 401, env, origin);

        if (method==='GET'  && path==='/api/admin/stats')        return handleAdminStats(request, env, origin);
        if (method==='GET'  && path==='/api/admin/users')        return handleAdminUsers(request, env, origin);
        if (method==='GET'  && path==='/api/admin/leaderboard')  return handleAdminLeaderboard(request, env, origin);
        if (method==='GET'  && path==='/api/admin/games')        return handleAdminGames(request, env, origin);
        if (method==='GET'  && path==='/api/admin/config')       return handleAdminGetConfig(request, env, origin);
        if (method==='PUT'  && path==='/api/admin/config')       return handleAdminUpdateConfig(request, env, origin);
        if (method==='PUT'  && path==='/api/admin/achievements') return handleAdminUpdateAchievements(request, env, origin);
        if (method==='POST' && path==='/api/admin/admins')       return handleAdminCreateAdmin(request, env, origin);

        // /api/admin/users/:id and /api/admin/users/:id/action
        const m = path.match(/^\/api\/admin\/users\/([^/]+)(?:\/([^/]+))?$/);
        if (m) {
          const userId = m[1].toUpperCase();
          const action = m[2];
          if (method==='GET'    && !action)                     return handleAdminGetUser(request, env, origin, userId);
          if (method==='DELETE' && !action)                     return handleAdminDeleteUser(request, env, origin, userId);
          if (method==='POST'   && action==='ban')              return handleAdminBan(request, env, origin, userId);
          if (method==='POST'   && action==='reset-password')   return handleAdminResetPassword(request, env, origin, userId);
        }

        return err('NOT FOUND', 404, env, origin);
      }

      return err('NOT FOUND', 404, env, origin);
    } catch(e) {
      console.error(e.stack || e.message);
      return err('INTERNAL SERVER ERROR', 500, env, origin);
    }
  },
};
