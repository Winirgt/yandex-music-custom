import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const tmp = path.join(os.tmpdir(), 'opencode');
const src = path.join(process.env.LOCALAPPDATA, 'Programs', 'YandexMusic');
const appCopy = path.join(tmp, 'ymod-test-app');
const extract = path.join(tmp, 'ymod-test-extract');
const marker = path.join(tmp, 'ymod-probe-marker.txt');
fs.rmSync(extract, { recursive: true, force: true });
fs.rmSync(marker, { force: true });
console.log('using existing copy');
asar.extractAll(path.join(appCopy, 'resources', 'app.asar'), extract);
const pkg = JSON.parse(fs.readFileSync(path.join(extract, 'package.json'), 'utf8'));
console.log('official main entry:', pkg.main);
const entry = path.join(extract, pkg.main);
fs.writeFileSync(path.join(extract, 'ymod-probe.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'probe-ok ' + Date.now());\n`);
fs.appendFileSync(entry, `\n;require('./ymod-probe.js');\n`);
await asar.createPackage(extract, path.join(appCopy, 'resources', 'app.asar'));
console.log('repacked');
const exeName = fs.readdirSync(appCopy).find(f => f.endsWith('.exe') && fs.statSync(path.join(appCopy, f)).size > 100*1024*1024);
const exePath = path.join(appCopy, exeName);
function runOnce(label) {
  return new Promise((resolve) => {
    const child = spawn(exePath, ['--remote-debugging-port=9227'], { cwd: appCopy, stdio: 'ignore' });
    const t = setTimeout(() => { try { process.kill(child.pid); } catch {} resolve(false); }, 15000);
    const poll = setInterval(() => {
      if (fs.existsSync(marker)) { clearInterval(poll); clearTimeout(t); try { process.kill(child.pid); } catch {} resolve(true); }
    }, 500);
    child.on('exit', () => { clearInterval(poll); clearTimeout(t); resolve(fs.existsSync(marker)); });
  });
}
let ok = await runOnce('no-flip');
console.log('RUN WITHOUT FUSE FLIP -> marker:', ok);
if (!ok) {
  const buf = fs.readFileSync(exePath);
  const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'ascii');
  const idx = buf.indexOf(sentinel);
  const fuseStart = idx + sentinel.length + 2;
  console.log('integrity fuse byte before:', buf[fuseStart + 4]);
  buf[fuseStart + 4] = 48; // '0' disable EnableEmbeddedAsarIntegrityValidation
  fs.writeFileSync(exePath, buf);
  fs.rmSync(marker, { force: true });
  ok = await runOnce('flip');
  console.log('RUN WITH FUSE FLIP -> marker:', ok);
}
console.log('RESULT:', ok ? 'INJECTION FEASIBLE' : 'INJECTION FAILED');
