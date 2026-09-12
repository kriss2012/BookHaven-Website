from django.contrib import admin
from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('book', 'user', 'rating', 'created_at')
    list_filter = ('rating',)
    search_fields = ('book__title', 'user__email', 'text')
    ordering = ('-created_at',)
