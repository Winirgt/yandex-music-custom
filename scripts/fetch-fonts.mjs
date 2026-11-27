import fs from 'node:fs';
import path from 'node:path';
const outDir = 'src/renderer/src/fonts';
fs.mkdirSync(outDir, { recursive: true });
const families = ['Comfortaa', 'Montserrat', 'Unbounded', 'Rubik', 'Manrope'];
for (const fam of families) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${fam}:wght@400;700&display=swap`;
  const css = await (await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/4.0' } })).text();
  const blocks = css.split('@font-face').slice(1);
  for (const b of blocks) {
    const weight = /font-weight:\s*(\d+)/.exec(b)?.[1];
    const url = /url\((https:[^)]+)\)/.exec(b)?.[1];
    if (!weight || !url) continue;
    const ext = url.endsWith('.woff2') ? 'woff2' : url.endsWith('.woff') ? 'woff' : 'ttf';
    const file = path.join(outDir, `${fam}-${weight}.${ext}`);
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(file, buf);
    console.log(fam, weight, ext, buf.length);
  }
}
