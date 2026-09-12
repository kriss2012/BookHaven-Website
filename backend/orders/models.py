import uuid
from django.db import models
from django.conf import settings
from books.models import Book


class Cart(models.Model):
    """Shopping cart for a logged-in user."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart — {self.user.email}"

    @property
    def total(self):
        return sum(item.subtotal for item in self.items.all())

    @property
    def item_count(self):
        return sum(item.quantity for item in self.items.all())


class CartItem(models.Model):
    FORMAT_CHOICES = [('physical', 'Physical'), ('ebook', 'eBook')]

    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    book = models.ForeignKey(Book, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES, default='physical')
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('cart', 'book', 'format')

    def __str__(self):
        return f"{self.book.title} ({self.format}) ×{self.quantity}"

    @property
    def unit_price(self):
        if self.format == 'ebook':
            return self.book.ebook_price
        return self.book.price

    @property
    def subtotal(self):
        return self.unit_price * self.quantity


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending',    'Pending'),
        ('confirmed',  'Confirmed'),
        ('processing', 'Processing'),
        ('shipped',    'Shipped'),
        ('delivered',  'Delivered'),
        ('cancelled',  'Cancelled'),
        ('refunded',   'Refunded'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='orders')
    tracking_id = models.CharField(max_length=20, unique=True, editable=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='confirmed')
    total = models.PositiveIntegerField(help_text='Total in INR')
    delivery_address = models.TextField(blank=True)
    coupon_code = models.CharField(max_length=30, blank=True)
    discount_amount = models.PositiveIntegerField(default=0)
    payment_method = models.CharField(max_length=50, default='UPI')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Order #{self.tracking_id} — {self.user.email}"

    def save(self, *args, **kwargs):
        if not self.tracking_id:
            self.tracking_id = 'BH' + uuid.uuid4().hex[:8].upper()
        super().save(*args, **kwargs)


class OrderItem(models.Model):
    FORMAT_CHOICES = [('physical', 'Physical'), ('ebook', 'eBook')]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    book = models.ForeignKey(Book, on_delete=models.SET_NULL, null=True)
    title = models.CharField(max_length=300)   # snapshot
    author = models.CharField(max_length=200)  # snapshot
    quantity = models.PositiveIntegerField(default=1)
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES, default='physical')
    unit_price = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.title} ×{self.quantity}"

    @property
    def subtotal(self):
        return self.unit_price * self.quantity

class Wishlist(models.Model):
    """Wishlist for a logged-in user."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='wishlist')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Wishlist — {self.user.email}"

class WishlistItem(models.Model):
    wishlist = models.ForeignKey(Wishlist, on_delete=models.CASCADE, related_name='items')
    book = models.ForeignKey(Book, on_delete=models.CASCADE)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('wishlist', 'book')

    def __str__(self):
        return f"{self.book.title} in {self.wishlist}"

