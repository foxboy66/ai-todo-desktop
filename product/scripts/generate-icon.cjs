const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
    const svg = await fs.readFile(path.join(root, 'build/icon.svg'), 'utf8');
    await page.setContent('<style>body{margin:0;background:transparent}</style>' + svg);
    const png = await page.screenshot({ omitBackground: true });
    await fs.writeFile(path.join(root, 'src/renderer/public/icon.png'), png);
    // ICO directory with one PNG image at 256 x 256.
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
    header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
    await fs.writeFile(path.join(root, 'build/icon.ico'), Buffer.concat([header, png]));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
