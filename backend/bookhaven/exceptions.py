import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings

logger = logging.getLogger(__name__)


def bookhaven_exception_handler(exc, context):
    """
    Custom DRF exception handler returning uniform JSON error structure:
    {
        "success": false,
        "error": {
            "code": "ERROR_CODE",
            "message": "Human readable message",
            "details": {...}  # optional field validation details
        }
    }
    """
    # Call REST framework's default exception handler first to get the standard response.
    response = exception_handler(exc, context)

    view_name = context.get('view').__class__.__name__ if context.get('view') else 'UnknownView'

    if response is not None:
        error_code = 'API_ERROR'
        message = 'A request error occurred.'
        details = None

        if response.status_code == status.HTTP_400_BAD_REQUEST:
            error_code = 'VALIDATION_ERROR'
            message = 'Invalid input data.'
            details = response.data
        elif response.status_code == status.HTTP_401_UNAUTHORIZED:
            error_code = 'AUTHENTICATION_REQUIRED'
            message = response.data.get('detail', 'Authentication credentials were not provided or are invalid.')
        elif response.status_code == status.HTTP_403_FORBIDDEN:
            error_code = 'PERMISSION_DENIED'
            message = response.data.get('detail', 'You do not have permission to perform this action.')
        elif response.status_code == status.HTTP_404_NOT_FOUND:
            error_code = 'NOT_FOUND'
            message = response.data.get('detail', 'The requested resource was not found.')
        elif response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED:
            error_code = 'METHOD_NOT_ALLOWED'
            message = response.data.get('detail', f'Method not allowed on this endpoint.')
        elif response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            error_code = 'RATE_LIMITED'
            message = response.data.get('detail', 'Request was throttled. Please slow down.')
        else:
            if isinstance(response.data, dict) and 'detail' in response.data:
                message = str(response.data['detail'])

        response.data = {
            'success': False,
            'error': {
                'code': error_code,
                'message': str(message),
                'details': details if details and error_code == 'VALIDATION_ERROR' else None,
            }
        }
        return response

    # Unhandled exception (500)
    logger.exception(f"Unhandled exception in API view {view_name}: {exc}")
    
    error_message = str(exc) if getattr(settings, 'DEBUG', False) else 'An unexpected error occurred. Please try again later.'
    
    return Response(
        {
            'success': False,
            'error': {
                'code': 'INTERNAL_SERVER_ERROR',
                'message': error_message,
                'details': None,
            }
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
