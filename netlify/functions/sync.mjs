import { clean, save, remove, sendTest } from '../lib/avisos.mjs';
export default async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'json' }, { status: 400 }); }
  if (body && body.action === 'off') {
    if (typeof body.endpoint === 'string') await remove(body.endpoint);
    return Response.json({ ok: true });
  }
  const rec = clean(body);
  if (!rec) return Response.json({ error: 'subscription' }, { status: 400 });
  await save(rec);
  if (body.action === 'test') {
    const r = await sendTest(rec);
    return Response.json({ ok: r === 'ok', result: r }, { status: r === 'ok' ? 200 : 502 });
  }
  return Response.json({ ok: true });
};
export const config = { path: '/api/sync' };
