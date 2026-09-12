import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const FRONTEND_DIR = path.resolve('frontend');
const PORT = 8091;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9232;
const ARTIFACT_DIR = 'C:\\Users\\IMRD\\.gemini\\antigravity-ide\\brain\\c17de112-c499-4768-9785-d60870774e2a';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(FRONTEND_DIR, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', async () => {
  const tmpDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-mobile');
  fs.mkdirSync(tmpDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tmpDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=400,900',
    `http://127.0.0.1:${PORT}/index.html`
  ]);

  await new Promise(r => setTimeout(r, 2000));
  const list = await new Promise(r => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => r(JSON.parse(d)));
    });
  });

  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    const onmsg = (msg) => {
      const p = JSON.parse(msg.data);
      if (p.id === curId) {
        ws.removeEventListener('message', onmsg);
        resolve(p.result);
      }
    };
    ws.addEventListener('message', onmsg);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise(r => setTimeout(r, 2000));

  await send('Runtime.evaluate', {
    expression: `
      const intro = document.getElementById('intro-overlay');
      if (intro) intro.remove();
      const grid = document.getElementById('offers-container');
      if (grid) grid.scrollIntoView({ block: 'center' });
    `
  });
  await new Promise(r => setTimeout(r, 800));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'enhanced_coupons_mobile.png'), Buffer.from(shot.data, 'base64'));
  console.log('Mobile screenshot saved!');

  ws.close();
  chromeProc.kill();
  server.close();
});
