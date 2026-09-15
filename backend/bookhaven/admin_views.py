from rest_framework import generics, serializers, status
from rest_framework.views import APIView
from rest_framework.response import Response
from orders.models import Order
from reviews.models import Review
from users.models import User
from .permissions import IsStoreAdmin


# ─── Orders Admin ─────────────────────────────────────────────────────────────

class AdminOrderSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    date = serializers.DateTimeField(source='created_at', read_only=True)
    items = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ('id', 'customer', 'date', 'items', 'total', 'status')

    def get_customer(self, obj):
        if obj.user:
            return obj.user.get_display_name()
        return "Guest Patron"

    def get_items(self, obj):
        return obj.items.count()

    def get_status(self, obj):
        s = obj.status or 'pending'
        return s.capitalize()


class AdminOrderListView(generics.ListAPIView):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = AdminOrderSerializer
    permission_classes = [IsStoreAdmin]


class AdminOrderStatusView(APIView):
    permission_classes = [IsStoreAdmin]

    def patch(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return Response({'success': False, 'error': {'code': 'NOT_FOUND', 'message': 'Order not found.'}}, status=status.HTTP_404_NOT_FOUND)
        status_value = request.data.get('status')
        valid = {'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'}
        if not status_value or status_value.capitalize() not in valid:
            return Response({'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': 'Invalid status.'}}, status=status.HTTP_400_BAD_REQUEST)
        order.status = status_value.lower()
        order.save(update_fields=['status'])
        return Response({'id': order.id, 'status': status_value.capitalize()})


# ─── Reviews Admin ────────────────────────────────────────────────────────────

class AdminReviewSerializer(serializers.ModelSerializer):
    book = serializers.SerializerMethodField()
    reviewer = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ('id', 'book', 'reviewer', 'rating', 'text', 'status')

    def get_book(self, obj):
        return obj.book.title if obj.book else 'Unknown Title'

    def get_reviewer(self, obj):
        return obj.user.get_display_name() if obj.user else 'Anonymous'


class AdminReviewListView(generics.ListAPIView):
    queryset = Review.objects.all().order_by('-created_at')
    serializer_class = AdminReviewSerializer
    permission_classes = [IsStoreAdmin]


class AdminReviewApproveView(APIView):
    permission_classes = [IsStoreAdmin]

    def patch(self, request, pk):
        review = Review.objects.filter(pk=pk).first()
        if not review:
            return Response({'success': False, 'error': {'code': 'NOT_FOUND', 'message': 'Review not found.'}}, status=status.HTTP_404_NOT_FOUND)
        review.status = 'approved'
        review.save(update_fields=['status'])
        return Response({'id': review.id, 'status': 'approved'})


# ─── Accounts Admin ───────────────────────────────────────────────────────────

class AdminUserSerializer(serializers.ModelSerializer):
    joined = serializers.DateTimeField(source='date_joined', read_only=True)
    role = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'name', 'email', 'joined', 'role', 'status')

    def get_role(self, obj):
        return 'Admin' if obj.is_staff else 'Customer'

    def get_status(self, obj):
        return 'banned' if not obj.is_active else 'active'


class AdminUserListView(generics.ListAPIView):
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = AdminUserSerializer
    permission_classes = [IsStoreAdmin]


class AdminUserDetailView(APIView):
    permission_classes = [IsStoreAdmin]

    def patch(self, request, pk):
        user = User.objects.filter(pk=pk).first()
        if not user:
            return Response({'success': False, 'error': {'code': 'NOT_FOUND', 'message': 'User not found.'}}, status=status.HTTP_404_NOT_FOUND)
        if 'is_active' in request.data:
            user.is_active = bool(request.data['is_active'])
            user.save(update_fields=['is_active'])
        return Response(AdminUserSerializer(user).data)
