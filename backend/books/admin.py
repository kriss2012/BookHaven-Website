from django.contrib import admin
from .models import Book, TrendingBook, Offer


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'author', 'category', 'price', 'rating', 'is_ebook', 'is_active')
    list_filter = ('category', 'is_ebook', 'is_active')
    search_fields = ('title', 'author', 'isbn')
    list_editable = ('is_active',)
    ordering = ('id',)


@admin.register(TrendingBook)
class TrendingBookAdmin(admin.ModelAdmin):
    list_display = ('rank', 'book', 'weekly_change', 'is_hot')
    ordering = ('rank',)


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = ('title', 'code', 'discount', 'expiry_label', 'is_active')
    list_filter = ('is_active',)
    list_editable = ('is_active',)
