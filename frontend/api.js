/**
 * BookHaven — Django REST API Integration Layer
 * ================================================
 * This file patches the existing script.js functions with real API calls.
 * Loaded AFTER script.js so overrides take effect cleanly.
 *
 * Authentication: Clerk (https://clerk.com) — replaces custom JWT forms.
 * Django backend must be running at: http://127.0.0.1:8000
 */

(function () {
  'use strict';

  // ─── Config ─────────────────────────────────────────────────────────────────
  const API_BASE = (window.BOOKHAVEN_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8001/api' : 'https://bookhaven-website.onrender.com/api')).replace(/\/+$/, '');
  const CLERK_PUBLISHABLE_KEY = 'pk_test_cmVhZHktc3RhZy0xMDIzLmNsZXJrLmFjY291bnRzLmRldiQ';
  window.wishlist = [];

  // ─── Token helpers ──────────────────────────────────────────────────────────
  // We store the simplejwt token that /api/auth/clerk-sync/ returns.
  // All Django API calls use this token so the backend stays unchanged.
  function getToken() { return localStorage.getItem('bh_access_token'); }
  function setTokens(access, refresh) {
    localStorage.setItem('bh_access_token', access);
    localStorage.setItem('bh_refresh_token', refresh);
  }
  function clearTokens() {
    localStorage.removeItem('bh_access_token');
    localStorage.removeItem('bh_refresh_token');
  }

  // ─── HTTP helpers ───────────────────────────────────────────────────────────
  async function apiRequest(method, path, body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const opts = { method, headers, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${path}`, opts);
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.warn('[BookHaven API] Network error:', err.message);
      return { ok: false, status: 0, data: { detail: 'Could not connect to server.' } };
    }
  }

  // Extract first error message from DRF error response
  function extractError(data) {
    if (!data) return 'Something went wrong.';
    if (typeof data === 'string') return data;
    if (data.error && data.error.message) return data.error.message;
    if (data.detail) return data.detail;
    const vals = Object.values(data);
    if (vals.length === 0) return 'Something went wrong.';
    const first = vals[0];
    return Array.isArray(first) ? first[0] : String(first);
  }

  // ─── Clerk Authentication ────────────────────────────────────────────────────

  /**
   * Called once after Clerk.load() resolves (Clerk JS v5+).
   * In v5, window.Clerk itself is the fully initialized instance —
   * Clerk.load() returns undefined, not a clerk object.
   */
  async function initClerkAuth() {
    const clerk = window.Clerk; // v5: instance lives on window.Clerk
    if (!clerk) return;

    // Optional: wire Google buttons to Clerk OAuth if available
    const googleLoginBtn = document.getElementById('google-login');
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clerk.openSignIn();
      });
    }
    const googleSignupBtn = document.getElementById('google-signup');
    if (googleSignupBtn) {
      googleSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clerk.openSignUp();
      });
    }

    // Listen for Clerk auth state changes (v5 API: window.Clerk.addListener)
    if (typeof clerk.addListener === 'function') {
      clerk.addListener(async ({ user }) => {
        if (user) {
          await onClerkSignIn(user);
        }
      });
    }

    // If there is already an active session in Clerk on page load, sync to Django now
    if (clerk.user) {
      await onClerkSignIn(clerk.user);
    }
  }

  /**
   * Called when Clerk reports a signed-in user.
   * Gets a fresh Clerk JWT → POSTs to /api/auth/clerk-sync/ → gets simplejwt tokens.
   */
  async function onClerkSignIn(clerkUser) {
    const clerk = window.Clerk;
    try {
      // Get a fresh short-lived session token from Clerk
      const clerkToken = await clerk.session.getToken();
      if (!clerkToken) return;

      // Exchange it for a Django simplejwt token pair
      const { ok, data } = await apiRequest('POST', '/auth/clerk-sync/', { clerk_token: clerkToken });

      if (ok) {
        setTokens(data.access, data.refresh);

        // Build a currentUser shape compatible with script.js
        currentUser = {
          ...data.user,
          name: data.user.display_name || clerkUser.fullName || clerkUser.primaryEmailAddress?.emailAddress?.split('@')[0] || 'User',
          email: data.user.email || clerkUser.primaryEmailAddress?.emailAddress || '',
          picture: clerkUser.imageUrl || '',
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        updateUIForLoggedInUser();

        // Safety net: ensure old modal is closed
        const oldModal = document.getElementById('login-modal');
        if (oldModal) {
          oldModal.classList.remove('active');
          oldModal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }

        showNotification(data.message || `Welcome, ${currentUser.name}! 👋`, 'success');
        await syncCartFromServer();
        await syncWishlistFromServer();
      } else {
        console.warn('[BookHaven] Clerk sync failed:', data);
        showNotification('Sign-in sync failed. Please try again.', 'error');
      }
    } catch (err) {
      console.warn('[BookHaven] onClerkSignIn error:', err);
    }
  }

  /** Called when Clerk reports a signed-out state. */
  function onClerkSignOut() {
    clearTokens();
    localStorage.removeItem('currentUser');
    currentUser = null;
    cart = [];
    window.wishlist = [];
    // Reset UI — reuse script.js helper if available
    if (typeof updateUIForLoggedOutUser === 'function') {
      updateUIForLoggedOutUser();
    } else {
      window.location.reload();
    }
  }

  // Override: handleLogout — sign-out
  window.handleLogout = async function () {
    try {
      // Blacklist the simplejwt refresh token on the Django side (best-effort)
      const refresh = localStorage.getItem('bh_refresh_token');
      if (refresh) {
        await apiRequest('POST', '/auth/logout/', { refresh }, true);
      }
    } catch (_) { /* ignore */ }

    clearTokens();
    localStorage.removeItem('currentUser');
    currentUser = null;
    if (typeof updateUIForLoggedOutUser === 'function') updateUIForLoggedOutUser();

    // Sign out from Clerk if present
    if (window.Clerk && typeof window.Clerk.signOut === 'function') {
      try { await window.Clerk.signOut(); } catch (_) {}
    }

    showNotification('Logged out successfully! 👋', 'success');
  };

  // ─── Boot Clerk ──────────────────────────────────────────────────────────────
  /**
   * Clerk JS v5 loads asynchronously via <script data-clerk-publishable-key>.
   * After the script executes, window.Clerk is available. We call Clerk.load()
   * to fully initialize, then call initClerkAuth().
   *
   * NOTE: In Clerk JS v5, Clerk.load() resolves with undefined — window.Clerk
   * itself is the initialized clerk instance.
   */
  (function bootClerk() {
    const TIMEOUT = 10000; // 10 s
    const start = Date.now();

    function tryInit() {
      if (window.Clerk) {
        window.Clerk.load({
          appearance: {
            variables: {
              colorPrimary: '#7A263A',
              colorBackground: '#F8F5EF',
              colorText: '#1C1C1A',
              colorInputBackground: '#FFFFFF',
              colorInputText: '#1C1C1A',
              borderRadius: '4px',
            },
          },
        }).then(() => {
          // v5: Clerk.load() resolves with undefined; window.Clerk IS the instance
          console.info('%c[BookHaven] Clerk initialized', 'color:#6366f1;font-weight:bold;');
          initClerkAuth();
        }).catch((err) => {
          console.error('[BookHaven] Clerk.load() failed:', err);
        });
        return;
      }

      if (Date.now() - start > TIMEOUT) {
        console.warn('[BookHaven] Clerk SDK did not load within 10 s. Falling back to legacy auth.');
        return;
      }

      setTimeout(tryInit, 100);
    }

    tryInit();
  })();

  // Clerk auth callbacks
  /** Called when Clerk reports a signed-out state. */
  function onClerkSignOut() {
    clearTokens();
    localStorage.removeItem('currentUser');
    currentUser = null;
    cart = [];
    window.wishlist = [];
    // Reset UI — reuse script.js helper if available
    if (typeof updateUIForLoggedOutUser === 'function') {
      updateUIForLoggedOutUser();
    } else {
      // Fallback: reload to cleanly reset all local state
      window.location.reload();
    }
  }


  // ─── Books override ─────────────────────────────────────────────────────────

  async function fetchAndRenderBooks(filter = 'all') {
    const container = document.getElementById('books-container');
    if (!container) return;

    let url = '/books/';
    if (filter === 'eBook') {
      url += '?category=eBook';
    } else if (filter !== 'all') {
      url += `?category=${encodeURIComponent(filter)}`;
    }

    container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-secondary)">📚 Loading books…</div>';

    const { ok, data } = await apiRequest('GET', url);
    // DRF can return { results: [...] } (paginated) or a plain array
    const bookList = ok ? (Array.isArray(data) ? data : (data.results || [])) : [];
    if (ok && bookList.length > 0) {
      const mapped = bookList.map(mapApiBook);
      if (filter === 'all') {
        window.allBooks = mapped;
        window.books = mapped;
      } else {
        window.books = mapped;
      }
      container.innerHTML = window.books.map(book => buildBookCard(book)).join('');
      attachCardEvents(container);
    } else {
      // Empty result from API or Network error — fall through to static data
      generateBooks(filter);
    }
  }

  const LOCAL_BOOK_COVERS = {
    1: 'assets/book-1-sapiens.jpg',
    2: 'assets/book-2-atomic-habits.jpg',
    3: 'assets/book-3-1984.jpg',
    4: 'assets/harry-potter.jpg',
    5: 'assets/book-5-the-alchemist.jpg',
    6: 'assets/book-6-psychology-of-money.jpg',
    7: 'assets/book-7-the-great-gatsby.jpg',
    8: 'assets/book-8-deep-work.jpg',
    9: 'assets/book-9-the-hobbit.jpg',
    10: 'assets/book-10-dune.jpg',
    11: 'assets/book-11-thinking-fast-and-slow.jpg',
    12: 'assets/book-12-to-kill-a-mockingbird.jpg',
    13: 'assets/book-13-the-da-vinci-code.jpg',
    14: 'assets/book-14-gone-girl.jpg',
    15: 'assets/book-15-the-martian.jpg',
    16: 'assets/book-16-zero-to-one.jpg',
    17: 'assets/book-17-the-lean-startup.jpg',
    18: 'assets/book-18-steve-jobs.jpg',
    19: 'assets/book-19-elon-musk.jpg',
    20: 'assets/book-20-brave-new-world.jpg',
    21: 'assets/book-21-the-girl-with-the-dragon-tattoo.jpg',
    22: 'assets/book-22-enders-game.jpg',
    23: 'assets/book-23-the-7-habits.jpg',
    24: 'assets/book-24-good-to-great.jpg',
    25: 'assets/book-25-the-power-of-now.jpg',
    26: 'assets/book-26-born-a-crime.jpg',
    27: 'assets/book-27-a-brief-history-of-time.jpg',
    28: 'assets/book-28-the-silent-patient.jpg',
  };

  // Map Django API fields to the shape script.js expects
  function mapApiBook(b) {
    let coverImg = b.image_url || LOCAL_BOOK_COVERS[b.id];
    if (!coverImg && (b.id === 4 || (b.title && b.title.toLowerCase().includes('harry potter')))) {
      coverImg = 'assets/harry-potter.jpg';
    }
    return {
      id: b.id,
      title: b.title,
      author: b.author,
      price: b.price,
      stock: b.stock !== undefined ? b.stock : 15,
      category: b.category,
      image: coverImg || '',
      rating: b.user_rating || b.rating || 4.5,
      reviews: b.total_reviews || b.reviews_count || 10,
      ebook: b.is_ebook,
      badge: b.badge || (b.stock === 0 ? 'Out of Stock' : (b.stock <= 5 ? 'Low Stock' : 'Bestseller')),
    };
  }

  // Cross-tab auto-sync: when admin edits products, refresh storefront automatically
  window.addEventListener('storage', (e) => {
    if (e.key === 'bh_catalog_version') {
      fetchAndRenderBooks('all');
      fetchAndRenderTrending();
    }
  });

  // Patch filter pills to use API
  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Restore session, cart, and wishlist immediately
    await restoreSession();

    // 2. Load books and trending
    await fetchAndRenderBooks('all');
    await fetchAndRenderTrending();

    // 3. Patch filter pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const cat = pill.dataset.category || 'all';
        fetchAndRenderBooks(cat);
      });
    });

    // 4. Offers from API
    fetchAndRenderOffers();

    // 5. eBooks section from API
    fetchAndRenderEbooks();
  });

  async function fetchAndRenderTrending() {
    const container = document.getElementById('trending-container');
    if (!container) return;
    const { ok, data } = await apiRequest('GET', '/books/trending/');
    if (!ok || !Array.isArray(data) || data.length === 0) return;

    window.trendingBooks = data.map(t => ({
      rank: t.rank,
      bookId: t.book.id,
      weeklyChange: t.weekly_change,
      hot: t.is_hot,
    }));

    // Ensure all trending books exist in window.books (which is now always an array)
    if (!Array.isArray(window.books)) window.books = [];
    data.forEach(t => {
      const apiBook = mapApiBook(t.book);
      if (!window.books.some(b => b.id === apiBook.id)) {
        window.books.push(apiBook);
      }
    });

    renderTrending();
  }

  async function fetchAndRenderOffers() {
    const container = document.getElementById('offers-container');
    if (!container) return;
    const { ok, data } = await apiRequest('GET', '/books/offers/');
    if (!ok) return;
    const list = data.results || data;
    if (!Array.isArray(list) || list.length === 0) return;

    window.offers = list.map(o => ({
      gradient: o.gradient_class,
      discount: o.discount,
      title: o.title,
      desc: o.description,
      code: o.code,
      expiry: o.expiry_label,
      hours: o.hours_remaining,
    }));

    renderOffers();
  }

  async function fetchAndRenderEbooks() {
    const container = document.getElementById('ebooks-container');
    if (!container) return;
    const { ok, data } = await apiRequest('GET', '/books/ebooks/');
    if (!ok) return;
    const list = data.results || data;
    if (!Array.isArray(list)) return;
    container.innerHTML = list.map(book => buildBookCard(mapApiBook(book))).join('');
    attachCardEvents(container);
  }

  // ─── Wishlist overrides ─────────────────────────────────────────────────────

  async function syncWishlistFromServer() {
    if (!getToken()) return;
    const { ok, data } = await apiRequest('GET', '/orders/wishlist/', null, true);
    if (ok && data.items) {
      window.wishlist = data.items;
      updateWishlistUI();
    }
  }

  function updateWishlistUI() {
    const list = window.wishlist || [];
    const countEl = document.getElementById('wishlist-count');
    if (countEl) countEl.textContent = list.length;
    localStorage.setItem('bookWishlist', JSON.stringify(list));

    // Update the heart buttons on book cards
    document.querySelectorAll('.book-wishlist-btn, .wishlist-btn').forEach(btn => {
      const bid = Number(btn.dataset.wishlistBook);
      const isWishlisted = list.some(w => {
        if (typeof w === 'number') return w === bid;
        if (typeof w === 'string') return String(w) === String(bid);
        if (w && w.book) return (typeof w.book === 'object' ? w.book.id === bid : w.book === bid);
        return false;
      });
      btn.classList.toggle('active', isWishlisted);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isWishlisted ? 'currentColor' : 'none');
      if (btn.classList.contains('wishlist-btn') && !svg) {
        btn.innerHTML = isWishlisted ? '❤️' : '🤍';
      }
    });

    // Re-render modal if open
    if (window.renderWishlistItems) window.renderWishlistItems();
  }

  window.toggleWishlist = async function (bookId) {
    const token = getToken();
    if (!token) {
      // Guest local wishlist
      let list = Array.isArray(window.wishlist) ? [...window.wishlist] : [];
      const numId = Number(bookId);
      const idx = list.findIndex(w => (typeof w === 'number' ? w === numId : (w.book === numId || (w.book && w.book.id === numId))));
      let action = 'added';
      if (idx !== -1) {
        list.splice(idx, 1);
        action = 'removed';
      } else {
        const book = (window.books || []).find(b => b.id === numId) || { id: numId, title: 'Book' };
        list.push({ id: Date.now(), book: numId, book_details: book });
      }
      window.wishlist = list;
      updateWishlistUI();
      showNotification(`Book ${action} from wishlist.`, 'info');
      return;
    }
    const { ok, data } = await apiRequest('POST', '/orders/wishlist/toggle/', { book_id: bookId }, true);
    if (ok) {
      window.wishlist = data.wishlist.items;
      updateWishlistUI();
      showNotification(data.message, 'success');
    } else {
      showNotification(extractError(data), 'error');
    }
  };

  // ─── Cart overrides ─────────────────────────────────────────────────────────

  async function syncCartFromServer() {
    if (!getToken()) return;
    const { ok, data } = await apiRequest('GET', '/orders/cart/', null, true);
    if (!ok) return;
    // Convert server cart to local cart format with cartId and cover image
    cart = (data.items || []).map(item => ({
      _cartItemId: item.id,
      cartId: `${item.book.id}-${item.format || 'physical'}`,
      id: item.book.id,
      title: item.book.title,
      author: item.book.author,
      image: (item.book.id === 4 || (item.book.title && item.book.title.includes('Harry Potter'))) ? 'assets/harry-potter.jpg' : (item.book.image_url || ''),
      price: item.unit_price,
      format: item.format,
      quantity: item.quantity,
    }));
    window.cart = cart;
    updateCartCount();
  }

  // Override: addToCart
  window.addToCart = async function (bookId, format = 'physical', quantity = 1) {
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const cartId = `${bookId}-${format}`;
    const allBooks = window.books || (typeof books !== 'undefined' ? books : []);
    const book = allBooks.find(b => b.id == bookId);

    // Stock guard: disallow adding out-of-stock physical books or exceeding copies count
    if (book && format !== 'ebook') {
      const stock = Number(book.stock ?? 10);
      if (stock <= 0) {
        showNotification(`Sorry, "${book.title}" is currently Out of Stock!`, 'error');
        return;
      }
      const existing = (window.cart || cart || []).find(c => c.cartId === cartId || (c.id == bookId && c.format === format));
      const currentQtyInCart = existing ? (existing.quantity || 1) : 0;
      if (currentQtyInCart + qty > stock) {
        showNotification(`Only ${stock} copies available. You already have ${currentQtyInCart} in your bag.`, 'warning');
        return;
      }
    }

    if (!currentUser || !getToken()) {
      // Not logged in — fall back to script.js local cart behavior
      if (!book) return;
      const existing = cart.find(c => c.cartId === cartId || (c.id == bookId && c.format === format));
      if (existing) {
        existing.quantity = (existing.quantity || 1) + qty;
      } else {
        const cover = (book.id === 4 || (book.title && book.title.includes('Harry Potter'))) ? 'assets/harry-potter.jpg' : (book.image || '');
        cart.push({
          cartId,
          id: book.id,
          title: book.title,
          author: book.author,
          image: cover,
          price: format === 'ebook' ? Math.round((book.price || 499) * 0.6) : (book.price || 499),
          format,
          quantity: qty
        });
      }
      window.cart = cart;
      localStorage.setItem('bookCart', JSON.stringify(cart));
      updateCartCount();
      showNotification(`${book.title} added to bag! 🛒`, 'success');
      return;
    }
    // Logged in — sync with server
    const { ok, data } = await apiRequest('POST', '/orders/cart/add/', { book_id: bookId, format, quantity: qty }, true);
    if (ok) {
      cart = (data.items || []).map(item => ({
        _cartItemId: item.id,
        cartId: `${item.book.id}-${item.format || 'physical'}`,
        id: item.book.id,
        title: item.book.title,
        author: item.book.author,
        image: (item.book.id === 4 || (item.book.title && item.book.title.includes('Harry Potter'))) ? 'assets/harry-potter.jpg' : (item.book.image_url || ''),
        price: item.unit_price,
        format: item.format,
        quantity: item.quantity,
      }));
      window.cart = cart;
      localStorage.setItem('bookCart', JSON.stringify(cart));
      updateCartCount();
      const bookName = cart.find(c => c.id == bookId)?.title || 'Book';
      showNotification(`${bookName} added to bag! 🛒`, 'success');
    } else {
      showNotification(extractError(data), 'error');
    }
  };

  // Intercept clicks before script.js's delegated or direct listeners
  document.addEventListener('click', (e) => {
    // 1. Intercept Add to Cart
    const addBtn = e.target.closest('[data-add-to-cart]');
    if (addBtn) {
      if (addBtn.disabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.stopPropagation(); // Prevent duplicate handling
      const card = addBtn.closest('.book-card');
      if (!card) return;
      const id = Number(card.getAttribute('data-id'));
      
      const selectedFmtBtn = card.querySelector('.format-btn.selected');
      const fmt = selectedFmtBtn ? selectedFmtBtn.dataset.fmt : 'physical';
      
      window.addToCart(id, fmt, 1);
      
      // Re-trigger the pulsing animation from script.js
      addBtn.classList.remove('pulsing');
      void addBtn.offsetWidth;
      addBtn.classList.add('pulsing');
      addBtn.addEventListener('animationend', () => addBtn.classList.remove('pulsing'), { once: true });
    }
    // 2. Intercept Logout
    else if (e.target.closest('#logout-btn') || e.target.closest('.logout')) {
      e.preventDefault();
      e.stopPropagation();
      window.handleLogout();
    }
  }, true); // Use capture phase to intercept BEFORE script.js's bubbling listener

  // Intercept submits before script.js's direct listeners
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'settings-form') {
      e.preventDefault();
      e.stopPropagation();
      window.handleSettingsSave();
    }
  }, true);

  // Override: executePaymentLogic
  let apiPendingOrderBooks = [];
  window.afterPaymentSuccess = function() {
    closePaymentModal();
    setTimeout(() => openReviewModal(apiPendingOrderBooks), 400);
  };

  window.executePaymentLogic = async function (method) {
    if (!currentUser || !getToken()) {
      showNotification('Please login to checkout 🔐', 'info');
      closePaymentModal();
      openLogin();
      return;
    }

    const { ok, data } = await apiRequest('POST', '/orders/checkout/', {
      coupon_code: '', // Can be extended to support coupons from UI later
      payment_method: method,
      delivery_address: currentUser.address || '',
    }, true);

    if (!ok) {
      showNotification(extractError(data), 'error');
      closePaymentModal();
      return;
    }

    const order = data.order;
    const total = order.total;
    const txnId = order.tracking_id;
    const purchasedBooks = order.items.map(item => ({
       id: item.book,
       title: item.title,
       author: item.author,
       format: item.format
    }));

    // Find eBook items in this purchase
    const ebookItems = purchasedBooks.filter(b => b.format === 'ebook');
    const ebookDownloadsHtml = ebookItems.length > 0 ? `
      <div class="ebook-downloads-section" style="margin-top:1.2rem;">
        <div class="ebook-downloads-title">📱 Your eBooks are ready to download!</div>
        <div class="ebook-download-list">
          ${ebookItems.map(b => `
            <div class="ebook-download-item">
              <span class="ebook-download-name">📚 ${escHtml(b.title.replace(' (eBook)', ''))}</span>
              <button class="ebook-download-btn" id="dl-${b.id}" onclick="downloadEbookPDF(${b.id})">
                ⬇️ Download PDF
              </button>
            </div>`).join('')}
        </div>
      </div>` : '';

    const body = document.getElementById('payment-modal-body');
    if (body) {
      body.innerHTML = `
        <div class="pay-success">
          <div class="pay-success-circle">✓</div>
          <h3>Payment Successful!</h3>
          <p style="font-size:1.1rem;font-weight:800;">₹${total.toLocaleString('en-IN')} paid</p>
          <p>via <strong>${escHtml(method)}</strong></p>
          <div class="txn-id">Txn ID: ${escHtml(txnId)}</div>
          <p style="margin-top:0.8rem;font-size:0.88rem;">Order confirmation sent to <strong>${escHtml(currentUser.email)}</strong></p>
          ${ebookDownloadsHtml}
          <div style="display:flex;gap:0.8rem;margin-top:1.5rem;">
            <button class="submit-btn" style="flex:1;" onclick="closePaymentModal();openTrackingModal('${escHtml(txnId)}')">
              📍 Track Order
            </button>
            <button class="submit-btn" style="flex:1;background:linear-gradient(135deg,#ec4899,#8b5cf6);" onclick="afterPaymentSuccess()">
              ✍️ Rate Books
            </button>
          </div>
        </div>`;
    }

    cart = [];
    updateCartCount();
    apiPendingOrderBooks = purchasedBooks;
    
    // Decrement stock for purchased physical items locally & sync
    if (Array.isArray(order.items) && window.books) {
      order.items.forEach(item => {
        if (item.format !== 'ebook') {
          const b = window.books.find(x => x.id === item.book);
          if (b) {
            b.stock = Math.max(0, (b.stock ?? 10) - (item.quantity || 1));
          }
        }
      });
      try {
        localStorage.setItem('bh_books_cache', JSON.stringify(window.books));
        localStorage.setItem('bh_catalog_version', String(Date.now()));
      } catch(e) {}
      if (typeof renderBooks === 'function') renderBooks();
      if (typeof renderTrending === 'function') renderTrending();
    }

    // Add to local ordersDB so tracking works immediately
    ordersDB.unshift({
        id: txnId,
        placedAt: new Date(order.created_at).getTime(),
        books: order.items.map(i => {
            const localBook = (window.books || []).find(b => b.id === i.book);
            return {
                id: i.book,
                title: i.title,
                author: i.author,
                image: localBook ? localBook.image : '',
                price: i.unit_price,
                quantity: i.quantity,
                format: i.format
            };
        }),
        total: order.total,
        method: order.payment_method,
        isOnlinePayment: method && (method.toLowerCase().includes('card') || method.toLowerCase().includes('net banking') || method.toLowerCase().includes('wallet') || method.toLowerCase().includes('upi')),
        status: order.status,
        user: currentUser.name
    });
  };

  // ─── Orders override ─────────────────────────────────────────────────────────

  const originalOpenOrdersModal = window.openOrdersModal;
  window.openOrdersModal = async function() {
    if (!getToken()) {
        openLogin();
        return;
    }
    
    // Fetch real orders from the API
    const { ok, data } = await apiRequest('GET', '/orders/', null, true);
    if (ok) {
        const apiOrders = data.results || data;
        // Update the global ordersDB array in script.js by modifying it in place
        ordersDB.length = 0; 
        apiOrders.forEach(o => {
            ordersDB.push({
                id: o.tracking_id,
                placedAt: new Date(o.created_at).getTime(),
                books: o.items.map(i => {
                    const localBook = (window.books || []).find(b => b.id === i.book);
                    return {
                        id: i.book || 0,
                        title: i.title,
                        author: i.author,
                        image: localBook ? localBook.image : '',
                        price: i.unit_price,
                        quantity: i.quantity,
                        format: i.format
                    };
                }),
                total: o.total,
                method: o.payment_method,
                isOnlinePayment: o.payment_method && (o.payment_method.toLowerCase().includes('card') || o.payment_method.toLowerCase().includes('net banking') || o.payment_method.toLowerCase().includes('wallet') || o.payment_method.toLowerCase().includes('upi')),
                status: o.status,
                user: currentUser.name
            });
        });
    }
    
    // Call the original render logic which uses the updated ordersDB
    if (originalOpenOrdersModal) originalOpenOrdersModal();
  };

  // ─── Reviews override ───────────────────────────────────────────────────────

  const originalShowAllReviews = window.showAllReviews;
  window.showAllReviews = async function (bookId) {
      const { ok, data } = await apiRequest('GET', `/reviews/?book=${bookId}`);
      if (ok) {
          reviewsDB[bookId] = data.map(r => ({
              id: r.id,
              user: r.user_name || 'Anonymous',
              rating: r.rating,
              text: r.text,
              date: new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          }));
      }
      if (originalShowAllReviews) originalShowAllReviews(bookId);
  };

  const originalSubmitReview = window.submitReview;
  window.submitReview = async function (bookId) {
      if (!getToken()) {
        showNotification('Please login to leave a review 🔐', 'info');
        openLogin();
        return;
      }
      
      const ta = document.getElementById('review-text');
      const text = ta ? ta.value.trim().slice(0, 500) : ''; 
      const stars = document.querySelectorAll('#star-picker .star.selected');
      const rating = stars.length;
      
      if (rating === 0) { showNotification('Please select a star rating!', 'error'); return; }
      
      const { ok, data } = await apiRequest('POST', '/reviews/create/', {
        book: bookId, rating: rating, text,
      }, true);
      
      if (!ok) {
        showNotification(extractError(data), 'error');
        return;
      }
      
      showNotification('Review submitted! ⭐', 'success');
      
      // Call the original to advance the queue and save locally
      if (originalSubmitReview) originalSubmitReview(bookId);
  };

  // ─── Session restore ─────────────────────────────────────────────────────────
  async function restoreSession() {
    const cachedUser = localStorage.getItem('currentUser');
    const token = getToken();

    // 1. Optimistic UI restore from localStorage cache
    if (cachedUser) {
      try {
        const parsed = JSON.parse(cachedUser);
        if (parsed && typeof parsed === 'object' && (parsed.name || parsed.email)) {
          currentUser = parsed;
          window.currentUser = currentUser;
          if (typeof updateUIForLoggedInUser === 'function') updateUIForLoggedInUser();
        }
      } catch (_) {
        currentUser = null;
        window.currentUser = null;
      }
    }

    // 2. Restore local cart & wishlist optimistically so data never disappears
    try {
      const localCart = localStorage.getItem('bookCart');
      if (localCart) {
        cart = JSON.parse(localCart);
        window.cart = cart;
        updateCartCount();
      }
    } catch (_) {}

    try {
      const localWish = localStorage.getItem('bookWishlist');
      if (localWish) {
        window.wishlist = JSON.parse(localWish);
        updateWishlistUI();
      }
    } catch (_) {}

    // 3. Verify session with backend if token exists
    if (token) {
      let { ok, status, data } = await apiRequest('GET', '/auth/me/', null, true);

      // If access token expired (401), try token refresh
      if (!ok && status === 401) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          const retry = await apiRequest('GET', '/auth/me/', null, true);
          ok = retry.ok;
          status = retry.status;
          data = retry.data;
        }
      }

      if (ok && data && (data.email || data.id)) {
        // Authoritative user profile confirmed
        currentUser = {
          ...(currentUser || {}),
          ...data,
          name: data.display_name || data.name || (currentUser && currentUser.name) || data.email.split('@')[0],
          email: data.email,
        };
        window.currentUser = currentUser;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        if (typeof updateUIForLoggedInUser === 'function') updateUIForLoggedInUser();

        // Synchronize user cart & wishlist from server
        await syncCartFromServer();
        await syncWishlistFromServer();
      } else if (status === 401 || status === 403) {
        // Backend confirmed token is truly invalid/expired and refresh failed
        clearTokens();
        localStorage.removeItem('currentUser');
        currentUser = null;
        window.currentUser = null;
        if (typeof updateUIForLoggedOutUser === 'function') updateUIForLoggedOutUser();
      }
      // If status === 0 (network failure / server sleeping), keep optimistic local session!
    } else if (!currentUser) {
      if (typeof updateUIForLoggedOutUser === 'function') updateUIForLoggedOutUser();
    }
  }

  // Helper to merge guest cart and sync wishlist after login/signup
  window.syncCartAfterLogin = async function () {
    const token = getToken();
    if (!token) return;
    try {
      const localCart = localStorage.getItem('bookCart');
      if (localCart) {
        const parsed = JSON.parse(localCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
            await apiRequest('POST', '/orders/cart/add/', {
              book_id: item.id,
              format: item.format || 'physical',
              quantity: item.quantity || 1
            }, true);
          }
        }
      }
    } catch (_) {}
    await syncCartFromServer();
    await syncWishlistFromServer();
  };

  // tryRefreshToken with automatic retry and token rotation
  async function tryRefreshToken() {
    const refresh = localStorage.getItem('bh_refresh_token');
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return false;
      const result = await res.json();
      if (result.access) {
        localStorage.setItem('bh_access_token', result.access);
        if (result.refresh) localStorage.setItem('bh_refresh_token', result.refresh);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ─── Helper: attach card events after dynamic render ────────────────────────

  function attachCardEvents(container) {
    // Quick-view buttons
    container.querySelectorAll('[data-quick-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.book-card');
        if (!card) return;
        const bookId = parseInt(card.dataset.id, 10);
        if (window.showQuickView) window.showQuickView(bookId, btn);
        else if (window.openQuickView) window.openQuickView(bookId, btn);
      });
    });
    // Add to cart buttons
    container.querySelectorAll('[data-add-to-cart]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.disabled) return;
        e.stopPropagation();
        const card = btn.closest('.book-card');
        if (!card) return;
        const bookId = parseInt(card.dataset.id, 10);
        const fmtBtn = card.querySelector('.format-btn.selected');
        const fmt = fmtBtn ? fmtBtn.dataset.fmt : 'physical';
        window.addToCart(bookId, fmt, 1);
      });
    });
    // Format toggle buttons
    container.querySelectorAll('.format-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.book-card');
        if (!card) return;
        card.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
    // See-all-reviews buttons
    container.querySelectorAll('[data-see-reviews]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bookId = parseInt(btn.dataset.seeReviews, 10);
        if (window.openReviewModal) window.openReviewModal(bookId, btn);
      });
    });
  }

  // ─── Status indicator ───────────────────────────────────────────────────────

  // Show a subtle badge indicating backend connection status
  async function checkBackendHealth() {
    try {
      const res = await fetch(`${API_BASE}/books/?page_size=1`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        console.info('%c✅ BookHaven Django API connected', 'color: #10b981; font-weight: bold;');
      } else {
        console.warn('%c⚠️ BookHaven Django API responded with error', 'color: #f59e0b;');
      }
    } catch {
      console.warn('%c❌ BookHaven Django API offline — using static data', 'color: #ef4444; font-weight: bold;');
    }
  }

  checkBackendHealth();

})();
