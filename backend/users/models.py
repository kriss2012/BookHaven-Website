from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Extended user model for BookHaven."""
    name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Clerk authentication — stores the Clerk user ID (user_xxx…) so we can
    # look up this user without relying on email matching.
    clerk_user_id = models.CharField(max_length=255, blank=True, null=True, unique=True, db_index=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email

    def get_display_name(self):
        return self.name or self.email.split('@')[0]
