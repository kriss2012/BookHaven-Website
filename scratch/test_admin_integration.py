import os
import sys
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bookhaven.settings')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
django.setup()

from rest_framework.test import APIClient
from users.models import User
from books.models import Book

def run_tests():
    print("=== Testing BookHaven Admin & Storefront Integration ===")
    client = APIClient()

    # 1. Test Admin Login
    print("\n[1] Testing Admin Login with bookhaven@gmail.in / 202@Book...")
    res = client.post('/api/auth/login/', {'email': 'bookhaven@gmail.in', 'password': '202@Book'}, format='json')
    assert res.status_code == 200, f"Login failed: {res.status_code} - {res.data}"
    access_token = res.data['access']
    user_info = res.data['user']
    assert user_info['email'] == 'bookhaven@gmail.in'
    assert user_info['is_staff'] is True
    print("  -> Admin Login PASSED. JWT Access Token acquired.")

    # 2. Test Non-Staff Account Rejection on Admin routes
    print("\n[2] Testing IsStoreAdmin permission guard...")
    unauth_client = APIClient()
    res_unauth = unauth_client.get('/api/admin/books/')
    assert res_unauth.status_code in (401, 403), f"Unauthenticated request should fail with 401 or 403, got {res_unauth.status_code}"
    print("  -> Permission guard PASSED: unauthenticated access rejected.")

    # 3. Test Admin Books List with Bearer Token
    print("\n[3] Testing GET /api/admin/books/...")
    admin_client = APIClient()
    admin_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
    res_books = admin_client.get('/api/admin/books/')
    assert res_books.status_code == 200, f"Failed: {res_books.status_code} - {res_books.data}"
    books_data = res_books.data.get('results', res_books.data)
    print(f"  -> Successfully listed {len(books_data)} books for admin with stock levels.")
    assert len(books_data) > 0, "Expected at least 1 book"
    assert 'stock' in books_data[0], "Expected stock field in admin book list"

    # 4. Test Book Creation via Admin API
    print("\n[4] Testing POST /api/admin/books/ (Creating new product)...")
    new_book_payload = {
        'title': 'The Sovereign Individual & Modern Systems',
        'author': 'James Dale Davidson',
        'price': 699,
        'stock': 25,
        'category': 'Business',
        'image_url': 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c'
    }
    res_create = admin_client.post('/api/admin/books/', new_book_payload, format='json')
    assert res_create.status_code == 201, f"Book creation failed: {res_create.status_code} - {res_create.data}"
    created_book = res_create.data
    created_id = created_book['id']
    print(f"  -> Created product #{created_id}: '{created_book['title']}' at price INR {created_book['price']}")

    # 5. Verify Public Storefront GET /api/books/ Reflects the New Product
    print("\n[5] Testing GET /api/books/ on storefront...")
    res_store = unauth_client.get('/api/books/')
    assert res_store.status_code == 200, f"Storefront books failed: {res_store.status_code}"
    store_books = res_store.data.get('results', res_store.data)
    matching = [b for b in store_books if b['id'] == created_id]
    assert len(matching) == 1, f"Created book #{created_id} not visible on storefront!"
    assert matching[0]['title'] == new_book_payload['title']
    assert matching[0]['price'] == new_book_payload['price']
    print(f"  -> Storefront verified: Product #{created_id} is live with title '{matching[0]['title']}'!")

    # 6. Test Book Update via Admin API
    print(f"\n[6] Testing PATCH /api/admin/books/{created_id}/ (Price & Title update)...")
    patch_payload = {'price': 749, 'stock': 12, 'title': 'The Sovereign Individual (Revised Masterwork)'}
    res_patch = admin_client.patch(f'/api/admin/books/{created_id}/', patch_payload, format='json')
    assert res_patch.status_code == 200, f"Patch failed: {res_patch.status_code}"
    
    # Verify update on storefront
    res_store_updated = unauth_client.get(f'/api/books/{created_id}/')
    assert res_store_updated.status_code == 200
    assert res_store_updated.data['price'] == 749
    assert res_store_updated.data['title'] == 'The Sovereign Individual (Revised Masterwork)'
    print(f"  -> Storefront verified: Updated price INR {res_store_updated.data['price']} and title reflected immediately!")

    # 7. Test Admin Orders, Reviews, and Users endpoints
    print("\n[7] Testing Admin Orders, Reviews, Users endpoints...")
    res_orders = admin_client.get('/api/admin/orders/')
    assert res_orders.status_code == 200, f"Orders admin failed: {res_orders.status_code}"
    res_reviews = admin_client.get('/api/admin/reviews/')
    assert res_reviews.status_code == 200, f"Reviews admin failed: {res_reviews.status_code}"
    res_users = admin_client.get('/api/admin/users/')
    assert res_users.status_code == 200, f"Users admin failed: {res_users.status_code}"
    print("  -> Admin Orders, Reviews, Users endpoints all returned 200 OK.")

    # 8. Test Book Deletion via Admin API
    print(f"\n[8] Testing DELETE /api/admin/books/{created_id}/...")
    res_del = admin_client.delete(f'/api/admin/books/{created_id}/')
    assert res_del.status_code == 204, f"Delete failed: {res_del.status_code}"
    res_check = unauth_client.get(f'/api/books/{created_id}/')
    assert res_check.status_code == 404, "Deleted book should no longer be found on storefront"
    print("  -> Deletion verified: Product removed from catalog.")

    print("\n ALL BACKEND AND STOREFRONT INTEGRATION TESTS PASSED SUCCESSFULLY! ")

if __name__ == '__main__':
    run_tests()
