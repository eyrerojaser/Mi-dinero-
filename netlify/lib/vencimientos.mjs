// Cálculo de vencimientos. La misma lógica está en index.html: si cambias una, cambia la otra.
function pad(n) { return (n < 10 ? '0' : '') + n; }
function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
function dim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
function at(y, m, day) {
  const d = new Date(Date.UTC(y, m, 1)); y = d.getUTCFullYear(); m = d.getUTCMonth();
  return iso(y, m, Math.min(day, dim(y, m)));
}
export function daysBetween(a, b) {
  const p = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((p(b) - p(a)) / 864e5);
}
function cycle(b, y, m) {
  if (b.freq === 'year') return { key: String(y), date: at(y, b.month, b.day) };
  const d = new Date(Date.UTC(y, m, 1));
  return { key: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1), date: at(d.getUTCFullYear(), d.getUTCMonth(), b.day) };
}
// today: 'YYYY-MM-DD'. isPaid(key) dice si ese ciclo ya se pagó.
export function nextDue(b, today, isPaid) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  const cur = cycle(b, y, m);
  const next = b.freq === 'year' ? cycle(b, y + 1, m) : cycle(b, y, m + 1);
  const applies = !b.since || cur.date >= b.since;
  if (applies && !isPaid(cur.key)) return { key: cur.key, date: cur.date, days: daysBetween(today, cur.date), paidNow: false };
  return { key: next.key, date: next.date, days: daysBetween(today, next.date), paidNow: applies && isPaid(cur.key) };
}
// Días de aviso permitidos: 3, 4 o 5 antes del vencimiento. Nunca el mismo día.
export function normRemind(v) { v = +v; return v === 3 || v === 4 || v === 5 ? v : v > 5 ? 5 : 3; }
// Qué aviso toca hoy para este pago: 'pre' o null. Llega desde el día elegido hasta el día antes de vencer.
export function stageFor(b, today, isPaid) {
  const r = nextDue(b, today, isPaid), remind = normRemind(b.remind);
  return { ...r, stage: r.days > 0 && r.days <= remind ? 'pre' : null };
}
