from rest_framework.views import APIView
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from .models import Book, TrendingBook, Offer
from .serializers import BookSerializer, TrendingBookSerializer, OfferSerializer


class BookListView(ListAPIView):
    """GET /api/books/ — List all books with optional filters."""
    serializer_class = BookSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = Book.objects.filter(is_active=True)
        category = self.request.query_params.get('category')
        is_ebook = self.request.query_params.get('ebook')
        search = self.request.query_params.get('search')

        if category and category != 'all':
            if category == 'eBook':
                qs = qs.filter(is_ebook=True)
            else:
                qs = qs.filter(category=category)
        if is_ebook is not None:
            qs = qs.filter(is_ebook=is_ebook.lower() == 'true')
        if search:
            qs = qs.filter(title__icontains=search) | qs.filter(author__icontains=search)
        return qs


class BookDetailView(RetrieveAPIView):
    """GET /api/books/<id>/ — Single book detail."""
    queryset = Book.objects.filter(is_active=True)
    serializer_class = BookSerializer
    permission_classes = [AllowAny]


class TrendingBooksView(APIView):
    """GET /api/books/trending/ — Top trending books."""
    permission_classes = [AllowAny]

    def get(self, request):
        trending = TrendingBook.objects.select_related('book').order_by('rank')
        serializer = TrendingBookSerializer(trending, many=True)
        return Response(serializer.data)


class EbookListView(ListAPIView):
    """GET /api/books/ebooks/ — eBook-only listing."""
    serializer_class = BookSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Book.objects.filter(is_active=True, is_ebook=True)


class OfferListView(ListAPIView):
    """GET /api/offers/ — All active promotional offers."""
    queryset = Offer.objects.filter(is_active=True)
    serializer_class = OfferSerializer
    permission_classes = [AllowAny]
