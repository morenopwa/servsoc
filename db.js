'use strict';
/**
 * Acceso a datos usando Supabase (Postgres) a través de su API REST
 * (PostgREST), llamada con fetch nativo de Node — sin instalar ninguna
 * librería (no se necesita npm install).
 *
 * Requiere las variables de entorno:
 *   SUPABASE_URL                 -> https://TU-PROYECTO.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    -> la "service_role key" (secreta, NUNCA
 *                                    la de "anon"), solo se usa aquí en el
 *                                    servidor, nunca se envía al navegador.
 *
 * Requiere haber creado antes las tablas ss_users y ss_records (ver
 * db/schema.sql).
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. Revisa el README.');
  }
}

async function rest(path, { method = 'GET', body, extraHeaders } = {}) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: Object.assign(
      {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      extraHeaders || {}
    ),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
  if (!res.ok) {
    const msg = (data && (data.message || data.error_description || data.hint)) || `Error de base de datos (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data;
}

/* ================================ Usuarios ================================ */
function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    dni: row.dni,
    name: row.name,
    role: row.role,
    salt: row.salt,
    hash: row.hash,
    mustChangePassword: !!row.must_change_password,
    active: row.active !== false,
    createdAt: row.created_at
  };
}
function userToRow(u) {
  const row = {};
  if (u.id !== undefined) row.id = u.id;
  if (u.dni !== undefined) row.dni = u.dni;
  if (u.name !== undefined) row.name = u.name;
  if (u.role !== undefined) row.role = u.role;
  if (u.salt !== undefined) row.salt = u.salt;
  if (u.hash !== undefined) row.hash = u.hash;
  if (u.mustChangePassword !== undefined) row.must_change_password = u.mustChangePassword;
  if (u.active !== undefined) row.active = u.active;
  return row;
}
async function listUsers() {
  const rows = await rest('ss_users?select=*&order=created_at.asc');
  return rows.map(userFromRow);
}
async function findUserByDni(dni) {
  const rows = await rest(`ss_users?dni=eq.${encodeURIComponent(dni)}&select=*&limit=1`);
  return userFromRow(rows[0]);
}
async function findUserById(id) {
  const rows = await rest(`ss_users?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return userFromRow(rows[0]);
}
async function createUser(user) {
  const rows = await rest('ss_users', {
    method: 'POST',
    extraHeaders: { Prefer: 'return=representation' },
    body: [userToRow(user)]
  });
  return userFromRow(rows[0]);
}
async function patchUser(id, patch) {
  const rows = await rest(`ss_users?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    extraHeaders: { Prefer: 'return=representation' },
    body: userToRow(patch)
  });
  return userFromRow(rows[0]);
}
async function removeUser(id) {
  await rest(`ss_users?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ================================ Registros ================================ */
function recordFromRow(row) {
  return Object.assign({}, row.payload, {
    id: row.id,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at || undefined,
    updatedBy: row.updated_by || undefined,
    updatedAt: row.updated_at || undefined
  });
}
async function listRecords() {
  const rows = await rest('ss_records?select=*&order=created_at.asc');
  return rows.map(recordFromRow);
}
async function findRecordById(id) {
  const rows = await rest(`ss_records?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return rows[0] ? recordFromRow(rows[0]) : null;
}
async function insertRecord(record, username) {
  const rows = await rest('ss_records', {
    method: 'POST',
    extraHeaders: { Prefer: 'return=representation' },
    body: [{ id: record.id, payload: record, created_by: username, created_at: new Date().toISOString() }]
  });
  return recordFromRow(rows[0]);
}
async function updateRecord(id, record, username) {
  const rows = await rest(`ss_records?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    extraHeaders: { Prefer: 'return=representation' },
    body: { payload: record, updated_by: username, updated_at: new Date().toISOString() }
  });
  return recordFromRow(rows[0]);
}
async function removeRecord(id) {
  await rest(`ss_records?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}
async function replaceAllRecords(records) {
  await rest('ss_records?id=not.is.null', { method: 'DELETE' });
  if (records.length) {
    const rows = records.map(r => ({
      id: r.id,
      payload: r,
      created_by: r.createdBy || null,
      created_at: r.createdAt || new Date().toISOString()
    }));
    await rest('ss_records', { method: 'POST', extraHeaders: { Prefer: 'return=minimal' }, body: rows });
  }
  return records.length;
}

module.exports = {
  listUsers, findUserByDni, findUserById, createUser, patchUser, removeUser,
  listRecords, findRecordById, insertRecord, updateRecord, removeRecord, replaceAllRecords
};
