from django.db import models


class Book(models.Model):
    """A book in the BookHaven catalog."""

    CATEGORY_CHOICES = [
        ('Classics', 'Classics'),
        ('Self-Help', 'Self-Help'),
        ('Fiction', 'Fiction'),
        ('Mystery', 'Mystery'),
        ('Sci-Fi', 'Sci-Fi'),
        ('Biography', 'Biography'),
        ('Business', 'Business'),
    ]

    title = models.CharField(max_length=300)
    author = models.CharField(max_length=200)
    price = models.PositiveIntegerField(help_text='Price in INR (paise-free)')
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    image_url = models.URLField(max_length=500, blank=True)
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=4.0)
    reviews_count = models.PositiveIntegerField(default=0)
    is_ebook = models.BooleanField(default=False)
    badge = models.CharField(max_length=50, blank=True, default='Bestseller')
    description = models.TextField(blank=True)
    isbn = models.CharField(max_length=20, blank=True)
    stock = models.PositiveIntegerField(default=15, help_text='Inventory stock count')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.title} — {self.author}"

    @property
    def ebook_price(self):
        """eBook is 40% cheaper."""
        return round(self.price * 0.6)


class TrendingBook(models.Model):
    """Weekly trending books with rank and change metrics."""
    book = models.OneToOneField(Book, on_delete=models.CASCADE, related_name='trending')
    rank = models.PositiveSmallIntegerField(unique=True)
    weekly_change = models.CharField(max_length=10, default='+0%')
    is_hot = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['rank']

    def __str__(self):
        return f"#{self.rank} — {self.book.title}"


class Offer(models.Model):
    """Promotional offers/discount codes."""
    gradient_class = models.CharField(max_length=30, default='offer-card-1')
    discount = models.CharField(max_length=20)
    title = models.CharField(max_length=100)
    description = models.TextField()
    code = models.CharField(max_length=30)
    expiry_label = models.CharField(max_length=30, default='3 days')
    hours_remaining = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.title} ({self.code})"
