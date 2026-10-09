import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.js'

const dataDir = path.resolve(config.dataDir)
fs.mkdirSync(dataDir, { recursive: true })
const db = new Database(path.join(dataDir, 'bot.sqlite'))

db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price REAL NOT NULL,
  original_price REAL,
  discount_percent REAL NOT NULL,
  category_id TEXT,
  permalink TEXT,
  affiliate_url TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  whatsapp_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_item_sent ON posts(item_id, sent_at);

CREATE TABLE IF NOT EXISTS affiliate_links (
  item_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  last_validated_at TEXT
);
`)

export function wasPostedRecently(itemId, days) {
  const row = db.prepare(`
    SELECT 1
    FROM posts
    WHERE item_id = ?
      AND COALESCE(whatsapp_message_id, '') <> 'dry-run'
      AND datetime(sent_at) >= datetime('now', ?)
    LIMIT 1
  `).get(itemId, `-${Math.max(0, days)} days`)
  return Boolean(row)
}

export function savePost(post) {
  db.prepare(`
    INSERT INTO posts (
      item_id, title, price, original_price, discount_percent,
      category_id, permalink, affiliate_url, sent_at, whatsapp_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    post.itemId,
    post.title,
    post.price,
    post.originalPrice ?? null,
    post.discountPercent,
    post.categoryId ?? null,
    post.permalink ?? null,
    post.affiliateUrl,
    new Date().toISOString(),
    post.whatsappMessageId ?? null,
  )
}

export function saveAffiliateLink(itemId, url, label = null) {
  db.prepare(`
    INSERT INTO affiliate_links(item_id, url, label, created_at, last_validated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      url = excluded.url,
      label = excluded.label,
      last_validated_at = excluded.last_validated_at
  `).run(itemId, url, label, new Date().toISOString(), new Date().toISOString())
}

export function getAffiliateLink(itemId) {
  return db.prepare('SELECT * FROM affiliate_links WHERE item_id = ?').get(itemId) || null
}

export function recentPosts(limit = 50) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 50
  return db.prepare(`
    SELECT * FROM posts
    WHERE COALESCE(whatsapp_message_id, '') <> 'dry-run'
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit)
}

export function stats() {
  const total = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE COALESCE(whatsapp_message_id, '') <> 'dry-run'").get().n
  const today = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE COALESCE(whatsapp_message_id, '') <> 'dry-run' AND date(sent_at, 'localtime') = date('now', 'localtime')`).get().n
  const links = db.prepare('SELECT COUNT(*) AS n FROM affiliate_links').get().n
  return { totalPosts: total, postsToday: today, affiliateLinks: links }
}

export default db
