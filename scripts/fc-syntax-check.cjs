/* fc-syntax-check — valida que todos los <script> de FC.html son JS válido */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const file = process.argv[2] || '/home/z/my-project/Costpro/public/fc/FC.html';
const html = fs.readFileSync(file, 'utf8');
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, ok = 0, fail = 0;
while ((m = re.exec(html)) !== null) {
  const code = m[1];
  if (!code.trim()) continue;
  i++;
  const tmp = path.join(os.tmpdir(), `fc-chunk-${i}.js`);
  fs.writeFileSync(tmp, code);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    ok++;
  } catch (e) {
    fail++;
    console.error(`CHUNK ${i}: SYNTAX ERROR\n${e.stderr.toString().slice(0, 800)}`);
  }
}
console.log(`chunks=${i} ok=${ok} fail=${fail}`);
process.exit(fail ? 1 : 0);
