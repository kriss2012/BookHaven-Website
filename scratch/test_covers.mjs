import https from 'https';
import http from 'http';

function checkUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'BookHaven-ImageDownloader/1.0' } }, (res) => {
      console.log(`URL: ${url} -> Status: ${res.statusCode}, Location: ${res.headers.location}`);
      resolve({ status: res.statusCode, location: res.headers.location });
    });
    req.on('error', (err) => {
      console.log(`URL: ${url} -> Error: ${err.message}`);
      resolve({ error: err.message });
    });
  });
}

async function test() {
  await checkUrl('https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg?default=false');
  await checkUrl('https://covers.openlibrary.org/b/isbn/9780062316097-M.jpg?default=false');
  await checkUrl('https://images-na.ssl-images-amazon.com/images/P/0062316095.01._SCLZZZZZZZ_SX500_.jpg');
  await checkUrl('https://images-na.ssl-images-amazon.com/images/P/0735211299.01._SCLZZZZZZZ_SX500_.jpg');
  await checkUrl('https://images-na.ssl-images-amazon.com/images/P/0451524934.01._SCLZZZZZZZ_SX500_.jpg');
}

test();
