import { readFile, mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const ids = ['note', 'hammer', 'chess', 'chessAi', 'g2048', 'canvas', 'camera', 'dice'];
const root = new URL('../', import.meta.url);
await mkdir(new URL('client/public/items/', root), { recursive: true });
for (const id of ids) {
  const svg = await readFile(new URL(`client/assets/items/${id}.svg`, root));
  const png = await sharp(svg).resize(360, 240).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  await writeFile(new URL(`client/public/items/${id}.png`, root), png);
  console.log(`${id}.png (360 × 240)`);
}
