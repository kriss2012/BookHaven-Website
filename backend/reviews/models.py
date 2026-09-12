from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from books.models import Book


class Review(models.Model):
    """User review for a book."""
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='user_reviews')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews')
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('book', 'user')  # one review per user per book

    def __str__(self):
        return f"{self.user.email} → {self.book.title} ({self.rating}★)"
