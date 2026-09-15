from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from books.models import Book
from .models import Cart, CartItem, Order, OrderItem, Wishlist, WishlistItem
from .serializers import (
    CartSerializer, CartItemSerializer,
    OrderSerializer, CheckoutSerializer,
    WishlistSerializer, WishlistItemSerializer
)


# ─────────────────────────────────────────────
#  Cart
# ─────────────────────────────────────────────

class CartView(APIView):
    """GET /api/orders/cart/ — Return user's cart."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return Response(CartSerializer(cart).data)


class CartAddView(APIView):
    """POST /api/orders/cart/add/ — Add or increment a book in cart."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        serializer = CartItemSerializer(data=request.data)
        if serializer.is_valid():
            book = Book.objects.get(id=serializer.validated_data['book_id'])
            fmt = serializer.validated_data.get('format', 'physical')
            qty = serializer.validated_data.get('quantity', 1)

            if fmt != 'ebook':
                if book.stock <= 0:
                    return Response({'error': f'"{book.title}" is out of stock.'}, status=status.HTTP_400_BAD_REQUEST)
                existing_item = CartItem.objects.filter(cart=cart, book=book, format=fmt).first()
                existing_qty = existing_item.quantity if existing_item else 0
                if existing_qty + qty > book.stock:
                    return Response({'error': f'Only {book.stock} copies of "{book.title}" available.'}, status=status.HTTP_400_BAD_REQUEST)

            item, created = CartItem.objects.get_or_create(
                cart=cart, book=book, format=fmt,
                defaults={'quantity': qty}
            )
            if not created:
                item.quantity += qty
                item.save()

            return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CartUpdateView(APIView):
    """PUT /api/orders/cart/update/<id>/ — Update quantity of cart item."""
    permission_classes = [IsAuthenticated]

    def put(self, request, item_id):
        try:
            cart = request.user.cart
            item = cart.items.get(id=item_id)
        except (Cart.DoesNotExist, CartItem.DoesNotExist):
            return Response({'error': 'Cart item not found.'}, status=status.HTTP_404_NOT_FOUND)

        qty = request.data.get('quantity', 1)
        if qty <= 0:
            item.delete()
        else:
            if item.format != 'ebook' and qty > item.book.stock:
                return Response({'error': f'Only {item.book.stock} copies available.'}, status=status.HTTP_400_BAD_REQUEST)
            item.quantity = qty
            item.save()
        return Response(CartSerializer(cart).data)


class CartRemoveView(APIView):
    """DELETE /api/orders/cart/remove/<id>/ — Remove item from cart."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, item_id):
        try:
            cart = request.user.cart
            item = cart.items.get(id=item_id)
            item.delete()
        except (Cart.DoesNotExist, CartItem.DoesNotExist):
            return Response({'error': 'Cart item not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(CartSerializer(cart).data)


class CartClearView(APIView):
    """DELETE /api/orders/cart/clear/ — Clear entire cart."""
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        try:
            request.user.cart.items.all().delete()
        except Cart.DoesNotExist:
            pass
        return Response({'message': 'Cart cleared.'})


# ─────────────────────────────────────────────
#  Orders / Checkout
# ─────────────────────────────────────────────

class CheckoutView(APIView):
    """POST /api/orders/ — Convert cart to order."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            cart = request.user.cart
        except Cart.DoesNotExist:
            return Response({'error': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        items = cart.items.select_related('book').all()
        if not items.exists():
            return Response({'error': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CheckoutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Validate stock availability for all cart items
        for item in items:
            if item.format != 'ebook':
                if item.book.stock <= 0:
                    return Response({
                        'error': f'"{item.book.title}" is out of stock. Please remove it from your bag.'
                    }, status=status.HTTP_400_BAD_REQUEST)
                if item.quantity > item.book.stock:
                    return Response({
                        'error': f'"{item.book.title}" only has {item.book.stock} copies left in stock (you have {item.quantity} in bag).'
                    }, status=status.HTTP_400_BAD_REQUEST)

        # Apply coupon discount (simple demo logic)
        coupon = serializer.validated_data.get('coupon_code', '').upper()
        COUPON_MAP = {
            'CLASSIC30':   ('percent', 30),
            'SELFHELP150': ('flat',    150),
            'EBOOK25':     ('percent', 25),
            'NEWREADER40': ('percent', 40),
            'WEEKEND200':  ('flat',    200),
        }
        raw_total = cart.total
        discount = 0
        if coupon in COUPON_MAP:
            kind, val = COUPON_MAP[coupon]
            if kind == 'percent':
                discount = round(raw_total * val / 100)
            else:
                discount = min(val, raw_total)
        final_total = max(raw_total - discount, 0)

        # Create order
        order = Order.objects.create(
            user=request.user,
            total=final_total,
            delivery_address=serializer.validated_data.get('delivery_address', ''),
            coupon_code=coupon,
            discount_amount=discount,
            payment_method=serializer.validated_data.get('payment_method', 'UPI'),
        )

        # Create order items and decrement book stock
        for item in items:
            OrderItem.objects.create(
                order=order,
                book=item.book,
                title=item.book.title,
                author=item.book.author,
                quantity=item.quantity,
                format=item.format,
                unit_price=item.unit_price,
            )
            if item.format != 'ebook':
                item.book.stock = max(0, item.book.stock - item.quantity)
                item.book.save(update_fields=['stock'])

        # Clear cart
        items.delete()

        return Response({
            'message': '🎉 Order placed successfully!',
            'order': OrderSerializer(order).data,
        }, status=status.HTTP_201_CREATED)


class OrderListView(APIView):
    """GET /api/orders/ — List user's order history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = Order.objects.filter(user=request.user).prefetch_related('items')
        return Response(OrderSerializer(orders, many=True).data)


class OrderDetailView(APIView):
    """GET /api/orders/<id>/ — Single order detail with tracking."""
    permission_classes = [IsAuthenticated]

    def get(self, request, order_id):
        try:
            order = Order.objects.prefetch_related('items').get(
                id=order_id, user=request.user
            )
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrderSerializer(order).data)


class OrderCancelView(APIView):
    """POST /api/orders/<id>/cancel/ — Cancel a pending/confirmed order."""
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id, user=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        if order.status not in ('pending', 'confirmed'):
            return Response(
                {'error': f'Cannot cancel an order with status "{order.status}".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        order.status = 'cancelled'
        order.save()
        return Response({'message': 'Order cancelled.', 'order': OrderSerializer(order).data})

# ─────────────────────────────────────────────
#  Wishlist
# ─────────────────────────────────────────────

class WishlistView(APIView):
    """GET /api/orders/wishlist/ — Return user's wishlist."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wishlist, _ = Wishlist.objects.get_or_create(user=request.user)
        return Response(WishlistSerializer(wishlist).data)


class WishlistToggleView(APIView):
    """POST /api/orders/wishlist/toggle/ — Add/Remove a book from wishlist."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        book_id = request.data.get('book_id')
        if not book_id:
            return Response({'error': 'book_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            book = Book.objects.get(id=book_id)
        except Book.DoesNotExist:
            return Response({'error': 'Book not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        wishlist, _ = Wishlist.objects.get_or_create(user=request.user)
        item, created = WishlistItem.objects.get_or_create(wishlist=wishlist, book=book)
        
        if not created:
            # If it already existed, we remove it (toggle behavior)
            item.delete()
            action = 'removed'
        else:
            action = 'added'
            
        return Response({
            'message': f'Book {action} from wishlist.',
            'action': action,
            'wishlist': WishlistSerializer(wishlist).data
        }, status=status.HTTP_200_OK)


from rest_framework.permissions import AllowAny

class RecordSoldView(APIView):
    """POST /api/orders/record-sold/ — Automatically decrement copies count when books are sold."""
    permission_classes = [AllowAny]

    def post(self, request):
        items = request.data.get('items', [])
        updated = []
        for it in items:
            bid = it.get('book_id') or it.get('id')
            try:
                qty = int(it.get('quantity', 1))
            except (ValueError, TypeError):
                qty = 1
            fmt = it.get('format', 'physical')
            if fmt != 'ebook' and bid:
                b = Book.objects.filter(id=bid).first()
                if b:
                    b.stock = max(0, b.stock - qty)
                    b.save(update_fields=['stock'])
                    updated.append({'id': b.id, 'title': b.title, 'new_stock': b.stock, 'stock': b.stock})
        return Response({'success': True, 'updated': updated})
