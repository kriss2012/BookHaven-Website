import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const books = [
  { id: 1, slug: 'sapiens', title: "Sapiens", url: "https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg" },
  { id: 2, slug: 'atomic-habits', title: "Atomic Habits", url: "https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg" },
  { id: 3, slug: '1984', title: "1984", url: "https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg" },
  { id: 4, slug: 'harry-potter', title: "Harry Potter & The Sorcerer's Stone", url: null }, // already assets/harry-potter.jpg
  { id: 5, slug: 'the-alchemist', title: "The Alchemist", url: "https://covers.openlibrary.org/b/isbn/9780062315007-L.jpg" },
  { id: 6, slug: 'psychology-of-money', title: "Psychology of Money", url: "https://covers.openlibrary.org/b/isbn/9780857197689-L.jpg" },
  { id: 7, slug: 'the-great-gatsby', title: "The Great Gatsby", url: "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg" },
  { id: 8, slug: 'deep-work', title: "Deep Work", url: "https://covers.openlibrary.org/b/isbn/9781455586691-L.jpg" },
  { id: 9, slug: 'the-hobbit', title: "The Hobbit", url: "https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg" },
  { id: 10, slug: 'dune', title: "Dune", url: "https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg" },
  { id: 11, slug: 'thinking-fast-and-slow', title: "Thinking, Fast and Slow", url: "https://covers.openlibrary.org/b/isbn/9780374533557-L.jpg" },
  { id: 12, slug: 'to-kill-a-mockingbird', title: "To Kill a Mockingbird", url: "https://covers.openlibrary.org/b/isbn/9780061935466-L.jpg" },
  { id: 13, slug: 'the-da-vinci-code', title: "The Da Vinci Code", url: "https://covers.openlibrary.org/b/isbn/9780307474278-L.jpg" },
  { id: 14, slug: 'gone-girl', title: "Gone Girl", url: "https://covers.openlibrary.org/b/isbn/9780307588364-L.jpg" },
  { id: 15, slug: 'the-martian', title: "The Martian", url: "https://covers.openlibrary.org/b/isbn/9780804139021-L.jpg" },
  { id: 16, slug: 'zero-to-one', title: "Zero to One", url: "https://covers.openlibrary.org/b/isbn/9780804139298-L.jpg" },
  { id: 17, slug: 'the-lean-startup', title: "The Lean Startup", url: "https://covers.openlibrary.org/b/isbn/9780307887894-L.jpg" },
  { id: 18, slug: 'steve-jobs', title: "Steve Jobs", url: "https://covers.openlibrary.org/b/isbn/9781451648539-L.jpg" },
  { id: 19, slug: 'elon-musk', title: "Elon Musk", url: "https://covers.openlibrary.org/b/isbn/9781982181284-L.jpg" },
  { id: 20, slug: 'brave-new-world', title: "Brave New World", url: "https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg" },
  { id: 21, slug: 'the-girl-with-the-dragon-tattoo', title: "The Girl with the Dragon Tattoo", url: "https://covers.openlibrary.org/b/isbn/9780307454546-L.jpg" },
  { id: 22, slug: 'enders-game', title: "Ender's Game", url: "https://covers.openlibrary.org/b/isbn/9780812550702-L.jpg" },
  { id: 23, slug: 'the-7-habits', title: "The 7 Habits of Highly Effective People", url: "https://covers.openlibrary.org/b/isbn/9780743269513-L.jpg" },
  { id: 24, slug: 'good-to-great', title: "Good to Great", url: "https://covers.openlibrary.org/b/isbn/9780066620992-L.jpg" },
  { id: 25, slug: 'the-power-of-now', title: "The Power of Now", url: "https://covers.openlibrary.org/b/isbn/9781577314806-L.jpg" },
  { id: 26, slug: 'born-a-crime', title: "Born a Crime", url: "https://covers.openlibrary.org/b/isbn/9780399588174-L.jpg" },
  { id: 27, slug: 'a-brief-history-of-time', title: "A Brief History of Time", url: "https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg" },
  { id: 28, slug: 'the-silent-patient', title: "The Silent Patient", url: "https://covers.openlibrary.org/b/isbn/9781250301697-L.jpg" },
];

const siteImages = [
  { name: 'cat-fiction.jpg', url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&q=80' },
  { name: 'cat-nonfiction.jpg', url: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600&q=80' },
  { name: 'cat-business.jpg', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&q=80' },
  { name: 'cat-scifi.jpg', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=80' },
  { name: 'cat-classics.jpg', url: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=600&q=80' },
  { name: 'cat-mystery.jpg', url: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=600&q=80' },
  { name: 'journal-1.jpg', url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&q=80' },
  { name: 'journal-2.jpg', url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80' },
  { name: 'journal-3.jpg', url: 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=600&q=80' },
];

function downloadUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const redirectUrl = new URL(res.headers.location, url).href;
        return resolve(downloadUrl(redirectUrl, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Timeout'));
    });
  });
}

async function run() {
  const assetsDir = path.resolve('frontend/assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  console.log('Downloading site images...');
  for (const item of siteImages) {
    const dest = path.join(assetsDir, item.name);
    try {
      const buf = await downloadUrl(item.url);
      fs.writeFileSync(dest, buf);
      console.log(`[OK] Site image: ${item.name} (${buf.length} bytes)`);
    } catch (e) {
      console.error(`[FAIL] Site image: ${item.name}: ${e.message}`);
    }
  }

  console.log('\nChecking & Downloading book covers...');
  for (const b of books) {
    if (!b.url) {
      console.log(`[SKIP] Book ${b.id} (${b.title}) already local (assets/harry-potter.jpg)`);
      continue;
    }
    const filename = `book-${b.id}-${b.slug}.jpg`;
    const dest = path.join(assetsDir, filename);
    try {
      const buf = await downloadUrl(b.url);
      // Check if openlibrary returned the 1x1 blank gif or < 1000 bytes
      if (buf.length < 1000) {
        console.warn(`[WARN] Book ${b.id} (${b.title}): Downloaded buffer is small (${buf.length} bytes), possible blank!`);
      } else {
        fs.writeFileSync(dest, buf);
        console.log(`[OK] Book ${b.id}: ${filename} (${buf.length} bytes)`);
      }
    } catch (e) {
      console.error(`[FAIL] Book ${b.id} (${b.title}): ${e.message}`);
    }
  }
}

run();
