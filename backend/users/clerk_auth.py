"""
BookHaven — Clerk JWT Authentication Backend
=============================================
A DRF authentication class that verifies JWTs issued by Clerk using
Clerk's JWKS (JSON Web Key Set). Falls through gracefully so that
simplejwt tokens (used for Django Admin / legacy API calls) still work.
"""

import json
import time
import logging
import urllib.request

from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

logger = logging.getLogger(__name__)

# ─── JWKS Cache ─────────────────────────────────────────────────────────────
# We cache the public keys so we don't hit Clerk's JWKS endpoint on every
# request. Cache is refreshed once per hour.
_jwks_cache: dict = {'keys': None, 'fetched_at': 0.0}
JWKS_CACHE_TTL = 3600  # seconds


def _get_clerk_jwks() -> list:
    """Fetch (or return cached) Clerk JWKS public keys."""
    now = time.time()
    if _jwks_cache['keys'] and (now - _jwks_cache['fetched_at']) < JWKS_CACHE_TTL:
        return _jwks_cache['keys']

    frontend_api = getattr(settings, 'CLERK_FRONTEND_API_URL', '').rstrip('/')
    if not frontend_api:
        logger.warning('[ClerkAuth] CLERK_FRONTEND_API_URL not configured in settings.')
        return _jwks_cache['keys'] or []

    jwks_url = f'{frontend_api}/.well-known/jwks.json'
    try:
        with urllib.request.urlopen(jwks_url, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            keys = data.get('keys', [])
            _jwks_cache['keys'] = keys
            _jwks_cache['fetched_at'] = now
            logger.debug('[ClerkAuth] JWKS refreshed — %d key(s) loaded.', len(keys))
            return keys
    except Exception as exc:
        logger.warning('[ClerkAuth] Failed to fetch JWKS from %s: %s', jwks_url, exc)
        return _jwks_cache['keys'] or []  # Return stale cache if available


# ─── Authentication Class ────────────────────────────────────────────────────

class ClerkJWTAuthentication(BaseAuthentication):
    """
    DRF authentication backend for Clerk-issued JWTs.

    How it works:
    1. Reads the Authorization: Bearer <token> header.
    2. Peeks at the unverified JWT payload to detect Clerk tokens
       (they contain 'azp' or 'sid' claims).
    3. Verifies the signature using Clerk's public JWKS.
    4. Looks up (or creates) the local Django User by Clerk user ID.
    5. Returns (user, None) on success, or raises AuthenticationFailed.

    If the token doesn't look like a Clerk token it returns None, allowing
    the next authentication class (JWTAuthentication / simplejwt) to try.
    """

    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split(' ', 1)[1].strip()
        if not token:
            return None

        # ── Peek at unverified payload ──────────────────────────────────────
        try:
            import jwt as pyjwt
            unverified_payload = pyjwt.decode(
                token,
                options={"verify_signature": False},
                algorithms=["RS256"],
            )
        except Exception:
            return None  # Not a valid JWT — let simplejwt handle it

        # Clerk tokens always have 'azp' (authorised party) or 'sid' claims.
        # simplejwt tokens don't. This prevents double-processing.
        if 'azp' not in unverified_payload and 'sid' not in unverified_payload:
            return None

        # ── Verify signature with JWKS ──────────────────────────────────────
        import jwt as pyjwt

        keys = _get_clerk_jwks()
        if not keys:
            raise AuthenticationFailed('Clerk JWKS unavailable. Check CLERK_FRONTEND_API_URL.')

        last_error = None
        for key_data in keys:
            try:
                public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key_data))
                payload = pyjwt.decode(
                    token,
                    public_key,
                    algorithms=['RS256'],
                    options={"verify_exp": True},
                )
                user = self._resolve_user(payload)
                return (user, None)
            except pyjwt.ExpiredSignatureError:
                raise AuthenticationFailed('Clerk session token has expired. Please sign in again.')
            except pyjwt.InvalidTokenError as exc:
                last_error = exc
                continue  # Try next key

        raise AuthenticationFailed(f'Clerk token verification failed: {last_error}')

    # ── Internal helpers ─────────────────────────────────────────────────────

    def _resolve_user(self, payload: dict):
        """Look up or create a local Django User from a verified Clerk payload."""
        from users.models import User  # Lazy import to avoid circular deps

        clerk_user_id = payload.get('sub', '').strip()
        if not clerk_user_id:
            raise AuthenticationFailed('Clerk token missing subject (sub) claim.')

        email = self._extract_email(payload)
        name = self._extract_name(payload)

        # 1. Find by Clerk user ID (fastest, most reliable)
        user = User.objects.filter(clerk_user_id=clerk_user_id).first()

        # 2. Fall back to email match (for users created before Clerk migration)
        if not user and email:
            user = User.objects.filter(email=email).first()
            if user:
                # Backfill the Clerk user ID so future lookups are instant
                user.clerk_user_id = clerk_user_id
                user.save(update_fields=['clerk_user_id'])

        # 3. Create brand-new user
        if not user:
            user = self._create_user(clerk_user_id, email, name)

        if not user.is_active:
            raise AuthenticationFailed('This account has been disabled.')

        return user

    def _create_user(self, clerk_user_id: str, email: str, name: str):
        """Create a new User record for a Clerk identity."""
        from users.models import User

        # Generate a unique username from the email
        base_username = (email.split('@')[0] if email else clerk_user_id[:20]).lower()
        username = base_username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f'{base_username}{counter}'
            counter += 1

        user = User(
            clerk_user_id=clerk_user_id,
            email=email or f'{clerk_user_id}@clerk-placeholder.dev',
            username=username,
            name=name or username,
        )
        user.set_unusable_password()
        user.save()
        logger.info('[ClerkAuth] Created new user %s (Clerk ID: %s)', email, clerk_user_id)
        return user

    @staticmethod
    def _extract_email(payload: dict) -> str:
        """Extract email from Clerk JWT payload (handles various template shapes)."""
        return payload.get('email', '') or ''

    @staticmethod
    def _extract_name(payload: dict) -> str:
        """Compose full name from Clerk first/last name claims."""
        first = payload.get('first_name') or ''
        last = payload.get('last_name') or ''
        full = (first + ' ' + last).strip()
        return full or payload.get('name', '')
