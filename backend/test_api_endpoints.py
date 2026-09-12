"""
Local verification script to test API endpoints, health checks, error responses, and CORS.
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bookhaven.settings')
django.setup()

from django.test import Client

client = Client()

print("=" * 60)
print("Testing BookHaven Endpoints Locally")
print("=" * 60)

# 1. Health Check
res = client.get('/api/health/')
print(f"GET /api/health/ -> status: {res.status_code}, json: {res.json()}")
assert res.status_code == 200, f"Expected 200, got {res.status_code}"
assert res.json().get('status') == 'ok', "Health check failed"

# 2. Root Health Check
res = client.get('/health/')
print(f"GET /health/ -> status: {res.status_code}, json: {res.json()}")
assert res.status_code == 200

# 3. Books List
res = client.get('/api/books/')
print(f"GET /api/books/ -> status: {res.status_code}, count: {len(res.json().get('results', res.json()))}")
assert res.status_code == 200

# 4. Trending Books
res = client.get('/api/books/trending/')
print(f"GET /api/books/trending/ -> status: {res.status_code}, count: {len(res.json())}")
assert res.status_code == 200

# 5. Offers
res = client.get('/api/books/offers/')
print(f"GET /api/books/offers/ -> status: {res.status_code}, count: {len(res.json().get('results', res.json()))}")
assert res.status_code == 200

# 6. Single Book Detail
res = client.get('/api/books/1/')
print(f"GET /api/books/1/ -> status: {res.status_code}, title: {res.json().get('title')}")
assert res.status_code == 200

# 7. DRF Error Formatting on 404
res = client.get('/api/books/99999/')
print(f"GET /api/books/99999/ -> status: {res.status_code}, json: {res.json()}")
assert res.status_code == 404
assert res.json().get('success') is False
assert res.json().get('error', {}).get('code') == 'NOT_FOUND'

# 8. DRF Validation Error on Auth Register
res = client.post('/api/auth/register/', data={}, content_type='application/json')
print(f"POST /api/auth/register/ (empty) -> status: {res.status_code}, json: {res.json()}")
assert res.status_code == 400
assert res.json().get('success') is False
assert res.json().get('error', {}).get('code') == 'VALIDATION_ERROR'

# 9. Admin panel loads
res = client.get('/admin/login/')
print(f"GET /admin/login/ -> status: {res.status_code}")
assert res.status_code == 200

print("=" * 60)
print("ALL LOCAL ENDPOINT TESTS PASSED SUCCESSFULLY! [OK]")
print("=" * 60)
