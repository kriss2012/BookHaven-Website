import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

function isbn13To10(isbn13) {
  const clean = isbn13.replace(/[^0-9X]/gi, '');
  if (clean.length === 10) return clean;
  if (clean.length !== 13 || !clean.startsWith('978')) return null;
  const core = clean.substring(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(core[i], 10) * (10 - i);
  }
  const rem = 11 - (sum % 11);
  let check = '';
  if (rem === 10) check = 'X';
  else if (rem === 11) check = '0';
  else check = rem.toString();
  return core + check;
}

const books = [
  { id: 1, slug: 'sapiens', title: "Sapiens", isbn: "9780062316097" },
  { id: 2, slug: 'atomic-habits', title: "Atomic Habits", isbn: "9780735211292" },
  { id: 3, slug: '1984', title: "1984", isbn: "9780451524935" },
  { id: 4, slug: 'harry-potter', title: "Harry Potter & The Sorcerer's Stone", local: 'assets/harry-potter.jpg' },
  { id: 5, slug: 'the-alchemist', title: "The Alchemist", isbn: "9780062315007" },
  { id: 6, slug: 'psychology-of-money', title: "Psychology of Money", isbn: "9780857197689" },
  { id: 7, slug: 'the-great-gatsby', title: "The Great Gatsby", isbn: "9780743273565" },
  { id: 8, slug: 'deep-work', title: "Deep Work", isbn: "9781455586691" },
  { id: 9, slug: 'the-hobbit', title: "The Hobbit", isbn: "9780547928227" },
  { id: 10, slug: 'dune', title: "Dune", isbn: "9780441013593" },
  { id: 11, slug: 'thinking-fast-and-slow', title: "Thinking, Fast and Slow", isbn: "9780374533557" },
  { id: 12, slug: 'to-kill-a-mockingbird', title: "To Kill a Mockingbird", isbn: "9780061935466" },
  { id: 13, slug: 'the-da-vinci-code', title: "The Da Vinci Code", isbn: "9780307474278" },
  { id: 14, slug: 'gone-girl', title: "Gone Girl", isbn: "9780307588364" },
  { id: 15, slug: 'the-martian', title: "The Martian", isbn: "9780804139021" },
  { id: 16, slug: 'zero-to-one', title: "Zero to One", isbn: "9780804139298" },
  { id: 17, slug: 'the-lean-startup', title: "The Lean Startup", isbn: "9780307887894" },
  { id: 18, slug: 'steve-jobs', title: "Steve Jobs", isbn: "9781451648539" },
  { id: 19, slug: 'elon-musk', title: "Elon Musk", isbn: "9781982181284" },
  { id: 20, slug: 'brave-new-world', title: "Brave New World", isbn: "9780060850524" },
  { id: 21, slug: 'the-girl-with-the-dragon-tattoo', title: "The Girl with the Dragon Tattoo", isbn: "9780307454546" },
  { id: 22, slug: 'enders-game', title: "Ender's Game", isbn: "9780812550702" },
  { id: 23, slug: 'the-7-habits', title: "The 7 Habits of Highly Effective People", isbn: "9780743269513" },
  { id: 24, slug: 'good-to-great', title: "Good to Great", isbn: "9780066620992" },
  { id: 25, slug: 'the-power-of-now', title: "The Power of Now", isbn: "9781577314806" },
  { id: 26, slug: 'born-a-crime', title: "Born a Crime", isbn: "9780399588174" },
  { id: 27, slug: 'a-brief-history-of-time', title: "A Brief History of Time", isbn: "9780553380163" },
  { id: 28, slug: 'the-silent-patient', title: "The Silent Patient", isbn: "9781250301697" },
];

function downloadBuffer(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const redirectUrl = new URL(res.headers.location, url).href;
        return resolve(downloadBuffer(redirectUrl, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error('Timeout'));
    });
  });
}

function isValidImage(buf) {
  if (!buf || buf.length < 2000) return false;
  // JPEG starts with FF D8 FF
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  // PNG starts with 89 50 4E 47
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  // WebP starts with RIFF ... WEBP
  const isWebp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp;
}

async function fetchBookCover(book) {
  const isbn10 = book.isbn ? isbn13To10(book.isbn) : null;
  const urls = [];

  if (isbn10) {
    // Amazon high-res cover
    urls.push(`https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01._SCLZZZZZZZ_SX500_.jpg`);
    urls.push(`https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`);
  }
  if (book.isbn) {
    urls.push(`https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg?default=false`);
    urls.push(`https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false`);
  }

  for (const url of urls) {
    try {
      const buf = await downloadBuffer(url);
      if (isValidImage(buf)) {
        return { buf, source: url };
      }
    } catch (_) {}
  }
  return null;
}

async function run() {
  const assetsDir = path.resolve('frontend/assets');
  let successCount = 0;
  let missing = [];

  for (const book of books) {
    const filename = book.id === 4 ? 'harry-potter.jpg' : `book-${book.id}-${book.slug}.jpg`;
    const targetPath = path.join(assetsDir, filename);

    if (book.id === 4 && fs.existsSync(targetPath)) {
      const size = fs.statSync(targetPath).size;
      console.log(`[OK] Book 4 (Harry Potter): Already exists (${size} bytes)`);
      successCount++;
      continue;
    }

    // Check if already downloaded and valid
    if (fs.existsSync(targetPath)) {
      const existingBuf = fs.readFileSync(targetPath);
      if (isValidImage(existingBuf)) {
        console.log(`[OK] Book ${book.id} (${book.title}): Already valid (${existingBuf.length} bytes)`);
        successCount++;
        continue;
      }
    }

    console.log(`Fetching Book ${book.id}: ${book.title}...`);
    const res = await fetchBookCover(book);
    if (res && res.buf) {
      fs.writeFileSync(targetPath, res.buf);
      console.log(`[OK] Book ${book.id} (${book.title}) -> ${filename} (${res.buf.length} bytes) from ${res.source.substring(0, 50)}...`);
      successCount++;
    } else {
      console.error(`[MISSING] Book ${book.id} (${book.title}) failed all sources!`);
      missing.push(book);
    }
  }

  console.log(`\nFinished: ${successCount} / ${books.length} books downloaded.`);
  if (missing.length > 0) {
    console.log('Missing books:', missing.map(b => `${b.id}: ${b.title}`));
  }
}

run();
