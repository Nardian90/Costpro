const fs = require('fs');
function getSize(f) {
  const buf = fs.readFileSync(f);
  const w = buf.readUInt16BE(buf.indexOf(Buffer.from('c000', 'hex')) + 5);
  const h = buf.readUInt16BE(buf.indexOf(Buffer.from('c000', 'hex')) + 3);
  return w + 'x' + h;
}
try {
  console.log('desktop:', getSize('c:/Users/Adrian/Projects/Costpro2/Costpro2/public/screenshots/desktop.png'));
  console.log('mobile:', getSize('c:/Users/Adrian/Projects/Costpro2/Costpro2/public/screenshots/mobile.png'));
} catch(e) {
  console.log(e);
}
