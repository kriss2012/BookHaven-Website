from rest_framework import viewsets, filters
from .models import Book
from .serializers import BookSerializer
from bookhaven.permissions import IsStoreAdmin


class AdminBookViewSet(viewsets.ModelViewSet):
    """
    Admin CRUD ViewSet for Book catalog management.
    Requires IsStoreAdmin (is_staff=True).
    """
    queryset = Book.objects.all().order_by('-id')
    serializer_class = BookSerializer
    permission_classes = [IsStoreAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['title', 'author', 'category']
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']
