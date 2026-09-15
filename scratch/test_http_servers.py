import urllib.request
import json

def test_live_http():
    print("=== Testing Live HTTP Servers (Frontend 8080 & Backend 8001) ===")

    # 1. Frontend pages
    pages = ['index.html', 'admin-login.html', 'admin.html', 'bookhaven-admin.html']
    for p in pages:
        url = f'http://127.0.0.1:8080/{p}'
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            content = resp.read().decode('utf-8', errors='ignore')
            print(f"  -> GET {url}: Status {status} (Length: {len(content)})")
            assert status == 200
            if p == 'bookhaven-admin.html':
                assert 'admin.html' in content, "bookhaven-admin.html should contain redirect to admin.html"

    # 2. Live Admin Login on port 8001
    login_url = 'http://127.0.0.1:8001/api/auth/login/'
    login_data = json.dumps({'email': 'bookhaven@gmail.in', 'password': '202@Book'}).encode('utf-8')
    req = urllib.request.Request(login_url, data=login_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        res_json = json.loads(resp.read().decode('utf-8'))
        token = res_json['access']
        user = res_json['user']
        print(f"  -> POST {login_url}: Status 200 | User: {user['email']} | is_staff: {user['is_staff']}")
        assert user['email'] == 'bookhaven@gmail.in'
        assert user['is_staff'] is True

    # 3. Live Admin Books API
    admin_books_url = 'http://127.0.0.1:8001/api/admin/books/'
    req = urllib.request.Request(admin_books_url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode('utf-8'))
        books = data.get('results', data)
        print(f"  -> GET {admin_books_url}: Status 200 | Found {len(books)} books")
        assert len(books) >= 28

    # 4. Live Book Update (Atomic Habits id=2)
    update_url = 'http://127.0.0.1:8001/api/admin/books/2/'
    update_data = json.dumps({'price': 625}).encode('utf-8')
    req = urllib.request.Request(update_url, data=update_data, headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}, method='PATCH')
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        updated = json.loads(resp.read().decode('utf-8'))
        print(f"  -> PATCH {update_url}: Status 200 | New Price: INR {updated['price']}")
        assert updated['price'] == 625

    # 5. Live Storefront Public Books API
    store_books_url = 'http://127.0.0.1:8001/api/books/'
    req = urllib.request.Request(store_books_url)
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode('utf-8'))
        books = data.get('results', data)
        matching = [b for b in books if b['id'] == 2][0]
        print(f"  -> GET {store_books_url}: Status 200 | Storefront Atomic Habits Price: INR {matching['price']}")
        assert matching['price'] == 625, "Storefront should directly show updated price of 625!"

    print("\n ALL LIVE END-TO-END HTTP TESTS PASSED! Frontend & Backend are fully in sync.")

if __name__ == '__main__':
    test_live_http()
