"""
Management command to seed the BookHaven database with books, trending data, and offers.
Mirrors the hardcoded data from frontend/script.js exactly.

Usage:
    python manage.py seed_books
    python manage.py seed_books --clear   (clears existing data first)
"""

from django.core.management.base import BaseCommand
from books.models import Book, TrendingBook, Offer


BOOKS_DATA = [
    {"id": 1,  "title": "Sapiens",                             "author": "Yuval Noah Harari",    "price": 599, "category": "Classics",  "image_url": "assets/book-1-sapiens.jpg", "rating": 4.8, "reviews_count": 15234, "is_ebook": True,  "badge": "Bestseller"},
    {"id": 2,  "title": "Atomic Habits",                        "author": "James Clear",           "price": 650, "category": "Self-Help", "image_url": "assets/book-2-atomic-habits.jpg", "rating": 4.9, "reviews_count": 23451, "is_ebook": True,  "badge": "Bestseller"},
    {"id": 3,  "title": "1984",                                 "author": "George Orwell",         "price": 399, "category": "Classics",  "image_url": "assets/book-3-1984.jpg", "rating": 4.7, "reviews_count": 18923, "is_ebook": True,  "badge": "Classic"},
    {"id": 4,  "title": "Harry Potter & The Sorcerer's Stone",  "author": "J.K. Rowling",          "price": 399, "category": "Fiction",   "image_url": "assets/harry-potter.jpg", "rating": 4.9, "reviews_count": 45678, "is_ebook": False, "badge": "Bestseller"},
    {"id": 5,  "title": "The Alchemist",                        "author": "Paulo Coelho",          "price": 350, "category": "Fiction",   "image_url": "assets/book-5-the-alchemist.jpg", "rating": 4.6, "reviews_count": 12345, "is_ebook": True,  "badge": "Trending"},
    {"id": 6,  "title": "Psychology of Money",                  "author": "Morgan Housel",         "price": 499, "category": "Self-Help", "image_url": "assets/book-6-psychology-of-money.jpg", "rating": 4.8, "reviews_count": 9876,  "is_ebook": True,  "badge": "Hot"},
    {"id": 7,  "title": "The Great Gatsby",                     "author": "F. Scott Fitzgerald",   "price": 275, "category": "Classics",  "image_url": "assets/book-7-the-great-gatsby.jpg", "rating": 4.5, "reviews_count": 8765,  "is_ebook": True,  "badge": "Classic"},
    {"id": 8,  "title": "Deep Work",                            "author": "Cal Newport",           "price": 525, "category": "Self-Help", "image_url": "assets/book-8-deep-work.jpg", "rating": 4.7, "reviews_count": 7654,  "is_ebook": False, "badge": "Bestseller"},
    {"id": 9,  "title": "The Hobbit",                           "author": "J.R.R. Tolkien",        "price": 450, "category": "Fiction",   "image_url": "assets/book-9-the-hobbit.jpg", "rating": 4.8, "reviews_count": 21345, "is_ebook": False, "badge": "Classic"},
    {"id": 10, "title": "Dune",                                 "author": "Frank Herbert",         "price": 599, "category": "Sci-Fi",   "image_url": "assets/book-10-dune.jpg", "rating": 4.8, "reviews_count": 31200, "is_ebook": True,  "badge": "Epic"},
    {"id": 11, "title": "Thinking, Fast and Slow",              "author": "Daniel Kahneman",       "price": 549, "category": "Self-Help", "image_url": "assets/book-11-thinking-fast-and-slow.jpg", "rating": 4.6, "reviews_count": 14500, "is_ebook": True,  "badge": "Bestseller"},
    {"id": 12, "title": "To Kill a Mockingbird",                "author": "Harper Lee",            "price": 325, "category": "Classics",  "image_url": "assets/book-12-to-kill-a-mockingbird.jpg", "rating": 4.7, "reviews_count": 22100, "is_ebook": True,  "badge": "Classic"},
    {"id": 13, "title": "The Da Vinci Code",                    "author": "Dan Brown",             "price": 449, "category": "Mystery",   "image_url": "assets/book-13-the-da-vinci-code.jpg", "rating": 4.4, "reviews_count": 19800, "is_ebook": True,  "badge": "Thriller"},
    {"id": 14, "title": "Gone Girl",                            "author": "Gillian Flynn",         "price": 399, "category": "Mystery",   "image_url": "assets/book-14-gone-girl.jpg", "rating": 4.3, "reviews_count": 16300, "is_ebook": True,  "badge": "Bestseller"},
    {"id": 15, "title": "The Martian",                          "author": "Andy Weir",             "price": 499, "category": "Sci-Fi",   "image_url": "assets/book-15-the-martian.jpg", "rating": 4.7, "reviews_count": 18700, "is_ebook": True,  "badge": "Award Winner"},
    {"id": 16, "title": "Zero to One",                          "author": "Peter Thiel",           "price": 575, "category": "Business",  "image_url": "assets/book-16-zero-to-one.jpg", "rating": 4.5, "reviews_count": 11200, "is_ebook": True,  "badge": "Must Read"},
    {"id": 17, "title": "The Lean Startup",                     "author": "Eric Ries",             "price": 525, "category": "Business",  "image_url": "assets/book-17-the-lean-startup.jpg", "rating": 4.4, "reviews_count": 9800,  "is_ebook": False, "badge": "Startup Bible"},
    {"id": 18, "title": "Steve Jobs",                           "author": "Walter Isaacson",       "price": 699, "category": "Biography", "image_url": "assets/book-18-steve-jobs.jpg", "rating": 4.6, "reviews_count": 17600, "is_ebook": True,  "badge": "Inspiring"},
    {"id": 19, "title": "Elon Musk",                            "author": "Walter Isaacson",       "price": 749, "category": "Biography", "image_url": "assets/book-19-elon-musk.jpg", "rating": 4.5, "reviews_count": 8400,  "is_ebook": True,  "badge": "New"},
    {"id": 20, "title": "Brave New World",                      "author": "Aldous Huxley",         "price": 349, "category": "Classics",  "image_url": "assets/book-20-brave-new-world.jpg", "rating": 4.4, "reviews_count": 13200, "is_ebook": True,  "badge": "Classic"},
    {"id": 21, "title": "The Girl with the Dragon Tattoo",      "author": "Stieg Larsson",         "price": 429, "category": "Mystery",   "image_url": "assets/book-21-the-girl-with-the-dragon-tattoo.jpg", "rating": 4.5, "reviews_count": 15700, "is_ebook": False, "badge": "Thriller"},
    {"id": 22, "title": "Ender's Game",                         "author": "Orson Scott Card",      "price": 399, "category": "Sci-Fi",   "image_url": "assets/book-22-enders-game.jpg", "rating": 4.6, "reviews_count": 12900, "is_ebook": True,  "badge": "Sci-Fi Classic"},
    {"id": 23, "title": "The 7 Habits of Highly Effective People","author": "Stephen R. Covey",   "price": 499, "category": "Self-Help", "image_url": "assets/book-23-the-7-habits.jpg", "rating": 4.7, "reviews_count": 20100, "is_ebook": True,  "badge": "Life Changer"},
    {"id": 24, "title": "Good to Great",                        "author": "Jim Collins",           "price": 549, "category": "Business",  "image_url": "assets/book-24-good-to-great.jpg", "rating": 4.5, "reviews_count": 10300, "is_ebook": False, "badge": "Business"},
    {"id": 25, "title": "The Power of Now",                     "author": "Eckhart Tolle",         "price": 399, "category": "Self-Help", "image_url": "assets/book-25-the-power-of-now.jpg", "rating": 4.4, "reviews_count": 11800, "is_ebook": True,  "badge": "Mindfulness"},
    {"id": 26, "title": "Born a Crime",                         "author": "Trevor Noah",           "price": 449, "category": "Biography", "image_url": "assets/book-26-born-a-crime.jpg", "rating": 4.8, "reviews_count": 14200, "is_ebook": True,  "badge": "Memoir"},
    {"id": 27, "title": "A Brief History of Time",              "author": "Stephen Hawking",       "price": 375, "category": "Sci-Fi",   "image_url": "assets/book-27-a-brief-history-of-time.jpg", "rating": 4.5, "reviews_count": 16500, "is_ebook": True,  "badge": "Classic"},
    {"id": 28, "title": "The Silent Patient",                   "author": "Alex Michaelides",      "price": 425, "category": "Mystery",   "image_url": "assets/book-28-the-silent-patient.jpg", "rating": 4.5, "reviews_count": 13700, "is_ebook": True,  "badge": "Thriller"},
]

TRENDING_DATA = [
    {"rank": 1, "book_id": 2,  "weekly_change": "+12%", "is_hot": True},
    {"rank": 2, "book_id": 1,  "weekly_change": "+8%",  "is_hot": True},
    {"rank": 3, "book_id": 28, "weekly_change": "+22%", "is_hot": True},
    {"rank": 4, "book_id": 4,  "weekly_change": "+5%",  "is_hot": False},
    {"rank": 5, "book_id": 10, "weekly_change": "+18%", "is_hot": True},
    {"rank": 6, "book_id": 6,  "weekly_change": "+9%",  "is_hot": False},
    {"rank": 7, "book_id": 19, "weekly_change": "+31%", "is_hot": True},
    {"rank": 8, "book_id": 26, "weekly_change": "+14%", "is_hot": True},
]

OFFERS_DATA = [
    {"gradient_class": "offer-card-1", "discount": "30% OFF",  "title": "Classics Collection",  "description": "On all classic literature books. Perfect for bookworms!",          "code": "CLASSIC30",    "expiry_label": "3 days",   "hours_remaining": 71},
    {"gradient_class": "offer-card-2", "discount": "₹150 OFF", "title": "Self-Help Bundle",      "description": "Buy any 2 self-help books and get ₹150 off your total.",           "code": "SELFHELP150",  "expiry_label": "1 day",    "hours_remaining": 23},
    {"gradient_class": "offer-card-3", "discount": "25% OFF",  "title": "eBook Special",         "description": "All eBooks at 25% off — read instantly on any device!",           "code": "EBOOK25",      "expiry_label": "5 days",   "hours_remaining": 119},
    {"gradient_class": "offer-card-4", "discount": "FREE",     "title": "Delivery Offer",        "description": "Free delivery on all orders above ₹499. No code needed.",          "code": "AUTO APPLIED", "expiry_label": "Always",   "hours_remaining": None},
    {"gradient_class": "offer-card-5", "discount": "40% OFF",  "title": "New User Deal",         "description": "First order? Get a massive 40% off any single book!",             "code": "NEWREADER40",  "expiry_label": "7 days",   "hours_remaining": 167},
    {"gradient_class": "offer-card-6", "discount": "₹200 OFF", "title": "Weekend Sale",          "description": "This weekend only — spend ₹800 or more and save ₹200!",           "code": "WEEKEND200",   "expiry_label": "2 days",   "hours_remaining": 47},
]


class Command(BaseCommand):
    help = 'Seed the database with BookHaven books, trending data, and offers.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before seeding.',
        )

    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write('Clearing existing data...')
            TrendingBook.objects.all().delete()
            Offer.objects.all().delete()
            Book.objects.all().delete()
            self.stdout.write(self.style.WARNING('  Cleared all books, trending, offers.'))

        # Seed books
        books_created = 0
        books_updated = 0
        for data in BOOKS_DATA:
            book_id = data.pop('id')
            book, created = Book.objects.update_or_create(
                id=book_id,
                defaults=data,
            )
            data['id'] = book_id  # restore for reuse
            if created:
                books_created += 1
            else:
                books_updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'[Books] {books_created} created, {books_updated} updated'
        ))

        # Seed trending
        trending_created = 0
        for t in TRENDING_DATA:
            try:
                book = Book.objects.get(id=t['book_id'])
                TrendingBook.objects.update_or_create(
                    book=book,
                    defaults={'rank': t['rank'], 'weekly_change': t['weekly_change'], 'is_hot': t['is_hot']},
                )
                trending_created += 1
            except Book.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"  Book id={t['book_id']} not found for trending."))

        self.stdout.write(self.style.SUCCESS(f'[Trending] {trending_created} entries seeded'))

        # Seed offers
        Offer.objects.all().delete()
        for offer in OFFERS_DATA:
            Offer.objects.create(**offer)

        self.stdout.write(self.style.SUCCESS(f'[Offers] {len(OFFERS_DATA)} seeded'))
        self.stdout.write(self.style.SUCCESS('BookHaven database seeded successfully!'))
