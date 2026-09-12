import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9226;
const TARGET_URL = 'http://127.0.0.1:5500/';
const ARTIFACT_DIR = 'C:\\Users\\IMRD\\.gemini\\antigravity-ide\\brain\\139d6779-cb06-4288-a3b8-623d9b775e3b';

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
  const tmpDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-hp-check');
  fs.mkdirSync(tmpDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tmpDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    TARGET_URL
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

    await cdp.send('Page.navigate', { url: TARGET_URL });
    await sleep(2500);

    // Remove intro overlay
    await cdp.evaluate(`
      const intro = document.getElementById('intro-overlay');
      if (intro) intro.remove();
    `);

    // Check Harry Potter card
    const cardInfo = await cdp.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.book-card'));
        const hpCard = cards.find(c => c.textContent.includes('Harry Potter') || c.getAttribute('data-id') === '4');
        if (!hpCard) return { found: false };
        const img = hpCard.querySelector('.book-card-image');
        return {
          found: true,
          title: hpCard.querySelector('.book-card-title')?.textContent,
          imgSrc: img ? img.currentSrc || img.src : null,
          complete: img ? img.complete : false,
          naturalWidth: img ? img.naturalWidth : 0,
          naturalHeight: img ? img.naturalHeight : 0,
          isRealImage: img ? (img.naturalWidth > 50 && !img.currentSrc.startsWith('data:image/svg')) : false
        };
      })()
    `);
    console.log('[HP CARD CHECK]', cardInfo);

    // Scroll to HP card and capture screenshot
    await cdp.evaluate(`
      const cards = Array.from(document.querySelectorAll('.book-card'));
      const hpCard = cards.find(c => c.textContent.includes('Harry Potter') || c.getAttribute('data-id') === '4');
      if (hpCard) hpCard.scrollIntoView({ block: 'center' });
    `);
    await sleep(600);
    await cdp.captureScreenshot('harry_potter_card_loaded.png');

    // Open Quick View for HP
    console.log('[TEST QUICK VIEW FOR HP]');
    const qvInfo = await cdp.evaluate(`
      (() => {
        window.showQuickView(4);
        const qvModal = document.getElementById('quick-view-modal');
        const img = document.querySelector('.qv-cover-img');
        return {
          active: qvModal.classList.contains('active'),
          imgSrc: img ? img.currentSrc || img.src : null,
          naturalWidth: img ? img.naturalWidth : 0,
          naturalHeight: img ? img.naturalHeight : 0
        };
      })()
    `);
    console.log('[HP QUICK VIEW CHECK]', qvInfo);

    await sleep(600);
    await cdp.captureScreenshot('harry_potter_quick_view_loaded.png');

  } finally {
    if (cdp && cdp.ws) cdp.ws.close();
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
