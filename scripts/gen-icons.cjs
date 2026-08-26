// Gera ícones PNG reais (não placeholders) em tamanhos exatos.
// Usa apenas zlib (built-in). Desenha fundo gradiente sólido + marca "M" branca.
const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(size, draw) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Marca "M" centrada: desenha duas barras oblíquas + base.
function isM(x, y, s) {
  const m = Math.floor(s * 0.20), w = Math.floor(s * 0.07);
  const x0 = Math.floor(s * 0.26), x1 = Math.floor(s * 0.74);
  const yt = Math.floor(s * 0.22), yb = Math.floor(s * 0.80);
  const inLeft = x >= x0 && x < x0 + w && y >= yt && y <= yb;
  const dx = x1 - x0;
  const dy = yb - yt;
  const inRight = x <= x1 && x > x1 - w && y >= yt && y <= yb;
  // barras diagonais
  const tL = (y - yt) / dy, tR = (y - yt) / dy;
  const onLeftDiag = Math.abs((x - x0) - tL * dx) <= w && y >= yt && y <= yb;
  const onRightDiag = Math.abs((x1 - x) - tR * dx) <= w && y >= yt && y <= yb;
  return inLeft || inRight || onLeftDiag || onRightDiag;
}

function draw(size) {
  return (x, y, s) => {
    // fundo: azul-marca com leve gradiente vertical
    const top = [37, 99, 235], bot = [29, 78, 190];
    const t = y / s;
    const r = Math.round(top[0] + (bot[0] - top[0]) * t);
    const g = Math.round(top[1] + (bot[1] - top[1]) * t);
    const b = Math.round(top[2] + (bot[2] - top[2]) * t);
    if (isM(x, y, s)) return [255, 255, 255, 255];
    return [r, g, b, 255];
  };
}

for (const size of [16, 32, 48, 96, 128]) {
  fs.writeFileSync(`apps/extension/public/icon-${size}.png`, png(size, draw(size)));
  console.log('icon', size, 'bytes', fs.statSync(`apps/extension/public/icon-${size}.png`).size);
}
