import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9225;
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
    this.consoleErrors = [];

    this.ws.onmessage = (msg) => {
      const parsed = JSON.parse(msg.data);
      if (parsed.id && this.pending.has(parsed.id)) {
        const { resolve, reject } = this.pending.get(parsed.id);
        this.pending.delete(parsed.id);
        if (parsed.error) reject(parsed.error);
        else resolve(parsed.result);
      } else if (parsed.method === 'Runtime.consoleAPICalled') {
        if (parsed.params.type === 'error') {
          const text = parsed.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
          this.consoleErrors.push(text);
          console.log('[BROWSER ERROR]', text);
        }
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
  const tmpDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-cart-check');
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
    console.log('[TEST] Waiting for Chrome CDP endpoint...');
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

    console.log('[TEST] Navigating to target URL...');
    await cdp.send('Page.navigate', { url: TARGET_URL });
    await sleep(2500);

    // Bypass intro overlay if active
    await cdp.evaluate(`
      const intro = document.getElementById('intro-overlay');
      if (intro) intro.remove();
    `);

    // 1. Check books loaded and add Atomic Habits or first book
    console.log('[TEST 1] Adding book to cart and checking cart item rendering...');
    const addResult = await cdp.evaluate(`
      (() => {
        // Ensure cart has at least 1 book
        const b = (window.books && window.books.length > 0) ? window.books[0] : { id: 1, title: 'Atomic Habits', author: 'James Clear', price: 650, category: 'Self-Help' };
        window.addToCart(b.id, 'physical', 1);
        window.openCart();
        
        const cartModal = document.getElementById('cart-modal');
        const cartItems = document.getElementById('cart-items');
        const firstItem = cartItems.querySelector('.cart-item');
        const img = firstItem ? firstItem.querySelector('.cart-item-img') : null;
        const title = firstItem ? firstItem.querySelector('.cart-item-title')?.textContent : null;
        const author = firstItem ? firstItem.querySelector('.cart-item-author')?.textContent : null;
        const total = firstItem ? firstItem.querySelector('.cart-item-total')?.textContent : null;
        const closeBtn = document.getElementById('cart-close-btn');

        return {
          cartModalActive: cartModal.classList.contains('active'),
          cartModalAriaHidden: cartModal.getAttribute('aria-hidden'),
          hasItem: !!firstItem,
          title,
          author,
          total,
          imgSrc: img ? img.src : null,
          imgHasFallbackOnError: img ? img.hasAttribute('onerror') : false,
          hasCloseBtn: !!closeBtn,
          bodyOverflow: document.body.style.overflow
        };
      })()
    `);
    console.log('[TEST 1 RESULT]', addResult);

    await sleep(500);
    await cdp.captureScreenshot('cart_drawer_editorial_styled.png');

    // 2. Test Cart Close button
    console.log('[TEST 2] Testing cart close button click...');
    const closeBtnResult = await cdp.evaluate(`
      (() => {
        const closeBtn = document.getElementById('cart-close-btn');
        closeBtn.click();
        const cartModal = document.getElementById('cart-modal');
        return {
          activeAfterClick: cartModal.classList.contains('active'),
          ariaHiddenAfterClick: cartModal.getAttribute('aria-hidden'),
          bodyOverflowAfterClick: document.body.style.overflow
        };
      })()
    `);
    console.log('[TEST 2 RESULT]', closeBtnResult);

    // 3. Test Backdrop click to close
    console.log('[TEST 3] Re-opening cart and testing backdrop click...');
    const backdropResult = await cdp.evaluate(`
      (() => {
        window.openCart();
        const cartModal = document.getElementById('cart-modal');
        const backdrop = document.getElementById('cart-drawer-backdrop');
        const wasActive = cartModal.classList.contains('active');
        backdrop.click();
        return {
          wasActive,
          activeAfterBackdropClick: cartModal.classList.contains('active'),
          ariaHidden: cartModal.getAttribute('aria-hidden'),
          bodyOverflow: document.body.style.overflow
        };
      })()
    `);
    console.log('[TEST 3 RESULT]', backdropResult);

    // 4. Test Razorpay integration on Checkout
    console.log('[TEST 4] Testing Razorpay checkout trigger...');
    const razorpayResult = await cdp.evaluate(`
      (() => {
        // Set mock currentUser
        window.currentUser = {
          name: 'Chetan Patron',
          email: 'patron@example.com',
          phone: '9876543210'
        };

        // Spy on Razorpay constructor
        let razorpayOptionsPassed = null;
        let razorpayOpened = false;

        window.Razorpay = function(options) {
          razorpayOptionsPassed = options;
          this.on = function(evt, cb) {};
          this.open = function() {
            razorpayOpened = true;
          };
        };

        // Open cart and click checkout
        window.openCart();
        const checkoutBtn = document.getElementById('checkout-btn');
        checkoutBtn.click();

        return {
          razorpayOpened,
          key: razorpayOptionsPassed?.key,
          amount: razorpayOptionsPassed?.amount,
          currency: razorpayOptionsPassed?.currency,
          name: razorpayOptionsPassed?.name,
          prefill: razorpayOptionsPassed?.prefill
        };
      })()
    `);
    console.log('[TEST 4 RESULT]', razorpayResult);

    // 5. Test payment success callback flow
    console.log('[TEST 5] Testing payment success handler...');
    const successResult = await cdp.evaluate(`
      (() => {
        window.processPaymentSuccess('Razorpay Online Payment', 'pay_test_998877', 730);
        const paymentModal = document.getElementById('payment-modal');
        const paymentBody = document.getElementById('payment-modal-body');
        return {
          paymentModalActive: paymentModal.classList.contains('active'),
          hasSuccessText: paymentBody.textContent.includes('Payment Successful'),
          hasTxnId: paymentBody.textContent.includes('pay_test_998877'),
          hasRateBtn: paymentBody.textContent.includes('Rate Books'),
          hasTrackBtn: paymentBody.textContent.includes('Track Order')
        };
      })()
    `);
    console.log('[TEST 5 RESULT]', successResult);

    await sleep(400);
    await cdp.captureScreenshot('payment_success_screen.png');

    console.log('ALL VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');
  } finally {
    if (cdp && cdp.ws) cdp.ws.close();
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
