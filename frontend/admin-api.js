/* =========================================================================
   BookHaven Admin — API layer
   =========================================================================
   Handles auth (JWT access/refresh), token refresh-on-401, and every
   request the admin console makes. Import this before admin-login.js /
   the inline script in admin.html.

   CONFIGURE THIS: point API_BASE at your Django backend.
   ========================================================================= */

const BookHavenAdmin = (() => {
  const API_BASE = window.BOOKHAVEN_API_BASE || 'http://127.0.0.1:8000/api';

  const STORAGE = {
    access: 'bh_admin_access',
    refresh: 'bh_admin_refresh',
    user: 'bh_admin_user',
  };

  /* ---------------------------------------------------------------------
     Token storage
     NOTE ON SECURITY: tokens live in localStorage here so a reload keeps
     the admin signed in. localStorage is readable by any script on the
     page, so it's only as safe as your protection against XSS. For a
     hardened production setup, prefer having Django set the refresh
     token as an HttpOnly, Secure, SameSite=Strict cookie and keep only
     the short-lived access token in memory. That requires a small
     backend change (see ADMIN_BACKEND_GUIDE.md) — this file works either
     way; swap the storage functions below if you make that change.
     --------------------------------------------------------------------- */
  const tokens = {
    getAccess: () => localStorage.getItem(STORAGE.access),
    getRefresh: () => localStorage.getItem(STORAGE.refresh),
    getUser: () => {
      try { return JSON.parse(localStorage.getItem(STORAGE.user) || 'null'); }
      catch { return null; }
    },
    set: (access, refresh, user) => {
      if (access) localStorage.setItem(STORAGE.access, access);
      if (refresh) localStorage.setItem(STORAGE.refresh, refresh);
      if (user) localStorage.setItem(STORAGE.user, JSON.stringify(user));
    },
    clear: () => {
      localStorage.removeItem(STORAGE.access);
      localStorage.removeItem(STORAGE.refresh);
      localStorage.removeItem(STORAGE.user);
    },
  };

  class ApiError extends Error {
    constructor(message, code, status, details) {
      super(message);
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  let refreshPromise = null;

  async function refreshAccessToken() {
    const refresh = tokens.getRefresh();
    if (!refresh) throw new ApiError('No refresh token', 'NO_REFRESH', 401);

    // Coalesce concurrent refreshes into a single request.
    if (!refreshPromise) {
      refreshPromise = fetch(`${API_BASE}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      })
        .then(async (res) => {
          if (!res.ok) throw new ApiError('Session expired', 'AUTHENTICATION_REQUIRED', res.status);
          const data = await res.json();
          tokens.set(data.access, null, null);
          return data.access;
        })
        .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  /**
   * Core fetch wrapper: attaches the bearer token, retries once after a
   * silent token refresh on 401, and normalizes errors to the shape
   * described in API.md ({ success:false, error:{ code, message } }).
   */
  async function apiFetch(path, options = {}, _retried = false) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const access = tokens.getAccess();
    if (access) headers.Authorization = `Bearer ${access}`;

    let res;
    try {
      res = await fetch(url, { ...options, headers });
    } catch (networkErr) {
      throw new ApiError('Could not reach the server. Check your connection.', 'NETWORK_ERROR', 0);
    }

    if (res.status === 401 && !_retried && tokens.getRefresh()) {
      try {
        await refreshAccessToken();
        return apiFetch(path, options, true);
      } catch {
        tokens.clear();
        redirectToLogin();
        throw new ApiError('Your session expired. Please sign in again.', 'AUTHENTICATION_REQUIRED', 401);
      }
    }

    if (res.status === 204) return null;

    let body = null;
    try { body = await res.json(); } catch { /* empty body */ }

    if (!res.ok) {
      const err = body?.error;
      if (res.status === 401) { tokens.clear(); redirectToLogin(); }
      throw new ApiError(
        err?.message || body?.detail || `Request failed (${res.status})`,
        err?.code || (res.status === 403 ? 'PERMISSION_DENIED' : 'REQUEST_FAILED'),
        res.status,
        err?.details
      );
    }
    return body;
  }

  function redirectToLogin() {
    if (!location.pathname.endsWith('admin-login.html')) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = `admin-login.html?next=${next}`;
    }
  }

  /* ---------------------------------- Auth ---------------------------------- */

  async function login(email, password) {
    const data = await apiFetch('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokens.set(data.access, data.refresh, data.user);
    return data.user;
  }

  async function logout() {
    const refresh = tokens.getRefresh();
    try {
      if (refresh) {
        await apiFetch('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) });
      }
    } catch { /* best effort — clear locally regardless */ }
    tokens.clear();
    location.href = 'admin-login.html';
  }

  async function fetchMe() {
    const user = await apiFetch('/auth/me/');
    tokens.set(null, null, user);
    return user;
  }

  function isAuthenticated() {
    return Boolean(tokens.getAccess() || tokens.getRefresh());
  }

  /** True unless the backend explicitly marks the user as non-staff. */
  function isAdminUser(user) {
    if (!user) return false;
    if (user.is_staff === false) return false;
    if (user.role && String(user.role).toLowerCase() !== 'admin') return false;
    return true;
  }

  /** Call once at the top of every protected page. Redirects if not allowed. */
  async function requireAdmin() {
    if (!isAuthenticated()) { redirectToLogin(); return null; }
    try {
      const user = await fetchMe();
      if (!isAdminUser(user)) {
        tokens.clear();
        alert('This account does not have admin access.');
        redirectToLogin();
        return null;
      }
      return user;
    } catch (e) {
      redirectToLogin();
      return null;
    }
  }

  /* ---------------------------------- Books ---------------------------------- */
  // GET /api/books/ is public and paginated but doesn't include admin-only
  // fields (stock, cost, etc.) or out-of-stock filtering — the endpoints
  // below are the admin-scoped equivalents. See ADMIN_BACKEND_GUIDE.md.

  const books = {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/admin/books/${qs ? `?${qs}` : ''}`);
    },
    create: (payload) => apiFetch('/admin/books/', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) => apiFetch(`/admin/books/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) }),
    remove: (id) => apiFetch(`/admin/books/${id}/`, { method: 'DELETE' }),
  };

  /* ---------------------------------- Orders ---------------------------------- */

  const orders = {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/admin/orders/${qs ? `?${qs}` : ''}`);
    },
    updateStatus: (id, status) =>
      apiFetch(`/admin/orders/${id}/status/`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  };

  /* ---------------------------------- Reviews ---------------------------------- */

  const reviews = {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/admin/reviews/${qs ? `?${qs}` : ''}`);
    },
    approve: (id) => apiFetch(`/admin/reviews/${id}/approve/`, { method: 'PATCH' }),
    // Delete reuses the documented public endpoint (owner-or-admin).
    remove: (id) => apiFetch(`/reviews/${id}/`, { method: 'DELETE' }),
  };

  /* ---------------------------------- Accounts ---------------------------------- */

  const accounts = {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiFetch(`/admin/users/${qs ? `?${qs}` : ''}`);
    },
    setBanned: (id, banned) =>
      apiFetch(`/admin/users/${id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: !banned }) }),
  };

  return {
    ApiError, apiFetch, login, logout, fetchMe, isAuthenticated, isAdminUser,
    requireAdmin, tokens, books, orders, reviews, accounts,
  };
})();
