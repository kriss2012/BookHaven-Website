import http from 'http';
import fs from 'fs';
import path from 'path';

const FRONTEND_DIR = path.resolve('frontend');
const PORT = 8086;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(FRONTEND_DIR, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log('Server started on', PORT);
  // Test fetching every book cover via HTTP
  for (let i = 1; i <= 28; i++) {
    const slugMap = {
      1: 'book-1-sapiens.jpg',
      2: 'book-2-atomic-habits.jpg',
      3: 'book-3-1984.jpg',
      4: 'harry-potter.jpg',
      5: 'book-5-the-alchemist.jpg',
      6: 'book-6-psychology-of-money.jpg',
      7: 'book-7-the-great-gatsby.jpg',
      8: 'book-8-deep-work.jpg',
      9: 'book-9-the-hobbit.jpg',
      10: 'book-10-dune.jpg',
      11: 'book-11-thinking-fast-and-slow.jpg',
      12: 'book-12-to-kill-a-mockingbird.jpg',
      13: 'book-13-the-da-vinci-code.jpg',
      14: 'book-14-gone-girl.jpg',
      15: 'book-15-the-martian.jpg',
      16: 'book-16-zero-to-one.jpg',
      17: 'book-17-the-lean-startup.jpg',
      18: 'book-18-steve-jobs.jpg',
      19: 'book-19-elon-musk.jpg',
      20: 'book-20-brave-new-world.jpg',
      21: 'book-21-the-girl-with-the-dragon-tattoo.jpg',
      22: 'book-22-enders-game.jpg',
      23: 'book-23-the-7-habits.jpg',
      24: 'book-24-good-to-great.jpg',
      25: 'book-25-the-power-of-now.jpg',
      26: 'book-26-born-a-crime.jpg',
      27: 'book-27-a-brief-history-of-time.jpg',
      28: 'book-28-the-silent-patient.jpg',
    };
    const file = slugMap[i];
    await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${PORT}/assets/${file}`, (res) => {
        let size = 0;
        res.on('data', c => size += c.length);
        res.on('end', () => {
          console.log(`Book ${i} (${file}): HTTP ${res.statusCode}, ${size} bytes`);
          resolve();
        });
      });
    });
  }
  server.close();
});
