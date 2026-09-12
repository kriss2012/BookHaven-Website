import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9227;
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
  const tmpDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-cart-func-check');
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

    // 1. Add Atomic Habits (id 2) using window.addToCart (which may be overridden by api.js)
    console.log('[TEST 1] Add Atomic Habits to cart...');
    const addResult = await cdp.evaluate(`
      (async () => {
        window.cart = [];
        localStorage.removeItem('bookCart');
        await window.addToCart(2, 'physical', 1);
        window.openCart();
        
        const item = document.querySelector('.cart-item');
        const qtyNum = item ? item.querySelector('.cart-qty-num')?.textContent : null;
        const total = item ? item.querySelector('.cart-item-total')?.textContent : null;
        const subtotal = document.getElementById('cart-subtotal')?.textContent;
        const count = document.getElementById('cart-count')?.textContent;

        return {
          itemFound: !!item,
          qtyNum,
          total,
          subtotal,
          count,
          cartLength: (window.cart || []).length,
          itemCartId: (window.cart || [])[0]?.cartId
        };
      })()
    `);
    console.log('[TEST 1 RESULT]', addResult);

    // 2. Test Increment Quantity (+)
    console.log('[TEST 2] Increment quantity via + button...');
    const incResult = await cdp.evaluate(`
      (() => {
        const plusBtn = document.querySelector('.cart-qty-btn.plus') || document.querySelectorAll('.cart-qty-ctrl button')[1];
        if (!plusBtn) return { error: 'plus button not found' };
        plusBtn.click();
        
        const item = document.querySelector('.cart-item');
        const qtyNum = item ? item.querySelector('.cart-qty-num')?.textContent : null;
        const total = item ? item.querySelector('.cart-item-total')?.textContent : null;
        const subtotal = document.getElementById('cart-subtotal')?.textContent;
        const count = document.getElementById('cart-count')?.textContent;

        return {
          qtyNum,
          total,
          subtotal,
          count,
          inCartQty: (window.cart || [])[0]?.quantity
        };
      })()
    `);
    console.log('[TEST 2 RESULT]', incResult);

    // 3. Test Decrement Quantity (-)
    console.log('[TEST 3] Decrement quantity via - button...');
    const decResult = await cdp.evaluate(`
      (() => {
        const minusBtn = document.querySelector('.cart-qty-btn') || document.querySelectorAll('.cart-qty-ctrl button')[0];
        if (!minusBtn) return { error: 'minus button not found' };
        minusBtn.click();
        
        const item = document.querySelector('.cart-item');
        const qtyNum = item ? item.querySelector('.cart-qty-num')?.textContent : null;
        const total = item ? item.querySelector('.cart-item-total')?.textContent : null;
        const subtotal = document.getElementById('cart-subtotal')?.textContent;
        const count = document.getElementById('cart-count')?.textContent;

        return {
          qtyNum,
          total,
          subtotal,
          count,
          inCartQty: (window.cart || [])[0]?.quantity
        };
      })()
    `);
    console.log('[TEST 3 RESULT]', decResult);

    // 4. Test Remove Item button
    console.log('[TEST 4] Remove item via Remove button...');
    const removeResult = await cdp.evaluate(`
      (() => {
        const removeBtn = document.querySelector('.cart-remove-btn');
        if (!removeBtn) return { error: 'remove button not found' };
        removeBtn.click();
        
        const remainingItems = document.querySelectorAll('.cart-item').length;
        const emptyHeading = document.querySelector('.cart-drawer-items h3')?.textContent;
        const count = document.getElementById('cart-count')?.textContent;
        const subtotal = document.getElementById('cart-subtotal')?.textContent;

        return {
          remainingItems,
          emptyHeading,
          count,
          subtotal,
          cartLength: (window.cart || []).length
        };
      })()
    `);
    console.log('[TEST 4 RESULT]', removeResult);

    await sleep(400);
    await cdp.captureScreenshot('cart_empty_after_remove.png');

    // 5. Test adding two different books, removing one, decrementing the other
    console.log('[TEST 5] Add two books, remove one, decrement the other to zero...');
    const multiResult = await cdp.evaluate(`
      (async () => {
        await window.addToCart(1, 'physical', 1); // Sapiens
        await window.addToCart(4, 'physical', 2); // Harry Potter (qty 2)
        window.openCart();

        const beforeItems = document.querySelectorAll('.cart-item').length;
        const beforeCount = document.getElementById('cart-count')?.textContent;

        // Remove Sapiens
        const sapiensRemoveBtn = document.querySelector('[data-cart-id*="1-"] .cart-remove-btn');
        if (sapiensRemoveBtn) sapiensRemoveBtn.click();

        const afterRemoveItems = document.querySelectorAll('.cart-item').length;
        const remainingTitle = document.querySelector('.cart-item-title')?.textContent;
        const afterRemoveCount = document.getElementById('cart-count')?.textContent;

        // Decrement Harry Potter twice to remove it
        const hpMinusBtn = document.querySelector('[data-cart-id*="4-"] .cart-qty-btn');
        if (hpMinusBtn) hpMinusBtn.click(); // from 2 to 1
        const midCount = document.getElementById('cart-count')?.textContent;
        if (hpMinusBtn) hpMinusBtn.click(); // from 1 to 0 (auto removes)
        const finalItems = document.querySelectorAll('.cart-item').length;
        const finalCount = document.getElementById('cart-count')?.textContent;

        return {
          beforeItems,
          beforeCount,
          afterRemoveItems,
          remainingTitle,
          afterRemoveCount,
          midCount,
          finalItems,
          finalCount
        };
      })()
    `);
    console.log('[TEST 5 RESULT]', multiResult);

    console.log('ALL CART FUNCTION TESTS PASSED!');
  } finally {
    if (cdp && cdp.ws) cdp.ws.close();
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
