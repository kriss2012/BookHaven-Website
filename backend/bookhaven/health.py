from django.http import JsonResponse
from django.views.decorators.http import require_http_methods


@require_http_methods(["GET", "HEAD"])
def health_check(request):
    """
    Lightweight health check endpoint for Render monitoring and uptime checks.
    Supports both GET and HEAD requests.
    """
    return JsonResponse({
        "status": "ok",
        "service": "bookhaven-api"
    })


@require_http_methods(["GET", "HEAD"])
def root_index(request):
    """
    Root endpoint for BookHaven API.
    Returns service metadata and endpoint directory so root probes return 200 OK.
    """
    return JsonResponse({
        "service": "BookHaven REST API",
        "status": "active",
        "version": "1.0",
        "endpoints": {
            "health": "/api/health/",
            "books": "/api/books/",
            "trending": "/api/books/trending/",
            "offers": "/api/books/offers/",
            "auth": "/api/auth/",
            "orders": "/api/orders/",
            "reviews": "/api/reviews/",
            "admin": "/admin/"
        }
    })
