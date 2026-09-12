"""BookHaven URL Configuration"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from .health import health_check, root_index

urlpatterns = [
    # Root & Health checks
    path('', root_index, name='root-index'),
    path('api/health/', health_check, name='api-health'),
    path('health/', health_check, name='health'),

    # Admin
    path('admin/', admin.site.urls),

    # API Endpoints
    path('api/auth/', include('users.urls')),
    path('api/books/', include('books.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/reviews/', include('reviews.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
