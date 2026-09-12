"""
BookHaven — Lightweight Idempotent Scheduled Maintenance Task
============================================================
Designed to run periodically (e.g. every 5 minutes via Render Cron or external scheduler).

Key Characteristics:
- Short-lived: Starts, executes quickly, exits cleanly.
- Idempotent: Can be run repeatedly without duplicating changes or causing side effects.
- Zero idle resources: Never calls time.sleep() or creates an infinite loop.
- Safe: Uses transaction.atomic() and graceful error handling.

Usage:
    python manage.py scheduled_task
    python manage.py scheduled_task --stale-order-hours 24
"""

import logging
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from orders.models import Order, Cart
from books.models import Offer

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Executes periodic maintenance (cancels stale orders, checks expired offers, cleans abandoned carts).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--stale-order-hours',
            type=int,
            default=24,
            help='Hours after which an unpaid pending order is considered stale and cancelled (default: 24).',
        )
        parser.add_argument(
            '--cart-retention-days',
            type=int,
            default=30,
            help='Days after which inactive empty carts are purged (default: 30).',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        self.stdout.write(f"[{now.isoformat()}] Starting BookHaven scheduled maintenance task...")
        
        stale_order_hours = options['stale_order_hours']
        cart_retention_days = options['cart_retention_days']

        summary = {
            'orders_cancelled': 0,
            'offers_deactivated': 0,
            'empty_carts_purged': 0,
            'errors': 0,
        }

        # ── 1. Cancel Stale Pending Orders ──────────────────────────────────
        try:
            with transaction.atomic():
                cutoff = now - timedelta(hours=stale_order_hours)
                stale_orders = Order.objects.filter(
                    status='pending',
                    created_at__lt=cutoff
                )
                count = stale_orders.update(status='cancelled')
                summary['orders_cancelled'] = count
                if count > 0:
                    self.stdout.write(self.style.SUCCESS(f"  Cancelled {count} stale pending order(s)."))
        except Exception as exc:
            summary['errors'] += 1
            logger.exception("Error while cancelling stale orders: %s", exc)
            self.stdout.write(self.style.ERROR(f"  Failed to cancel stale orders: {exc}"))

        # ── 2. Deactivate Expired Promotional Offers ────────────────────────
        try:
            with transaction.atomic():
                # Offers with hours_remaining <= 0 that are still marked active
                expired_offers = Offer.objects.filter(
                    is_active=True,
                    hours_remaining__isnull=False,
                    hours_remaining__lte=0
                )
                deactivated = expired_offers.update(is_active=False)
                summary['offers_deactivated'] = deactivated
                if deactivated > 0:
                    self.stdout.write(self.style.SUCCESS(f"  Deactivated {deactivated} expired promotional offer(s)."))
        except Exception as exc:
            summary['errors'] += 1
            logger.exception("Error while deactivating expired offers: %s", exc)
            self.stdout.write(self.style.ERROR(f"  Failed to deactivate expired offers: {exc}"))

        # ── 3. Purge Inactive Empty Carts (Database Size Optimization) ─────
        try:
            with transaction.atomic():
                cart_cutoff = now - timedelta(days=cart_retention_days)
                empty_old_carts = Cart.objects.filter(
                    items__isnull=True,
                    updated_at__lt=cart_cutoff
                )
                deleted_carts, _ = empty_old_carts.delete()
                summary['empty_carts_purged'] = deleted_carts
                if deleted_carts > 0:
                    self.stdout.write(self.style.SUCCESS(f"  Purged {deleted_carts} abandoned empty cart(s)."))
        except Exception as exc:
            summary['errors'] += 1
            logger.exception("Error while purging abandoned carts: %s", exc)
            self.stdout.write(self.style.ERROR(f"  Failed to purge carts: {exc}"))

        # ── Summary Log ─────────────────────────────────────────────────────
        self.stdout.write(self.style.SUCCESS(
            f"Scheduled task finished cleanly: "
            f"Orders cancelled={summary['orders_cancelled']}, "
            f"Offers deactivated={summary['offers_deactivated']}, "
            f"Carts purged={summary['empty_carts_purged']}, "
            f"Errors={summary['errors']}."
        ))
