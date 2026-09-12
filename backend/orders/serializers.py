from rest_framework import serializers
from .models import Cart, CartItem, Order, OrderItem, Wishlist, WishlistItem
from books.serializers import BookSerializer


class CartItemSerializer(serializers.ModelSerializer):
    book = BookSerializer(read_only=True)
    book_id = serializers.IntegerField(write_only=True)
    unit_price = serializers.ReadOnlyField()
    subtotal = serializers.ReadOnlyField()

    class Meta:
        model = CartItem
        fields = ('id', 'book', 'book_id', 'quantity', 'format', 'unit_price', 'subtotal', 'added_at')

    def validate_book_id(self, value):
        from books.models import Book
        if not Book.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError('Book not found.')
        return value

    def validate(self, data):
        # If ebook format requested, verify book supports ebook
        from books.models import Book
        book_id = data.get('book_id')
        fmt = data.get('format', 'physical')
        if book_id and fmt == 'ebook':
            book = Book.objects.get(id=book_id)
            if not book.is_ebook:
                raise serializers.ValidationError({'format': 'This book is not available as eBook.'})
        return data


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total = serializers.ReadOnlyField()
    item_count = serializers.ReadOnlyField()

    class Meta:
        model = Cart
        fields = ('id', 'items', 'total', 'item_count', 'updated_at')


class OrderItemSerializer(serializers.ModelSerializer):
    subtotal = serializers.ReadOnlyField()

    class Meta:
        model = OrderItem
        fields = ('id', 'book', 'title', 'author', 'quantity', 'format', 'unit_price', 'subtotal')


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Order
        fields = (
            'id', 'tracking_id', 'status', 'status_display',
            'total', 'delivery_address', 'coupon_code',
            'discount_amount', 'payment_method',
            'items', 'created_at',
        )
        read_only_fields = ('id', 'tracking_id', 'status', 'created_at')


class CheckoutSerializer(serializers.Serializer):
    """Validates checkout payload from frontend."""
    delivery_address = serializers.CharField(required=False, allow_blank=True)
    coupon_code = serializers.CharField(required=False, allow_blank=True, max_length=30)
    payment_method = serializers.CharField(required=False, default='UPI', max_length=50)

class WishlistItemSerializer(serializers.ModelSerializer):
    book_details = serializers.SerializerMethodField()

    class Meta:
        model = WishlistItem
        fields = ('id', 'book', 'book_details', 'added_at')

    def get_book_details(self, obj):
        from books.serializers import BookListSerializer
        return BookListSerializer(obj.book).data

class WishlistSerializer(serializers.ModelSerializer):
    items = WishlistItemSerializer(many=True, read_only=True)

    class Meta:
        model = Wishlist
        fields = ('id', 'items', 'created_at')
