from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import Review
from .serializers import ReviewSerializer, ReviewCreateSerializer


class ReviewListView(APIView):
    """GET /api/reviews/?book=<id> — List reviews for a book."""
    permission_classes = [AllowAny]

    def get(self, request):
        book_id = request.query_params.get('book')
        if not book_id:
            return Response({'error': 'book query parameter is required.'}, status=400)
        reviews = Review.objects.filter(book_id=book_id).select_related('user')
        return Response(ReviewSerializer(reviews, many=True).data)


class ReviewCreateView(APIView):
    """POST /api/reviews/ — Submit a review (auth required)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ReviewCreateSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            review = serializer.save(user=request.user)
            return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ReviewDeleteView(APIView):
    """DELETE /api/reviews/<id>/ — Delete own review."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, review_id):
        try:
            review = Review.objects.get(id=review_id, user=request.user)
            review.delete()
            return Response({'message': 'Review deleted.'})
        except Review.DoesNotExist:
            return Response({'error': 'Review not found.'}, status=404)
