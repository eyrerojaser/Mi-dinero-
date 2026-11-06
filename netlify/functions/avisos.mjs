import { run } from '../lib/avisos.mjs';
// Se ejecuta cada hora. Cada teléfono recibe sus avisos desde las 9 a.m. de su hora local.
export default async () => { const n = await run(false); console.log('avisos enviados:', n); };
export const config = { schedule: '@hourly' };
