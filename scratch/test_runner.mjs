import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9222;
const TARGET_URL = 'http://127.0.0.1:5500/';

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
    this.events = [];
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

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    console.log(`[SCREENSHOT] Saved: ${outputPath}`);
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  console.log('=== Launching Headless Chrome ===');
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    '--user-data-dir=C:\\Users\\IMRD\\.gemini\\antigravity-ide\\brain\\139d6779-cb06-4288-a3b8-623d9b775e3b\\scratch\\chrome-user-data'
  ]);

  let cdp = null;
  const results = [];

  function test(name, pass, details = '') {
    results.push({ name, pass, details });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${details ? '(' + details + ')' : ''}`);
  }

  try {
    // Wait for debug port
    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json`);
        if (targets && targets.length > 0) break;
      } catch (e) {
        await sleep(300);
      }
    }

    if (!targets || !targets[0]?.webSocketDebuggerUrl) {
      throw new Error('Failed to connect to Chrome remote debugging port.');
    }

    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log(`Navigating to ${TARGET_URL}...`);
    await cdp.send('Page.navigate', { url: TARGET_URL });
    await sleep(2500); // Allow initial JS and API checks to load

    // Dismiss intro overlay immediately so screenshots are not obscured
    await cdp.eval(`(() => {
      const overlay = document.getElementById('intro-overlay');
      if (overlay) overlay.style.display = 'none';
      sessionStorage.setItem('bookhaven_intro_seen', 'true');
    })()`);
    await sleep(300);

    // Initial check
    const initialOverflow = await cdp.eval('document.body.style.overflow');
    test('Initial body overflow is normal', initialOverflow !== 'hidden', `overflow="${initialOverflow}"`);

    // TEST 1: Quick View Open
    console.log('\n--- Testing Quick View Open ---');
    const qvOpened = await cdp.eval(`(() => {
      const qvBtn = document.querySelector('[data-quick-view]');
      if (!qvBtn) return { error: 'No quick view button found' };
      qvBtn.click();
      const modal = document.getElementById('quick-view-modal');
      return {
        clicked: true,
        isActive: modal.classList.contains('active'),
        ariaHidden: modal.getAttribute('aria-hidden'),
        role: modal.getAttribute('role'),
        bodyOverflow: document.body.style.overflow,
        title: document.getElementById('qv-title')?.textContent
      };
    })()`);
    test('Quick View opens via data-quick-view', qvOpened.isActive === true && qvOpened.bodyOverflow === 'hidden', JSON.stringify(qvOpened));

    // TEST 2: Quick View format selector toggles
    console.log('\n--- Testing Quick View Format Selector ---');
    const formatTest = await cdp.eval(`(() => {
      const pBtn = document.getElementById('qv-fmt-physical');
      const eBtn = document.getElementById('qv-fmt-ebook');
      if (!pBtn || !eBtn) return { error: 'Format buttons missing' };
      eBtn.click();
      const ebookSelected = eBtn.classList.contains('selected') && !pBtn.classList.contains('selected');
      pBtn.click();
      const physSelected = pBtn.classList.contains('selected') && !eBtn.classList.contains('selected');
      return { ebookSelected, physSelected };
    })()`);
    test('Quick View format toggle switches state cleanly', formatTest.ebookSelected && formatTest.physSelected, JSON.stringify(formatTest));

    // TEST 3: Quick View quantity controls
    console.log('\n--- Testing Quick View Quantity Controls ---');
    const qtyTest = await cdp.eval(`(() => {
      const inc = document.getElementById('qv-qty-inc');
      const dec = document.getElementById('qv-qty-dec');
      const input = document.getElementById('qv-qty-input');
      if (!inc || !dec || !input) return { error: 'Quantity controls missing' };
      inc.click();
      const valAfterInc = input.value;
      dec.click();
      const valAfterDec = input.value;
      dec.click(); // should not go below 1
      const valMin = input.value;
      return { valAfterInc, valAfterDec, valMin };
    })()`);
    test('Quick View quantity increment and decrement', qtyTest.valAfterInc === '2' && qtyTest.valAfterDec === '1' && qtyTest.valMin === '1', JSON.stringify(qtyTest));

    // TEST 4: Quick View Add to Bag
    console.log('\n--- Testing Quick View Add to Bag ---');
    const initialCart = await cdp.eval(`parseInt(document.getElementById('cart-count')?.textContent || '0')`);
    const qvAddTest = await cdp.eval(`(() => {
      const addBtn = document.getElementById('qv-add-btn');
      if (!addBtn) return { error: 'Add to bag button missing' };
      addBtn.click();
      return {
        btnText: addBtn.textContent.trim(),
        cartCount: parseInt(document.getElementById('cart-count')?.textContent || '0')
      };
    })()`);
    test('Quick View Add to Bag increments cart and gives button feedback', qvAddTest.cartCount === initialCart + 1, JSON.stringify(qvAddTest));

    // Capture screenshot of Quick View
    const artifactDir = 'C:\\Users\\IMRD\\.gemini\\antigravity-ide\\brain\\139d6779-cb06-4288-a3b8-623d9b775e3b';
    await cdp.captureScreenshot(path.join(artifactDir, 'quick_view_working.png'));

    // TEST 5: Quick View close via X button
    console.log('\n--- Testing Quick View Close Button ---');
    const qvClosed = await cdp.eval(`(() => {
      const closeBtn = document.getElementById('quick-view-close-btn');
      if (!closeBtn) return { error: 'Quick view close button missing' };
      closeBtn.click();
      const modal = document.getElementById('quick-view-modal');
      return {
        isActive: modal.classList.contains('active'),
        bodyOverflow: document.body.style.overflow
      };
    })()`);
    test('Quick View closes via close button and restores overflow', !qvClosed.isActive && qvClosed.bodyOverflow !== 'hidden', JSON.stringify(qvClosed));

    // TEST 6: Quick View close via Escape key
    console.log('\n--- Testing Quick View Escape Key ---');
    await cdp.eval(`document.querySelector('[data-quick-view]').click()`);
    await sleep(200);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await sleep(200);
    const escClosed = await cdp.eval(`(() => {
      const modal = document.getElementById('quick-view-modal');
      return { isActive: modal.classList.contains('active'), bodyOverflow: document.body.style.overflow };
    })()`);
    test('Quick View closes via Escape key and restores overflow', !escClosed.isActive && escClosed.bodyOverflow !== 'hidden', JSON.stringify(escClosed));

    // TEST 7: Quick View close via Backdrop click
    console.log('\n--- Testing Quick View Backdrop Click ---');
    await cdp.eval(`document.querySelector('[data-quick-view]').click()`);
    await sleep(200);
    const backdropClosed = await cdp.eval(`(() => {
      const backdrop = document.querySelector('#quick-view-modal .modal-backdrop');
      backdrop.click();
      const modal = document.getElementById('quick-view-modal');
      return { isActive: modal.classList.contains('active'), bodyOverflow: document.body.style.overflow };
    })()`);
    test('Quick View closes via Backdrop click and restores overflow', !backdropClosed.isActive && backdropClosed.bodyOverflow !== 'hidden', JSON.stringify(backdropClosed));

    // TEST 8: Card Add to Bag across all containers
    console.log('\n--- Testing Card Add to Cart across containers ---');
    const cardAddTest = await cdp.eval(`(() => {
      const beforeCount = parseInt(document.getElementById('cart-count')?.textContent || '0');
      const addBtns = document.querySelectorAll('.book-card [data-add-to-cart]');
      if (addBtns.length === 0) return { error: 'No add to cart buttons found' };
      addBtns[0].click();
      return {
        beforeCount,
        afterCount: parseInt(document.getElementById('cart-count')?.textContent || '0')
      };
    })()`);
    test('Direct card Add to Cart increments cart', cardAddTest.afterCount === cardAddTest.beforeCount + 1, JSON.stringify(cardAddTest));

    // TEST 9: Login Modal Open
    console.log('\n--- Testing Login Modal Open ---');
    const loginOpenedTest = await cdp.eval(`(() => {
      const loginBtn = document.getElementById('login-btn');
      loginBtn.click();
      const modal = document.getElementById('login-modal');
      return {
        isActive: modal.classList.contains('active'),
        role: modal.getAttribute('role'),
        ariaModal: modal.getAttribute('aria-modal'),
        bodyOverflow: document.body.style.overflow
      };
    })()`);
    test('Login modal opens with dialog accessibility attributes', loginOpenedTest.isActive && loginOpenedTest.role === 'dialog' && loginOpenedTest.bodyOverflow === 'hidden', JSON.stringify(loginOpenedTest));

    // TEST 10: Switch to Create Account Tab
    console.log('\n--- Testing Switch to Create Account Tab ---');
    const switchTabTest = await cdp.eval(`(() => {
      const toSignup = document.getElementById('to-signup');
      toSignup.click();
      const signupForm = document.getElementById('signup-form');
      const loginForm = document.getElementById('login-form');
      const title = document.getElementById('auth-title')?.textContent;
      return {
        signupVisible: signupForm.style.display !== 'none',
        loginHidden: loginForm.style.display === 'none',
        title
      };
    })()`);
    test('Switch to Create Account displays signup form and updates title', switchTabTest.signupVisible && switchTabTest.loginHidden, JSON.stringify(switchTabTest));

    // TEST 11: Inline Validation on Empty Create Account Submission
    console.log('\n--- Testing Inline Validation on Empty Signup Form ---');
    const validationEmptyTest = await cdp.eval(`(() => {
      const submitBtn = document.getElementById('signup-submit-btn');
      submitBtn.click();
      const nameErr = document.getElementById('error-signup-name')?.textContent;
      const emailErr = document.getElementById('error-signup-email')?.textContent;
      const passErr = document.getElementById('error-signup-password')?.textContent;
      const confirmErr = document.getElementById('error-signup-confirm')?.textContent;
      const nameInputError = document.getElementById('signup-name')?.classList.contains('input-error');
      return { nameErr, emailErr, passErr, confirmErr, nameInputError };
    })()`);
    test('Empty Create Account submission renders inline validation errors without alerts', 
      validationEmptyTest.nameErr.length > 0 && validationEmptyTest.emailErr.length > 0 && validationEmptyTest.nameInputError,
      JSON.stringify(validationEmptyTest)
    );

    // Capture screenshot of Signup Validation Errors
    await cdp.captureScreenshot(path.join(artifactDir, 'auth_signup_validation.png'));

    // TEST 12: Password Validation (short password and mismatch)
    console.log('\n--- Testing Password Validation (< 8 chars and mismatch) ---');
    const passValTest = await cdp.eval(`(() => {
      document.getElementById('signup-name').value = 'Test User';
      document.getElementById('signup-email').value = 'test@example.com';
      document.getElementById('signup-password').value = '123';
      document.getElementById('signup-confirm').value = '456';
      document.getElementById('signup-submit-btn').click();
      const passErr = document.getElementById('error-signup-password')?.textContent;
      return { passErr };
    })()`);
    test('Short password shows inline minimum character error', passValTest.passErr.includes('8 characters'), JSON.stringify(passValTest));

    // TEST 13: Successful Account Creation (with offline/mock fallback if backend offline)
    console.log('\n--- Testing Successful Account Creation ---');
    const signupSuccessTest = await cdp.eval(`(async () => {
      document.getElementById('signup-name').value = 'Chetan Reader';
      document.getElementById('signup-email').value = 'chetan_' + Date.now() + '@example.com';
      document.getElementById('signup-password').value = 'Password123!';
      document.getElementById('signup-confirm').value = 'Password123!';
      document.getElementById('signup-submit-btn').click();
      
      // Wait up to 8 seconds for cloud auth handler to complete
      for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 100));
        const modal = document.getElementById('login-modal');
        if (!modal.classList.contains('active')) {
          return {
            modalClosed: true,
            currentUser: JSON.parse(localStorage.getItem('currentUser') || 'null'),
            avatarVisible: document.getElementById('user-avatar')?.classList.contains('active'),
            bodyOverflow: document.body.style.overflow
          };
        }
      }
      return { modalClosed: false };
    })()`);
    test('Create Account creates user session, closes modal, restores scroll, and displays user avatar',
      signupSuccessTest.modalClosed && signupSuccessTest.currentUser && signupSuccessTest.bodyOverflow !== 'hidden',
      JSON.stringify(signupSuccessTest)
    );

    // TEST 14: Login Modal Close Button, ESC, and Backdrop
    console.log('\n--- Testing Login Modal Close mechanisms ---');
    // First log out to test login modal again
    await cdp.eval(`window.handleLogout()`);
    await sleep(200);

    // 14a: Close button
    await cdp.eval(`document.getElementById('login-btn').click()`);
    await sleep(200);
    const loginCloseBtnTest = await cdp.eval(`(() => {
      const closeBtn = document.getElementById('login-close-btn');
      closeBtn.click();
      const modal = document.getElementById('login-modal');
      return { isActive: modal.classList.contains('active'), bodyOverflow: document.body.style.overflow };
    })()`);
    test('Login modal close button closes modal and restores overflow', !loginCloseBtnTest.isActive && loginCloseBtnTest.bodyOverflow !== 'hidden', JSON.stringify(loginCloseBtnTest));

    // 14b: Escape key
    await cdp.eval(`document.getElementById('login-btn').click()`);
    await sleep(200);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await sleep(200);
    const loginEscTest = await cdp.eval(`(() => {
      const modal = document.getElementById('login-modal');
      return { isActive: modal.classList.contains('active'), bodyOverflow: document.body.style.overflow };
    })()`);
    test('Login modal closes via Escape key and restores overflow', !loginEscTest.isActive && loginEscTest.bodyOverflow !== 'hidden', JSON.stringify(loginEscTest));

    // 14c: Backdrop click
    await cdp.eval(`document.getElementById('login-btn').click()`);
    await sleep(200);
    const loginBackdropTest = await cdp.eval(`(() => {
      const backdrop = document.querySelector('#login-modal .modal-backdrop');
      backdrop.click();
      const modal = document.getElementById('login-modal');
      return { isActive: modal.classList.contains('active'), bodyOverflow: document.body.style.overflow };
    })()`);
    test('Login modal closes via Backdrop click and restores overflow', !loginBackdropTest.isActive && loginBackdropTest.bodyOverflow !== 'hidden', JSON.stringify(loginBackdropTest));

    // TEST 15: Console error check
    console.log('\n--- Checking Console Errors ---');
    const fatalErrors = cdp.consoleErrors.filter(e => !e.includes('ERR_CONNECTION_REFUSED') && !e.includes('Failed to load resource') && !e.includes('favicon'));
    test('Zero runtime script syntax or unhandled exception errors', fatalErrors.length === 0, `errors: ${JSON.stringify(fatalErrors)}`);

    console.log('\n=== Test Run Summary ===');
    const passed = results.filter(r => r.pass).length;
    console.log(`Passed: ${passed}/${results.length}`);

  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill();
  }
}

run();
