import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const FRONTEND_DIR = path.resolve('frontend');
const PORT = 8092;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9233;
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

function createStaticServer() {
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

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();

    this.ws.onmessage = (msg) => {
      const parsed = JSON.parse(msg.data);
      if (parsed.id && this.pending.has(parsed.id)) {
        const { resolve, reject } = this.pending.get(parsed.id);
        this.pending.delete(parsed.id);
        if (parsed.error) reject(parsed.error);
        else resolve(parsed.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  async send(method, params = {}) {
    await this.ready();
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`[SCREENSHOT] Saved ${outPath} (${buffer.length} bytes)`);
    return outPath;
  }
}

async function run() {
  const server = await createStaticServer();

  const tmpDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-footer-check');
  fs.mkdirSync(tmpDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tmpDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1050',
    `http://127.0.0.1:${PORT}/index.html`
  ]);

  let cdp = null;
  try {
    let list = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        list = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json`);
        if (list && list.length > 0) break;
      } catch (_) {}
    }

    const target = list.find(t => t.type === 'page') || list[0];
    cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    await sleep(2500);

    // Remove intro overlay if present
    await cdp.evaluate(`
      const intro = document.getElementById('intro-overlay');
      if (intro) intro.remove();
    `);

    // Check lightbox visibility
    const lbStatus = await cdp.evaluate(`
      (() => {
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        const style = lb ? window.getComputedStyle(lb) : null;
        const rect = lb ? lb.getBoundingClientRect() : null;
        return {
          exists: !!lb,
          display: style ? style.display : null,
          opacity: style ? style.opacity : null,
          imgSrc: img ? img.getAttribute('src') : null,
          imgDisplay: img ? window.getComputedStyle(img).display : null,
          rect
        };
      })()
    `);
    console.log('Lightbox Status:', lbStatus);

    // Scroll to the bottom exactly where footer begins (matching user screenshot)
    await cdp.evaluate(`
      const footer = document.querySelector('footer');
      if (footer) footer.scrollIntoView({ block: 'center' });
    `);
    await sleep(800);

    await cdp.captureScreenshot('footer_clean_no_error.png');

  } finally {
    if (cdp && cdp.ws) cdp.ws.close();
    chromeProc.kill();
    server.close();
  }
}

run().catch(console.error);
