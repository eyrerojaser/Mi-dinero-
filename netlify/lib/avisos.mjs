import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { createHash } from 'node:crypto';
import { stageFor } from './vencimientos.mjs';

const store = () => getStore({ name: 'mi-dinero-avisos', consistency: 'strong' });
export const deviceKey = endpoint => 'd/' + createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

// Las claves de los avisos se crean solas la primera vez y se guardan en Netlify.
export async function keys() {
  const s = store();
  let k = await s.get('config/vapid', { type: 'json' });
  if (!k) {
    const n = webpush.generateVAPIDKeys();
    await s.setJSON('config/vapid', n, { onlyIfNew: true });
    k = await s.get('config/vapid', { type: 'json' });
  }
  return k;
}
async function ready() {
  const k = await keys();
  webpush.setVapidDetails(process.env.URL || 'https://mi-dinero.netlify.app', k.publicKey, k.privateKey);
}

const TXT = {
  es: { pre: (n, d) => d === 1 ? n + ' vence mañana' : n + ' vence en ' + d + ' días', hoy: n => n + ' vence hoy', vencido: n => n + ' está vencido', test: 'Así te llegarán los avisos de Mi Dinero.', body: 'Toca para abrir Mi Dinero.' },
  en: { pre: (n, d) => d === 1 ? n + ' is due tomorrow' : n + ' is due in ' + d + ' days', hoy: n => n + ' is due today', vencido: n => n + ' is overdue', test: 'This is how Mi Dinero reminders will look.', body: 'Tap to open Mi Dinero.' }
};
const money = (c, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-US', { style: 'currency', currency: 'USD' }).format(c / 100);

function localNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { today: p.year + '-' + p.month + '-' + p.day, hour: +p.hour };
}
function okTz(tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
export function clean(body) {
  const sub = body && body.subscription;
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') return null;
  const bills = (Array.isArray(body.bills) ? body.bills : []).slice(0, 100).map(b => ({
    id: str(b.id, 40), name: str(b.name, 60), cents: Math.max(0, Math.min(1e9, Math.round(+b.cents) || 0)),
    freq: b.freq === 'year' ? 'year' : 'month', day: Math.max(1, Math.min(31, Math.round(+b.day) || 1)),
    month: Math.max(0, Math.min(11, Math.round(+b.month) || 0)), remind: [0, 1, 3, 4, 7].includes(+b.remind) ? +b.remind : 3,
    since: /^\d{4}-\d{2}-\d{2}$/.test(b.since) ? b.since : '', paid: (Array.isArray(b.paid) ? b.paid : []).slice(-24).map(k => str(k, 7))
  }));
  return {
    subscription: { endpoint: sub.endpoint, keys: { p256dh: str(sub.keys.p256dh, 200), auth: str(sub.keys.auth, 100) } },
    tz: okTz(body.tz) ? str(body.tz, 64) : 'America/Chicago', lang: body.lang === 'en' ? 'en' : 'es', bills
  };
}

export async function save(rec) {
  const s = store(), key = deviceKey(rec.subscription.endpoint);
  const old = await s.get(key, { type: 'json' });
  await s.setJSON(key, { ...rec, sent: (old && old.sent) || {}, updated: new Date().toISOString() });
}
export async function remove(endpoint) { await store().delete(deviceKey(endpoint)); }

async function push(sub, payload) {
  try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 86400, urgency: 'normal' }); return 'ok'; }
  catch (e) { return e && (e.statusCode === 404 || e.statusCode === 410) ? 'gone' : 'error'; }
}
export async function sendTest(rec) {
  await ready();
  return push(rec.subscription, { title: 'Mi Dinero', body: TXT[rec.lang].test, tag: 'prueba' });
}

// Revisa todos los teléfonos y manda los avisos que tocan hoy, desde las 9 a.m. hora local.
export async function run(force) {
  await ready();
  const s = store(), { blobs } = await s.list({ prefix: 'd/' });
  let sent = 0;
  for (const { key } of blobs) {
    const rec = await s.get(key, { type: 'json' });
    if (!rec) continue;
    const { today, hour } = localNow(rec.tz);
    if (!force && (hour < 9 || hour > 21)) continue;
    const T = TXT[rec.lang] || TXT.es, keep = {};
    let changed = false, gone = false;
    for (const b of rec.bills) {
      const r = stageFor(b, today, k => b.paid.includes(k));
      if (!r.stage) continue;
      const id = b.id + '|' + r.key + '|' + r.stage;
      keep[id] = true;
      if (rec.sent[id]) continue;
      const title = r.stage === 'pre' ? T.pre(b.name, r.days) : T[r.stage](b.name);
      const res = await push(rec.subscription, { title, body: (b.cents ? money(b.cents, rec.lang) + ' · ' : '') + T.body, tag: 'pago-' + b.id });
      if (res === 'gone') { gone = true; break; }
      if (res === 'ok') { rec.sent[id] = today; sent++; changed = true; }
    }
    if (gone) { await s.delete(key); continue; }
    for (const id of Object.keys(rec.sent)) if (!keep[id]) { delete rec.sent[id]; changed = true; }
    if (changed) await s.setJSON(key, rec);
  }
  return sent;
}
