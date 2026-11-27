export interface Point { x: number; y: number }

/** Approved Clarity scales include zero and keep integer minor-unit ticks. */
export function niceScale(values: number[]) {
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const raw = (max - min || 100) / 4, power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find(n => n >= raw / power) || 10) * power);
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi === lo) hi = lo + step * 4;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * .01; v += step) ticks.push(v);
  return { lo, hi, step, ticks };
}

/** Bounded monotone cubics: a curve cannot suggest a value beyond adjacent observations. */
export function monotoneSegments(points: Point[]) {
  if (points.length < 2) return [];
  const d = points.slice(1).map((p, i) => (p.y - points[i].y) / (p.x - points[i].x));
  const m = points.map((_, i) => i === 0 ? d[0] : i === points.length - 1 ? d[d.length - 1] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  d.forEach((s, i) => {
    if (s === 0) { m[i] = 0; m[i + 1] = 0; }
    else {
      const a = m[i] / s, b = m[i + 1] / s, n = a * a + b * b;
      if (n > 9) { const t = 3 / Math.sqrt(n); m[i] = t * a * s; m[i + 1] = t * b * s; }
    }
  });
  return points.slice(1).map((p, i) => {
    const q = points[i], h = (p.x - q.x) / 3;
    return { start: q, c1: { x: q.x + h, y: q.y + h * m[i] }, c2: { x: p.x - h, y: p.y - h * m[i + 1] }, end: p };
  });
}

export function monotonePath(points: Point[]) {
  if (!points.length) return "";
  return `M ${points[0].x} ${points[0].y}` + monotoneSegments(points)
    .map(s => ` C ${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.end.x} ${s.end.y}`).join("");
}
