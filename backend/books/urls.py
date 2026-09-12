from django.urls import path
from . import views

urlpatterns = [
    path('', views.BookListView.as_view(), name='book-list'),
    path('trending/', views.TrendingBooksView.as_view(), name='book-trending'),
    path('ebooks/', views.EbookListView.as_view(), name='book-ebooks'),
    path('offers/', views.OfferListView.as_view(), name='offer-list'),
    path('<int:pk>/', views.BookDetailView.as_view(), name='book-detail'),
]
