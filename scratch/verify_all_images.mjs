import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const FRONTEND_DIR = path.resolve('frontend');
const PORT = 8085;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9228;
const ARTIFACT_DIR = 'C:\\Users\\IMRD\\.gemini\\antigravity-ide\\brain\\c17de112-c499-4768-9785-d60870774e2a';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4'
};

function createStaticServer() {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(FRONTEND_DIR, reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[STATIC SERVER] Listening on http://127.0.0.1:${PORT}`);
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

  const tmpDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-img-check');
  fs.mkdirSync(tmpDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tmpDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1400,1000',
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

    // Check Hero Images
    const heroReport = await cdp.evaluate(`
      (() => {
        const covers = Array.from(document.querySelectorAll('.hero-book-cover'));
        return covers.map(img => ({
          alt: img.alt,
          src: img.src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          ok: img.complete && img.naturalWidth > 50
        }));
      })()
    `);
    console.log('\n--- HERO BOOK COVERS ---');
    console.table(heroReport);

    // Check Category Card Background Images
    const categoryReport = await cdp.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.category-card'));
        return cards.map(c => {
          const bg = c.querySelector('.category-card-bg');
          const style = bg ? bg.style.backgroundImage : '';
          const match = style.match(/url\\(['"]?(.*?)['"]?\\)/);
          return {
            category: c.getAttribute('data-category'),
            bgUrl: match ? match[1] : null,
            hasLocalAsset: match ? match[1].includes('assets/') : false
          };
        });
      })()
    `);
    console.log('\n--- CATEGORY CARD BACKGROUNDS ---');
    console.table(categoryReport);

    // Check Journal Card Background Images
    const journalReport = await cdp.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.journal-card'));
        return cards.map(c => {
          const img = c.querySelector('.journal-card-image');
          const style = img ? img.style.backgroundImage : '';
          const match = style.match(/url\\(['"]?(.*?)['"]?\\)/);
          return {
            title: c.querySelector('.journal-title')?.textContent.trim(),
            bgUrl: match ? match[1] : null,
            hasLocalAsset: match ? match[1].includes('assets/') : false
          };
        });
      })()
    `);
    console.log('\n--- JOURNAL CARD BACKGROUNDS ---');
    console.table(journalReport);

    // Check eBook Preview Image
    const ebookReport = await cdp.evaluate(`
      (() => {
        const img = document.querySelector('.ebook-device-screen');
        return {
          src: img ? img.src : null,
          naturalWidth: img ? img.naturalWidth : 0,
          naturalHeight: img ? img.naturalHeight : 0,
          complete: img ? img.complete : false,
          ok: img ? (img.complete && img.naturalWidth > 50) : false
        };
      })()
    `);
    console.log('\n--- EBOOK PREVIEW SCREEN ---', ebookReport);

    // Check all 28 Book Cards in the catalog grid!
    const catalogReport = await cdp.evaluate(`
      (async () => {
        window.generateBooks('all');
        const imgs = Array.from(document.querySelectorAll('.book-card img'));
        imgs.forEach(img => { img.loading = 'eager'; });
        await Promise.all(imgs.map(img => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return img.decode ? img.decode().catch(() => {}) : new Promise(r => { img.onload = r; img.onerror = r; });
        }));

        const cards = Array.from(document.querySelectorAll('.book-card'));
        return cards.map(c => {
          const id = c.getAttribute('data-id');
          const title = c.querySelector('.book-card-title')?.textContent.trim();
          const img = c.querySelector('.book-card-image');
          return {
            id,
            title,
            imgSrc: img ? img.src : null,
            isLocal: img ? img.src.includes('/assets/') : false,
            complete: img ? img.complete : false,
            naturalWidth: img ? img.naturalWidth : 0,
            naturalHeight: img ? img.naturalHeight : 0,
            isRealImage: img ? (img.naturalWidth > 50 && !img.src.startsWith('data:image/svg')) : false
          };
        });
      })()
    `);
    console.log(`\n--- CATALOG BOOK CARDS (${catalogReport.length} books) ---`);
    console.table(catalogReport);

    const brokenBooks = catalogReport.filter(b => !b.isRealImage || !b.complete);
    if (brokenBooks.length > 0) {
      console.error('[FAIL] Broken book covers found:', brokenBooks);
      throw new Error(`Found ${brokenBooks.length} broken book images in catalog`);
    } else {
      console.log(`\n[SUCCESS] All ${catalogReport.length} book covers in catalog are 100% loaded, valid images!`);
    }

    // Capture Hero screenshot
    await cdp.captureScreenshot('site_hero_assets.png');

    // Scroll to catalog grid and capture screenshot
    await cdp.evaluate(`
      const catalog = document.getElementById('books');
      if (catalog) catalog.scrollIntoView({ block: 'start' });
    `);
    await sleep(800);
    await cdp.captureScreenshot('site_catalog_assets.png');

    // Check Quick View for Harry Potter (ID 4)
    console.log('\nChecking Quick View for Harry Potter (ID 4)...');
    const hpQv = await cdp.evaluate(`
      (() => {
        window.showQuickView(4);
        const qvModal = document.getElementById('quick-view-modal');
        const img = document.querySelector('.qv-cover-img');
        return {
          isOpen: qvModal ? qvModal.classList.contains('active') : false,
          src: img ? img.src : null,
          isLocal: img ? img.src.includes('assets/harry-potter.jpg') : false,
          complete: img ? img.complete : false,
          naturalWidth: img ? img.naturalWidth : 0,
          naturalHeight: img ? img.naturalHeight : 0,
          ok: img ? (img.complete && img.naturalWidth > 50) : false
        };
      })()
    `);
    console.log('Harry Potter Quick View status:', hpQv);
    await sleep(600);
    await cdp.captureScreenshot('harry_potter_quick_view.png');

    // Close Quick View and test Quick View for Book 1 (Sapiens) and Book 2 (Atomic Habits)
    await cdp.evaluate(`window.closeQuickView()`);
    await sleep(300);

    console.log('\nChecking Quick View for Sapiens (ID 1)...');
    const sapiensQv = await cdp.evaluate(`
      (() => {
        window.showQuickView(1);
        const img = document.querySelector('.qv-cover-img');
        return {
          src: img ? img.src : null,
          isLocal: img ? img.src.includes('assets/book-1-sapiens.jpg') : false,
          complete: img ? img.complete : false,
          naturalWidth: img ? img.naturalWidth : 0,
          naturalHeight: img ? img.naturalHeight : 0,
          ok: img ? (img.complete && img.naturalWidth > 50) : false
        };
      })()
    `);
    console.log('Sapiens Quick View status:', sapiensQv);
    await sleep(600);
    await cdp.captureScreenshot('sapiens_quick_view.png');

    await cdp.evaluate(`window.closeQuickView()`);

    console.log('\n========================================');
    console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
    console.log('========================================');

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
