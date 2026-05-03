const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'bot.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      phone TEXT PRIMARY KEY,
      stage TEXT NOT NULL DEFAULT 'welcome',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS codes (
      code TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      name TEXT NOT NULL,
      redeemed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduled (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'followup',
      send_at TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_stage ON sessions(stage);
    CREATE INDEX IF NOT EXISTS idx_codes_phone ON codes(phone);
    CREATE INDEX IF NOT EXISTS idx_scheduled_pending ON scheduled(sent, send_at);
  `);
}

// Session functions
function getSession(phone) {
  const row = getDb().prepare('SELECT * FROM sessions WHERE phone = ?').get(phone);
  if (row) {
    row.data = JSON.parse(row.data);
  }
  return row;
}

function upsertSession(phone, stage, data) {
  const db = getDb();
  const existing = db.prepare('SELECT phone FROM sessions WHERE phone = ?').get(phone);
  if (existing) {
    db.prepare(`
      UPDATE sessions SET stage = ?, data = ?, updated_at = datetime('now')
      WHERE phone = ?
    `).run(stage, JSON.stringify(data), phone);
  } else {
    db.prepare(`
      INSERT INTO sessions (phone, stage, data) VALUES (?, ?, ?)
    `).run(phone, stage, JSON.stringify(data));
  }
}

function deleteSession(phone) {
  getDb().prepare('DELETE FROM sessions WHERE phone = ?').run(phone);
}

function getAllSessions() {
  const rows = getDb().prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
  return rows.map(r => ({ ...r, data: JSON.parse(r.data) }));
}

// Code functions
function insertCode(code, phone, name) {
  getDb().prepare('INSERT INTO codes (code, phone, name) VALUES (?, ?, ?)').run(code, phone, name);
}

function getCode(code) {
  return getDb().prepare('SELECT * FROM codes WHERE code = ?').get(code);
}

function codeExists(code) {
  return !!getDb().prepare('SELECT 1 FROM codes WHERE code = ?').get(code);
}

function redeemCode(code) {
  getDb().prepare('UPDATE codes SET redeemed = 1 WHERE code = ?').run(code);
}

function getAllCodes() {
  return getDb().prepare('SELECT * FROM codes ORDER BY created_at DESC').all();
}

// Scheduled functions
function insertScheduled(phone, type, sendAt) {
  getDb().prepare('INSERT INTO scheduled (phone, type, send_at) VALUES (?, ?, ?)').run(phone, type, sendAt);
}

function getPendingScheduled() {
  return getDb().prepare(`
    SELECT * FROM scheduled
    WHERE sent = 0 AND send_at <= datetime('now')
    ORDER BY send_at ASC
  `).all();
}

function markScheduledSent(id) {
  getDb().prepare('UPDATE scheduled SET sent = 1 WHERE id = ?').run(id);
}

// Stats
function getStats() {
  const db = getDb();
  const totalVisitors = db.prepare('SELECT COUNT(*) as count FROM codes').get().count;
  const totalDistributors = db.prepare(`
    SELECT COUNT(*) as count FROM sessions
    WHERE json_extract(data, '$.wants_distribution') = 'Sim'
  `).get().count;
  const totalSurveys = db.prepare(`
    SELECT COUNT(*) as count FROM sessions
    WHERE json_extract(data, '$.wants_distribution') = 'Não'
  `).get().count;
  const totalCompleted = db.prepare(`
    SELECT COUNT(*) as count FROM sessions WHERE stage = 'completed'
  `).get().count;
  const pendingFollowups = db.prepare(`
    SELECT COUNT(*) as count FROM scheduled WHERE sent = 0
  `).get().count;

  return {
    totalVisitors,
    totalDistributors,
    totalSurveys,
    totalCompleted,
    pendingFollowups
  };
}

function getLeads() {
  const rows = getDb().prepare(`
    SELECT s.phone, s.stage, s.data, s.created_at, s.updated_at,
           c.code, c.redeemed
    FROM sessions s
    LEFT JOIN codes c ON c.phone = s.phone
    ORDER BY s.updated_at DESC
  `).all();
  return rows.map(r => ({
    ...r,
    data: JSON.parse(r.data)
  }));
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  getSession,
  upsertSession,
  deleteSession,
  getAllSessions,
  insertCode,
  getCode,
  codeExists,
  redeemCode,
  getAllCodes,
  insertScheduled,
  getPendingScheduled,
  markScheduledSent,
  getStats,
  getLeads,
  closeDb
};
