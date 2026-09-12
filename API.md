# BookHaven API Documentation

Welcome to the BookHaven REST API documentation. The BookHaven backend exposes clean HTTP JSON endpoints designed to be consumed by decoupled frontends (React, Vue, Next.js, or vanilla JS/HTML).

- **Base URL (Local)**: `http://127.0.0.1:8000/api`
- **Base URL (Render Production)**: `https://<your-render-service>.onrender.com/api`
- **Authentication**: JWT Bearer Token (`Authorization: Bearer <access_token>`) or Clerk Session exchange.

---

## Standard Error Response Format

All API errors adhere to a uniform, predictable JSON structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description.",
    "details": { ... }
  },
  "detail": "Human-readable description."
}
```

### Common Error Codes
| HTTP Status | Error Code | Description |
|:---|:---|:---|
| `400` | `VALIDATION_ERROR` | Request payload failed serializer validation. Field details included in `details`. |
| `401` | `AUTHENTICATION_REQUIRED` | Missing, expired, or invalid authorization token. |
| `403` | `PERMISSION_DENIED` | Insufficient permissions for the requested resource. |
| `404` | `NOT_FOUND` | Resource does not exist. |
| `405` | `METHOD_NOT_ALLOWED` | HTTP method not permitted on this endpoint. |
| `429` | `RATE_LIMITED` | Rate limit threshold exceeded. Please throttle requests. |
| `500` | `INTERNAL_SERVER_ERROR` | Internal server exception. Safe error message displayed in production. |

---

## 1. System & Health Check

### Health Check (Render Probes)
Lightweight endpoint with zero database load for fast uptime and health monitoring.

- **URL**: `/api/health/` and `/health/`
- **Method**: `GET`
- **Auth Required**: No
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "service": "bookhaven-api"
  }
  ```

---

## 2. Authentication (`/api/auth/`)

### Register User
Creates a new user account with email and password.

- **URL**: `/api/auth/register/`
- **Method**: `POST`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "reader@example.com",
    "name": "Jane Doe",
    "password": "SecurePassword123",
    "confirm_password": "SecurePassword123"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "message": "Welcome to BookHaven, Jane! 🎉",
    "user": {
      "id": 1,
      "email": "reader@example.com",
      "name": "Jane Doe",
      "display_name": "Jane Doe"
    },
    "access": "<jwt_access_token>",
    "refresh": "<jwt_refresh_token>"
  }
  ```

### Login User
Authenticates user credentials and returns JWT tokens.

- **URL**: `/api/auth/login/`
- **Method**: `POST`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "reader@example.com",
    "password": "SecurePassword123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "message": "Welcome back, Jane! 👋",
    "user": { ... },
    "access": "<jwt_access_token>",
    "refresh": "<jwt_refresh_token>"
  }
  ```

### Refresh Token
Obtains a new access token using an unexpired refresh token.

- **URL**: `/api/auth/token/refresh/`
- **Method**: `POST`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "refresh": "<jwt_refresh_token>"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "access": "<new_jwt_access_token>"
  }
  ```

### Clerk Token Exchange (OAuth / Passwordless)
Exchanges a verified Clerk session JWT for Django user identity and simplejwt tokens.

- **URL**: `/api/auth/clerk-sync/`
- **Method**: `POST`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "clerk_token": "<clerk_session_jwt>"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "message": "Welcome, Jane! 🎉",
    "user": { ... },
    "access": "<jwt_access_token>",
    "refresh": "<jwt_refresh_token>"
  }
  ```

### Logout User
Blacklists the current refresh token.

- **URL**: `/api/auth/logout/`
- **Method**: `POST`
- **Auth Required**: Yes (`Bearer <token>`)
- **Request Body**:
  ```json
  {
    "refresh": "<jwt_refresh_token>"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "message": "Logged out successfully! 👋"
  }
  ```

### User Profile
Retrieve or update current user profile details.

- **URL**: `/api/auth/me/`
- **Method**: `GET` / `PUT`
- **Auth Required**: Yes (`Bearer <token>`)
- **PUT Body**:
  ```json
  {
    "name": "Jane Reader",
    "phone": "+91 9876543210",
    "address": "42 Books Lane, Reading City"
  }
  ```

---

## 3. Books & Catalog (`/api/books/`)

### List Books
Paginated catalog with filtering and search.

- **URL**: `/api/books/`
- **Method**: `GET`
- **Auth Required**: No
- **Query Parameters**:
  - `page`: Page number (e.g. `1`)
  - `category`: Filter by category (e.g. `Classics`, `Self-Help`, `Fiction`, `Sci-Fi`, `eBook`)
  - `ebook`: Filter eBook only (`true` / `false`)
  - `search`: Search title or author
- **Response `200 OK`**:
  ```json
  {
    "count": 28,
    "next": null,
    "previous": null,
    "results": [
      {
        "id": 1,
        "title": "Sapiens",
        "author": "Yuval Noah Harari",
        "price": 599,
        "ebook_price": 359,
        "category": "Classics",
        "image_url": "https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg",
        "rating": "4.8",
        "reviews_count": 15234,
        "is_ebook": true,
        "badge": "Bestseller"
      }
    ]
  }
  ```

### Book Details
- **URL**: `/api/books/<id>/`
- **Method**: `GET`
- **Auth Required**: No

### Trending Books
- **URL**: `/api/books/trending/`
- **Method**: `GET`
- **Auth Required**: No

### Active Offers
- **URL**: `/api/books/offers/`
- **Method**: `GET`
- **Auth Required**: No

---

## 4. Shopping Cart (`/api/orders/cart/`)

### Get Cart
- **URL**: `/api/orders/cart/`
- **Method**: `GET`
- **Auth Required**: Yes

### Add Item to Cart
- **URL**: `/api/orders/cart/add/`
- **Method**: `POST`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "book_id": 1,
    "quantity": 1,
    "format": "physical"
  }
  ```

### Update Item Quantity
- **URL**: `/api/orders/cart/update/<item_id>/`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "quantity": 2
  }
  ```

### Remove Item
- **URL**: `/api/orders/cart/remove/<item_id>/`
- **Method**: `DELETE`
- **Auth Required**: Yes

### Clear Cart
- **URL**: `/api/orders/cart/clear/`
- **Method**: `DELETE`
- **Auth Required**: Yes

---

## 5. Orders & Checkout (`/api/orders/`)

### Checkout
Converts current cart into a confirmed order.

- **URL**: `/api/orders/checkout/`
- **Method**: `POST`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "delivery_address": "42 Books Lane, Reading City",
    "coupon_code": "CLASSIC30",
    "payment_method": "UPI"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "message": "🎉 Order placed successfully!",
    "order": {
      "id": 12,
      "tracking_id": "BH9A8B7C6D",
      "status": "confirmed",
      "total": 419,
      "discount_amount": 180,
      "items": [ ... ]
    }
  }
  ```

### Order History
- **URL**: `/api/orders/`
- **Method**: `GET`
- **Auth Required**: Yes

### Order Details
- **URL**: `/api/orders/<id>/`
- **Method**: `GET`
- **Auth Required**: Yes

### Cancel Order
- **URL**: `/api/orders/<id>/cancel/`
- **Method**: `POST`
- **Auth Required**: Yes

---

## 6. Wishlist (`/api/orders/wishlist/`)

### Get Wishlist
- **URL**: `/api/orders/wishlist/`
- **Method**: `GET`
- **Auth Required**: Yes

### Toggle Wishlist Item
Adds item if absent; removes item if already present.

- **URL**: `/api/orders/wishlist/toggle/`
- **Method**: `POST`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "book_id": 1
  }
  ```

---

## 7. Reviews (`/api/reviews/`)

### List Reviews for a Book
- **URL**: `/api/reviews/?book=<book_id>`
- **Method**: `GET`
- **Auth Required**: No

### Submit Review
- **URL**: `/api/reviews/`
- **Method**: `POST`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "book": 1,
    "rating": 5,
    "comment": "An extraordinary journey through human history."
  }
  ```

### Delete Review
- **URL**: `/api/reviews/<id>/`
- **Method**: `DELETE`
- **Auth Required**: Yes
