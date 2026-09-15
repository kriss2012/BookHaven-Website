from django.urls import path
from . import views

urlpatterns = [
    # Cart
    path('cart/', views.CartView.as_view(), name='cart'),
    path('cart/add/', views.CartAddView.as_view(), name='cart-add'),
    path('cart/update/<int:item_id>/', views.CartUpdateView.as_view(), name='cart-update'),
    path('cart/remove/<int:item_id>/', views.CartRemoveView.as_view(), name='cart-remove'),
    path('cart/clear/', views.CartClearView.as_view(), name='cart-clear'),
    # Orders
    path('', views.OrderListView.as_view(), name='order-list'),
    path('checkout/', views.CheckoutView.as_view(), name='order-checkout'),
    path('record-sold/', views.RecordSoldView.as_view(), name='record-sold'),
    path('<int:order_id>/', views.OrderDetailView.as_view(), name='order-detail'),
    path('<int:order_id>/cancel/', views.OrderCancelView.as_view(), name='order-cancel'),
    # Wishlist
    path('wishlist/', views.WishlistView.as_view(), name='wishlist'),
    path('wishlist/toggle/', views.WishlistToggleView.as_view(), name='wishlist-toggle'),
]
