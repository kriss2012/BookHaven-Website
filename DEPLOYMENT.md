# Render Free Tier Deployment Guide — BookHaven API

Step-by-step instructions to deploy the BookHaven Django REST API backend to Render Free Tier with PostgreSQL, WhiteNoise static files, Gunicorn, and background maintenance.

---

## 1. Prerequisites

1. A [GitHub](https://github.com) account containing the repository.
2. A [Render](https://render.com) account.
3. Your frontend application URL (e.g. `https://your-frontend.vercel.app` or `http://localhost:5173`).
4. (Optional) Clerk account credentials if using Clerk authentication.

---

## 2. Recommended: One-Click Blueprint Deployment (`render.yaml`)

The repository includes a root `render.yaml` Blueprint that automatically provisions:
- **Managed PostgreSQL Database** (`bookhaven-db`) on Render Free Tier.
- **Python Web Service** (`bookhaven-api`) with build and start commands configured.

### Steps:
1. Push your repository to GitHub.
2. Go to the [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Connect your GitHub repository `BookHaven-Website` and branch `main`.
5. Render will detect `render.yaml` and prompt for the required environment variables:
   - `CORS_ALLOWED_ORIGINS`: e.g. `https://your-frontend.vercel.app`
   - `CSRF_TRUSTED_ORIGINS`: e.g. `https://your-frontend.vercel.app`
   - `CLERK_FRONTEND_API_URL` & `CLERK_SECRET_KEY` (if using Clerk)
6. Click **Apply**. Render will automatically provision the database and deploy the API.

---

## 3. Alternative: Manual Dashboard Deployment

If you prefer to configure the services manually in the Render dashboard:

### Step A: Create PostgreSQL Database
1. In Render Dashboard, click **New +** → **PostgreSQL**.
2. Name: `bookhaven-db`
3. Database: `bookhaven`
4. User: `bookhaven`
5. Region: Select the region nearest your users (e.g. `Oregon (US West)`).
6. Plan: **Free**
7. Click **Create Database**.
8. Once provisioned, copy the **Internal Database URL** (e.g. `postgresql://bookhaven:...@dpg-...-a:5432/bookhaven`).

### Step B: Create Web Service
1. Click **New +** → **Web Service**.
2. Connect your repository `BookHaven-Website`.
3. Configure the following fields:
   - **Name**: `bookhaven-api`
   - **Region**: Same region as your database.
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```bash
     pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate
     ```
   - **Start Command**:
     ```bash
     gunicorn bookhaven.wsgi:application -c gunicorn.conf.py
     ```
   - **Plan**: **Free**

### Step C: Configure Health Check
Under **Advanced Settings**:
- **Health Check Path**: `/api/health/`

---

## 4. Environment Variables Reference

Add the following environment variables to your Render Web Service (**Settings** → **Environment**):

| Variable Name | Required? | Example Value | Description |
|:---|:---|:---|:---|
| `DEBUG` | **Yes** | `False` | Disables debug mode in production. |
| `SECRET_KEY` | **Yes** | `f8q#9...` | Strong random string (Render can auto-generate). |
| `DATABASE_URL` | **Yes** | `postgresql://...` | Internal PostgreSQL connection string. |
| `ALLOWED_HOSTS` | **Yes** | `.onrender.com` | Allowed hostnames (Render subdomain). |
| `CORS_ALLOWED_ORIGINS` | **Yes** | `https://frontend.vercel.app` | Comma-separated list of allowed frontend URLs. |
| `CSRF_TRUSTED_ORIGINS` | **Yes** | `https://frontend.vercel.app` | Comma-separated list of trusted CSRF origins. |
| `PYTHON_VERSION` | Optional | `3.11.9` | Python runtime version. |
| `WEB_CONCURRENCY` | Optional | `2` | Number of Gunicorn worker processes. |
| `CLERK_FRONTEND_API_URL`| Optional | `https://xxx.clerk.accounts.dev` | Required if using Clerk authentication. |
| `CLERK_SECRET_KEY` | Optional | `sk_test_...` | Required if using Clerk authentication. |

---

## 5. First-Time Catalog Seeding (Optional)

To populate the production database with initial books, trending metrics, and promotional offers:
1. In your Render Web Service dashboard, navigate to the **Shell** tab.
2. Run:
   ```bash
   python manage.py seed_books
   ```
3. The catalog will be populated immediately without restarting the service.

---

## 6. Scheduled Maintenance Task (Cron)

BookHaven provides a dedicated management command:
```bash
python manage.py scheduled_task
```
This command performs:
- Automatic cancellation of stale unpaid pending orders (> 24 hours).
- Automatic deactivation of expired promotional offers.
- Purging of abandoned empty carts (> 30 days).
- **Exit immediately**: It executes in under 1 second, does not sleep, and does not run an infinite loop.

### Render Free Tier Cron Limitations:
1. **Free Tier Web Service Sleep**: Render Free Tier web services automatically sleep after 15 minutes of inactivity. **Do not use uptime ping bots to prevent sleep**, as this circumvents free tier limits and causes unnecessary resource consumption.
2. **Native Render Cron Jobs**: Render's native "Cron Job" service type requires a paid plan or compute credits ($1/mo minimum).

### How to Schedule the Task on Free Tier:
- **Option A (Manual / Shell)**: Run `python manage.py scheduled_task` from the Render Web Shell whenever needed.
- **Option B (GitHub Actions Schedule)**: Set up a free GitHub Actions workflow that executes `python manage.py scheduled_task` or hits an authorized maintenance webhook every 5 minutes or hourly.
- **Option C (Render Paid Cron)**: If you upgrade to a paid Render plan, uncomment the `type: cron` section in `render.yaml`.

---

## 7. Verification Checklist

After deployment completes:
- [ ] Visit `https://<your-service>.onrender.com/api/health/` → Returns `{"status": "ok", "service": "bookhaven-api"}`.
- [ ] Visit `https://<your-service>.onrender.com/api/books/` → Returns JSON catalog with pagination.
- [ ] Visit `https://<your-service>.onrender.com/admin/` → Verify Django admin loads with full WhiteNoise CSS styles.
- [ ] Verify Render logs show clean startup with Gunicorn workers running.
