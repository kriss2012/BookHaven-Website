# BookHaven Admin — backend implementation guide

Your current `API.md` only documents **public, read-only** endpoints (`/api/books/`, `/api/reviews/`, `/api/orders/` for a signed-in shopper's own orders). There's no admin-only surface yet for creating/editing books, changing order status, moderating reviews, or banning accounts.

The admin frontend (`admin.html` + `admin-api.js`) is built to call the endpoints below. Everything is real `fetch()` against your Django backend — no mock data — so the dashboard will show empty/error states until these routes exist. Paste the snippets into your existing `books`, `orders`, `reviews`, and `users` apps and adjust names to match your actual models.

All responses should keep the error shape already used elsewhere in your API:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

## 0. Permission class (shared)

```python
# backend/bookhaven/permissions.py
from rest_framework.permissions import BasePermission

class IsStoreAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)
```

Also make sure `/api/auth/me/` includes `is_staff` in its response — the frontend uses that field to decide whether to show the dashboard:

```python
# users/serializers.py
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "display_name", "is_staff"]  # add is_staff
```

## 1. Books admin (`/api/admin/books/`)

If your `Book` model doesn't yet track inventory, add it:

```python
# books/models.py
class Book(models.Model):
    ...
    stock = models.PositiveIntegerField(default=0)
```
```bash
python manage.py makemigrations books && python manage.py migrate
```

```python
# books/admin_views.py
from rest_framework import viewsets, permissions
from .models import Book
from .serializers import BookSerializer  # extend it to include `stock`
from bookhaven.permissions import IsStoreAdmin

class AdminBookViewSet(viewsets.ModelViewSet):
    queryset = Book.objects.all().order_by("-id")
    serializer_class = BookSerializer
    permission_classes = [IsStoreAdmin]
    http_method_names = ["get", "post", "patch", "delete"]
```

```python
# books/urls.py (admin section)
from rest_framework.routers import DefaultRouter
from .admin_views import AdminBookViewSet

admin_router = DefaultRouter()
admin_router.register("admin/books", AdminBookViewSet, basename="admin-books")
urlpatterns += admin_router.urls
```

- `GET /api/admin/books/` — list, admin-only, includes `stock`
- `POST /api/admin/books/` — create `{title, author, price, stock, category, image_url}`
- `PATCH /api/admin/books/<id>/` — partial update (used for edits and the "mark out of stock" quick action, which just sends `{stock: 0}`)
- `DELETE /api/admin/books/<id>/` — delete

## 2. Orders admin (`/api/admin/orders/`, `/api/admin/orders/<id>/status/`)

```python
# orders/admin_views.py
from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Order
from .serializers import AdminOrderSerializer
from bookhaven.permissions import IsStoreAdmin

class AdminOrderListView(generics.ListAPIView):
    queryset = Order.objects.all().order_by("-created_at")
    serializer_class = AdminOrderSerializer
    permission_classes = [IsStoreAdmin]

class AdminOrderStatusView(APIView):
    permission_classes = [IsStoreAdmin]

    def patch(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return Response({"success": False, "error": {"code": "NOT_FOUND", "message": "Order not found."}}, status=404)
        status_value = request.data.get("status")
        valid = {"Pending", "Processing", "Shipped", "Delivered", "Cancelled"}
        if status_value not in valid:
            return Response({"success": False, "error": {"code": "VALIDATION_ERROR", "message": "Invalid status."}}, status=400)
        order.status = status_value
        order.save(update_fields=["status"])
        return Response({"id": order.id, "status": order.status})
```

```python
# orders/urls.py (admin section)
urlpatterns += [
    path("admin/orders/", AdminOrderListView.as_view()),
    path("admin/orders/<int:pk>/status/", AdminOrderStatusView.as_view()),
]
```

`AdminOrderSerializer` should return fields the dashboard reads: `id` (or `tracking_id`), `customer` (name), `date`, `items` (count), `total`, `status`.

## 3. Reviews admin (`/api/admin/reviews/`, `/api/admin/reviews/<id>/approve/`)

If reviews currently publish immediately, add a moderation flag:

```python
# reviews/models.py
class Review(models.Model):
    ...
    STATUS_CHOICES = [("pending", "Pending"), ("approved", "Approved")]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
```

```python
# reviews/admin_views.py
from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Review
from .serializers import AdminReviewSerializer
from bookhaven.permissions import IsStoreAdmin

class AdminReviewListView(generics.ListAPIView):
    queryset = Review.objects.all().order_by("-created_at")
    serializer_class = AdminReviewSerializer
    permission_classes = [IsStoreAdmin]

class AdminReviewApproveView(APIView):
    permission_classes = [IsStoreAdmin]

    def patch(self, request, pk):
        review = Review.objects.filter(pk=pk).first()
        if not review:
            return Response({"success": False, "error": {"code": "NOT_FOUND", "message": "Review not found."}}, status=404)
        review.status = "approved"
        review.save(update_fields=["status"])
        return Response({"id": review.id, "status": review.status})
```

Reuse your existing `DELETE /api/reviews/<id>/` for deletion, but relax its permission check so `is_staff` users can delete any review, not just their own.

## 4. Accounts admin (`/api/admin/users/`, `/api/admin/users/<id>/`)

```python
# users/admin_views.py
from rest_framework import generics, permissions
from .models import User
from .serializers import AdminUserSerializer
from bookhaven.permissions import IsStoreAdmin

class AdminUserListView(generics.ListAPIView):
    queryset = User.objects.all().order_by("-date_joined")
    serializer_class = AdminUserSerializer
    permission_classes = [IsStoreAdmin]

class AdminUserDetailView(generics.UpdateAPIView):
    queryset = User.objects.all()
    serializer_class = AdminUserSerializer
    permission_classes = [IsStoreAdmin]
    http_method_names = ["patch"]
```

The frontend's "Ban" action sends `PATCH { "is_active": false }`; Django's built-in `is_active` already blocks login when `False`, so no extra field is required — just expose it via `AdminUserSerializer` and make sure your login view rejects inactive users (DRF/simplejwt does this by default).

`AdminUserSerializer` should return: `id`, `name`, `email`, `joined` (from `date_joined`), `role` (`"Admin"` if `is_staff` else `"Customer"`), `status` (`"banned"` if `not is_active` else `"active"`).

## 5. Wire it up and test

1. Add the routes above to your app-level `urls.py` files (already included via your project's main `urls.py` → `path("api/", include(...))`).
2. Create an admin user if you haven't: `python manage.py createsuperuser`, then confirm `is_staff=True`.
3. In `admin-login.html` / `admin-api.js`, set `window.BOOKHAVEN_API_BASE` to your backend URL (defaults to `http://127.0.0.1:8000/api` for local dev; use your Render URL in production).
4. Make sure CORS allows your admin page's origin (`django-cors-headers`, `CORS_ALLOWED_ORIGINS`).
5. Sign in at `admin-login.html` with the admin account — the dashboard loads books, orders, reviews, and accounts from the endpoints above.

## Production security checklist

- Serve the admin pages over HTTPS only.
- Keep `DEBUG = False` and a real `SECRET_KEY` from an environment variable in production.
- Rate-limit `/api/auth/login/` to slow down credential stuffing.
- Consider short-lived access tokens (5–15 min) with refresh rotation (`ROTATE_REFRESH_TOKENS = True` in simplejwt settings) and refresh-token blacklisting on logout (already used by your documented `/api/auth/logout/`).
- Every admin view above must keep `permission_classes = [IsStoreAdmin]` — the frontend hiding non-admin nav items is a UX nicety, not a security boundary.
