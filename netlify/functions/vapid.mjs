import { keys } from '../lib/avisos.mjs';
export default async () => {
  const k = await keys();
  return Response.json({ publicKey: k.publicKey }, { headers: { 'cache-control': 'no-store' } });
};
export const config = { path: '/api/vapid' };
