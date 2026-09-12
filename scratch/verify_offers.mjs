import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const FRONTEND_DIR = path.resolve('frontend');
const PORT = 8089;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9230;
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
      console.log(`Server started on http://127.0.0.1:${PORT}`);
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

  const tmpDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-offers');
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

    if (!list || !list[0]) throw new Error('Chrome CDP failed to start');
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

    // Scroll to offers section
    await cdp.evaluate(`
      const section = document.getElementById('offers');
      if (section) section.scrollIntoView({ block: 'start' });
    `);
    await sleep(1000);

    // Check offers card details
    const report = await cdp.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.offer-card'));
        return cards.map(c => ({
          discount: c.querySelector('.offer-discount')?.textContent.trim(),
          title: c.querySelector('.offer-title')?.textContent.trim(),
          code: c.querySelector('.offer-code')?.textContent.trim(),
          hasPerforation: !!c.querySelector('.offer-perforation'),
          hasCopyBtn: !!c.querySelector('.offer-copy-btn'),
          hasTimerOrExpiry: !!(c.querySelector('.offer-timer') || c.querySelector('.offer-expiry'))
        }));
      })()
    `);
    console.log('Offers Report:');
    console.table(report);

    // Capture screenshot of the enhanced coupons
    await cdp.captureScreenshot('enhanced_coupons_ui.png');

    // Test clicking a copy button
    console.log('Testing copy button interaction...');
    const copyResult = await cdp.evaluate(`
      (() => {
        const btn = document.querySelector('.offer-copy-btn');
        if (btn) btn.click();
        return {
          clicked: !!btn,
          hasCopiedClass: btn ? btn.classList.contains('copied') : false,
          text: btn ? btn.textContent.trim() : ''
        };
      })()
    `);
    console.log('Copy button result:', copyResult);

    await sleep(500);
    await cdp.captureScreenshot('enhanced_coupons_copied_state.png');

  } finally {
    if (cdp && cdp.ws) cdp.ws.close();
    chromeProc.kill();
    server.close();
  }
}

run().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
