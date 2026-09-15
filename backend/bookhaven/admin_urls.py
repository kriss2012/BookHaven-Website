from django.urls import path, include
from rest_framework.routers import DefaultRouter
from books.admin_views import AdminBookViewSet
from .admin_views import (
    AdminOrderListView,
    AdminOrderStatusView,
    AdminReviewListView,
    AdminReviewApproveView,
    AdminUserListView,
    AdminUserDetailView,
)

router = DefaultRouter()
router.register(r'books', AdminBookViewSet, basename='admin-book')

urlpatterns = [
    # Books (ViewSet provides /books/ and /books/<pk>/)
    path('', include(router.urls)),

    # Orders
    path('orders/', AdminOrderListView.as_view(), name='admin-orders-list'),
    path('orders/<int:pk>/status/', AdminOrderStatusView.as_view(), name='admin-orders-status'),

    # Reviews
    path('reviews/', AdminReviewListView.as_view(), name='admin-reviews-list'),
    path('reviews/<int:pk>/approve/', AdminReviewApproveView.as_view(), name='admin-reviews-approve'),

    # Users / Accounts
    path('users/', AdminUserListView.as_view(), name='admin-users-list'),
    path('users/<int:pk>/', AdminUserDetailView.as_view(), name='admin-users-detail'),
]
