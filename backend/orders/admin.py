from django.contrib import admin
from .models import Cart, CartItem, Order, OrderItem


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    readonly_fields = ('unit_price', 'subtotal')


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ('user', 'item_count', 'total', 'updated_at')
    inlines = [CartItemInline]


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('subtotal',)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('tracking_id', 'user', 'status', 'total', 'payment_method', 'created_at')
    list_filter = ('status', 'payment_method')
    search_fields = ('tracking_id', 'user__email')
    list_editable = ('status',)
    inlines = [OrderItemInline]
    ordering = ('-created_at',)
