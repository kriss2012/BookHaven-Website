# Frontend Integration Guide — BookHaven API

This guide explains how to connect any separate frontend (React, Vite, Next.js, Vue, or Vanilla JS) to the BookHaven Django REST API backend.

---

## 1. Configuring the API Base URL

In your frontend application, configure the API base URL using environment variables or a configuration constant:

### In Vite (`.env`):
```env
VITE_API_URL=https://bookhaven-api.onrender.com/api
```
```javascript
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';
```

### In Next.js / Create React App:
```env
NEXT_PUBLIC_API_URL=https://bookhaven-api.onrender.com/api
```

### In Vanilla JS (e.g. `frontend/api.js`):
```javascript
// Automatically detect environment or allow window override:
const API_BASE = window.BOOKHAVEN_API_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api'
    : 'https://bookhaven-api.onrender.com/api');
```

---

## 2. CORS & Credentials

1. **Origin Whitelist**: Make sure your frontend URL (e.g. `https://my-bookstore.vercel.app`) is included in the backend's `CORS_ALLOWED_ORIGINS` environment variable.
2. **Include Credentials**: When sending authentication headers or cookies:
   ```javascript
   fetch(`${API_BASE}/orders/cart/`, {
     method: 'GET',
     headers: {
       'Authorization': `Bearer ${accessToken}`,
       'Content-Type': 'application/json',
     },
     credentials: 'include',
   });
   ```

---

## 3. Authentication Flow

BookHaven supports two authentication modes:

### Mode A: Standard JWT (Email & Password)
1. **Login**: `POST /api/auth/login/` with `{ email, password }`.
2. **Store Tokens**: Save `data.access` and `data.refresh` into `localStorage` (or secure HTTP-only cookies).
3. **Attach Header**: On protected routes (`/cart/`, `/orders/`, `/me/`, `/reviews/`), attach:
   ```http
   Authorization: Bearer <access_token>
   ```
4. **Token Refresh**: When a request fails with `401 Unauthorized`, send `POST /api/auth/token/refresh/` with `{ refresh: refreshToken }` to obtain a fresh access token without re-prompting the user.

### Mode B: Clerk Authentication
If your frontend uses Clerk:
1. User logs in via `<SignIn />` or `window.Clerk.openSignIn()`.
2. Retrieve the Clerk session token:
   ```javascript
   const clerkToken = await window.Clerk.session.getToken();
   ```
3. Exchange with BookHaven backend:
   ```javascript
   const res = await fetch(`${API_BASE}/auth/clerk-sync/`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ clerk_token: clerkToken }),
   });
   const data = await res.json();
   // Store Django access token for all subsequent API requests:
   localStorage.setItem('bh_access_token', data.access);
   ```

---

## 4. Error Handling Standard

The API returns consistent error payloads:

```javascript
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorCode = data?.error?.code || 'API_ERROR';
    const message = data?.error?.message || data?.detail || 'An error occurred.';
    const details = data?.error?.details || null;
    
    console.error(`[API Error ${response.status}] [${errorCode}]:`, message, details);
    throw new Error(message);
  }

  return data;
}
```

---

## 5. Health Check Monitoring

Check the status of the backend at any time:
```javascript
async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health/`);
    const data = await res.json();
    return data.status === 'ok';
  } catch (err) {
    return false; // Backend is sleeping or unreachable
  }
}
```
*Note: On Render Free Tier, the backend spins down after 15 minutes of inactivity. The first request after sleeping may take 30-50 seconds to complete while Render starts the container.*
