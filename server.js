'use strict';
/**
 * Control de Atenciones - Servicio Social
 * Servidor sin dependencias externas (solo módulos nativos de Node.js).
 * - Autenticación por DNI + contraseña (contraseña inicial = DNI, cambiable luego).
 * - Sesiones por cookie httpOnly, en memoria del proceso.
 * - Contraseñas nunca se guardan en texto plano (scrypt + sal por usuario).
 * - Datos persistidos en una base de datos Postgres en Supabase (ver db.js),
 *   así que sobreviven a reinicios y redeploys del servidor.
 * - Detrás de un proxy con HTTPS (Render/Railway/Fly/Nginx/Caddy), confía en
 *   X-Forwarded-Proto para marcar la cookie de sesión como "Secure".
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

const PORT = process.env.PORT || 3000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos

/* ============================= Contraseñas =============================== */
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function createUserRecord(dni, name, password, role) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id: crypto.randomUUID(),
    dni: String(dni).trim(),
    name: (name || String(dni)).trim(),
    role: role === 'admin' ? 'admin' : 'asistente',
    salt,
    hash: hashPassword(password, salt),
    mustChangePassword: true,
    active: true
  };
}
function verifyPassword(user, password) {
  const candidate = hashPassword(password, user.salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* =========================== Usuario administrador ========================= */
async function ensureAdminUser() {
  const users = await db.listUsers();
  if (users.length === 0) {
    const adminDni = String(process.env.ADMIN_DNI || '00000000');
    const admin = createUserRecord(adminDni, 'Administrador(a)', adminDni, 'admin');
    await db.createUser(admin);
    console.log('============================================================');
    console.log(' Usuario administrador inicial creado en la base de datos');
    console.log(' DNI (usuario):   ' + adminDni);
    console.log(' Contraseña:      ' + adminDni + '  (cámbiala después de entrar)');
    console.log(' Puedes fijar otro DNI de administrador con la variable ADMIN_DNI');
    console.log('============================================================');
  }
}

/* =============================== Sesiones ================================ */
const sessions = new Map(); // token -> { userId, expires }
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
  return token;
}
function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  s.expires = Date.now() + SESSION_TTL_MS; // renueva mientras haya actividad
  return s;
}
function destroySession(token) { sessions.delete(token); }
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) if (now > s.expires) sessions.delete(token);
}, 30 * 60 * 1000).unref();

/* ========================= Límite de intentos de login ==================== */
const loginAttempts = new Map(); // dni -> { count, lockUntil }
function isLockedOut(dni) {
  const a = loginAttempts.get(dni);
  return !!(a && a.lockUntil && Date.now() < a.lockUntil);
}
function registerFailedAttempt(dni) {
  const a = loginAttempts.get(dni) || { count: 0, lockUntil: 0 };
  a.count++;
  if (a.count >= MAX_LOGIN_ATTEMPTS) { a.lockUntil = Date.now() + LOCKOUT_MS; a.count = 0; }
  loginAttempts.set(dni, a);
}
function clearAttempts(dni) { loginAttempts.delete(dni); }

/* ============================ Utilidades HTTP ============================= */
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(p => {
    const idx = p.indexOf('=');
    if (idx > -1) out[p.slice(0, idx).trim()] = decodeURIComponent(p.slice(idx + 1).trim());
  });
  return out;
}
function isHttps(req) {
  return !!(req.socket && req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https';
}
function setSessionCookie(res, token, secure) {
  res.setHeader('Set-Cookie',
    `session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`);
}
function clearSessionCookie(res, secure) {
  res.setHeader('Set-Cookie', `session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
}
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2_000_000) { tooBig = true; reject(new Error('Cuerpo demasiado grande')); req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) return;
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}
async function currentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (!token) return null;
  const s = getSession(token);
  if (!s) return null;
  const user = await db.findUserById(s.userId);
  return (user && user.active !== false) ? { user, token } : null;
}
function publicUser(u) {
  return { id: u.id, dni: u.dni, name: u.name, role: u.role, mustChangePassword: !!u.mustChangePassword };
}
function textField(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max || 300) : '';
}

/* ============================== Registros ================================ */
function sanitizeRecord(r) {
  const s = (v, max) => textField(v, max);
  return {
    id: (typeof r.id === 'string' && r.id) ? r.id.slice(0, 80) : crypto.randomUUID(),
    date: s(r.date, 10),
    name: s(r.name, 150),
    dni: s(r.dni, 20),
    bed: s(r.bed, 30),
    birthDate: s(r.birthDate, 10),
    ageValue: (r.ageValue === '' || r.ageValue === null || r.ageValue === undefined) ? '' : Math.max(0, Math.min(999, Number(r.ageValue) || 0)),
    ageUnit: r.ageUnit === 'meses' ? 'meses' : 'años',
    diagnosis: s(r.diagnosis, 200),
    province: s(r.province, 100),
    district: s(r.district, 100),
    patient: s(r.patient, 60),
    type: s(r.type, 40),
    service: s(r.service, 60),
    actions: Array.isArray(r.actions) ? r.actions.filter(x => typeof x === 'string').slice(0, 50) : [],
    morbidity: Array.isArray(r.morbidity) ? r.morbidity.filter(x => typeof x === 'string').slice(0, 50) : [],
    acta: (r.acta && typeof r.acta === 'object') ? {
      deliveryDate: s(r.acta.deliveryDate, 10),
      details: s(r.acta.details, 3000),
      observations: s(r.acta.observations, 3000),
      deliveredBy: s(r.acta.deliveredBy, 150),
      receivedBy: s(r.acta.receivedBy, 150),
      updatedAt: new Date().toISOString()
    } : null
  };
}

/* ================================= API ==================================== */
async function handleApi(req, res, pathname) {
  const method = req.method;
  const secure = isHttps(req);

  if (pathname === '/api/health' && method === 'GET') {
    try {
      await db.listUsers();
      return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/login' && method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    const dni = textField(body.dni, 20);
    const password = String(body.password || '');
    if (!dni || !password) return sendJson(res, 400, { error: 'DNI y contraseña son obligatorios' });
    if (isLockedOut(dni)) return sendJson(res, 429, { error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' });
    const user = await db.findUserByDni(dni);
    if (!user || user.active === false || !verifyPassword(user, password)) {
      registerFailedAttempt(dni);
      return sendJson(res, 401, { error: 'DNI o contraseña incorrectos' });
    }
    clearAttempts(dni);
    const token = createSession(user.id);
    setSessionCookie(res, token, secure);
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const cookies = parseCookies(req);
    if (cookies.session) destroySession(cookies.session);
    clearSessionCookie(res, secure);
    return sendJson(res, 200, { ok: true });
  }

  // Todo lo demás requiere sesión activa
  const auth = await currentUser(req);
  if (!auth) return sendJson(res, 401, { error: 'Sesión no válida. Vuelve a iniciar sesión.' });
  const { user } = auth;

  if (pathname === '/api/me' && method === 'GET') {
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/change-password' && method === 'POST') {
    const body = await readJsonBody(req).catch(() => ({}));
    const current = String(body.currentPassword || '');
    const next = String(body.newPassword || '');
    if (next.length < 4) return sendJson(res, 400, { error: 'La nueva contraseña debe tener al menos 4 caracteres' });
    if (!verifyPassword(user, current)) return sendJson(res, 401, { error: 'La contraseña actual no es correcta' });
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(next, salt);
    await db.patchUser(user.id, { salt, hash, mustChangePassword: false });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/records' && method === 'GET') {
    const records = await db.listRecords();
    return sendJson(res, 200, { records });
  }

  if (pathname === '/api/records' && method === 'POST') {
    const body = await readJsonBody(req).catch(() => null);
    if (!body) return sendJson(res, 400, { error: 'JSON inválido' });
    const clean = sanitizeRecord(body);
    const existing = await db.findRecordById(clean.id);
    const saved = existing
      ? await db.updateRecord(clean.id, clean, user.dni)
      : await db.insertRecord(clean, user.dni);
    return sendJson(res, 200, { ok: true, record: saved });
  }

  if (pathname.startsWith('/api/records/') && pathname !== '/api/records/import' && method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/api/records/'.length));
    await db.removeRecord(id);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/records/import' && method === 'POST') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Solo un administrador puede importar un respaldo completo' });
    const body = await readJsonBody(req).catch(() => null);
    if (!body || !Array.isArray(body.records)) return sendJson(res, 400, { error: 'Formato inválido' });
    const records = body.records.slice(0, 20000).map(sanitizeRecord);
    const count = await db.replaceAllRecords(records);
    return sendJson(res, 200, { ok: true, count });
  }

  // Administración de usuarios (solo admin)
  if (pathname === '/api/users' && method === 'GET') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'No autorizado' });
    const users = await db.listUsers();
    return sendJson(res, 200, { users: users.map(publicUser) });
  }
  if (pathname === '/api/users' && method === 'POST') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'No autorizado' });
    const body = await readJsonBody(req).catch(() => ({}));
    const dni = textField(body.dni, 20);
    const name = textField(body.name, 150);
    if (!/^[0-9A-Za-z-]{4,20}$/.test(dni)) return sendJson(res, 400, { error: 'DNI inválido' });
    const exists = await db.findUserByDni(dni);
    if (exists) return sendJson(res, 409, { error: 'Ya existe un usuario con ese DNI' });
    const newUser = createUserRecord(dni, name || dni, dni, 'asistente');
    const saved = await db.createUser(newUser);
    return sendJson(res, 200, { user: publicUser(saved) });
  }
  if (pathname.startsWith('/api/users/') && pathname.endsWith('/reset-password') && method === 'POST') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'No autorizado' });
    const id = decodeURIComponent(pathname.slice('/api/users/'.length, -'/reset-password'.length));
    const target = await db.findUserById(id);
    if (!target) return sendJson(res, 404, { error: 'Usuario no encontrado' });
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(target.dni, salt);
    await db.patchUser(id, { salt, hash, mustChangePassword: true });
    return sendJson(res, 200, { ok: true, newPassword: target.dni });
  }
  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'No autorizado' });
    const id = decodeURIComponent(pathname.slice('/api/users/'.length));
    if (id === user.id) return sendJson(res, 400, { error: 'No puedes eliminar tu propio usuario' });
    await db.removeUser(id);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Ruta no encontrada' });
}

/* ========================= Archivos estáticos (front) ===================== */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};
function serveStatic(req, res, pathname) {
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath === '/' || safePath === '' ? 'index.html' : safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}

/* ================================ Servidor ================================ */
const requestHandler = (req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (e) { pathname = '/'; }
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(err => {
      console.error(err);
      sendJson(res, 500, { error: 'Error interno del servidor. Revisa que SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén bien configurados.' });
    });
  } else {
    serveStatic(req, res, pathname);
  }
};

ensureAdminUser().catch(err => {
  console.error('No se pudo verificar/crear el usuario administrador en la base de datos.');
  console.error('Revisa SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y que hayas corrido db/schema.sql en Supabase.');
  console.error('Detalle: ' + err.message);
});

if (process.env.CERT_PATH && process.env.KEY_PATH) {
  const options = { cert: fs.readFileSync(process.env.CERT_PATH), key: fs.readFileSync(process.env.KEY_PATH) };
  https.createServer(options, requestHandler).listen(PORT, () => console.log(`Servidor HTTPS escuchando en el puerto ${PORT}`));
} else {
  http.createServer(requestHandler).listen(PORT, () => console.log(`Servidor HTTP escuchando en el puerto ${PORT} (usa un proxy/hosting con HTTPS delante en producción)`));
}
