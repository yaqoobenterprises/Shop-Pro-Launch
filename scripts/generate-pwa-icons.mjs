import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets');
const background = [26, 43, 86], ink = [255, 255, 255], accent = [144, 179, 255];
const mark = 'M348 154H225C143 154 143 256 225 256H287C369 256 369 358 287 358H164';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#1a2b56"/><path d="${mark}" fill="none" stroke="#fff" stroke-width="48" stroke-linecap="round"/><circle cx="386" cy="386" r="18" fill="#90b3ff"/></svg>\n`;
// Sample the same cubic geometry for dependency-free, reproducible PNG artwork.
const points = [[348 / 512, 154 / 512], [225 / 512, 154 / 512]];
function curve(a, b, c, d) {
  for (let n = 1; n <= 24; n++) {
    const t = n / 24, u = 1 - t;
    points.push([0, 1].map(i => u ** 3 * a[i] + 3 * u ** 2 * t * b[i] + 3 * u * t ** 2 * c[i] + t ** 3 * d[i]));
  }
}
curve([225 / 512, 154 / 512], [143 / 512, 154 / 512], [143 / 512, .5], [225 / 512, .5]);
points.push([287 / 512, .5]);
curve([287 / 512, .5], [369 / 512, .5], [369 / 512, 358 / 512], [287 / 512, 358 / 512]);
points.push([164 / 512, 358 / 512]);
function segmentDistance(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
  return c;
});
function chunk(type, data) {
  const output = Buffer.alloc(12 + data.length); output.writeUInt32BE(data.length); output.write(type, 4); data.copy(output, 8);
  let crc = 0xffffffff; for (const value of output.subarray(4, 8 + data.length)) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8;
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length); return output;
}
function png(size, maskable = false) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const total = [0, 0, 0, 0];
    for (const [ox, oy] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) {
      const px = (x + ox) / size, py = (y + oy) / size;
      const dx = Math.max(0, Math.abs(px - .5) - (.5 - 112 / 512));
      const dy = Math.max(0, Math.abs(py - .5) - (.5 - 112 / 512));
      if (!maskable && Math.hypot(dx, dy) > 112 / 512) continue;
      const white = points.slice(1).some((point, i) => segmentDistance(px, py, points[i], point) <= 24 / 512);
      const blue = Math.hypot(px - 386 / 512, py - 386 / 512) <= 18 / 512;
      const color = white ? ink : blue ? accent : background;
      color.forEach((value, i) => { total[i] += value; }); total[3] += 255;
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    for (let i = 0; i < 4; i++) raw[offset + i] = Math.round(total[i] / 4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'shop-pro-mark-v2.svg'), svg);
for (const size of [180, 192, 512]) fs.writeFileSync(path.join(root, `shop-pro-v2-${size}.png`), png(size));
fs.writeFileSync(path.join(root, 'shop-pro-v2-maskable.png'), png(512, true));
console.log('Generated vector, Apple touch, regular and maskable Shop Pro monogram assets.');
