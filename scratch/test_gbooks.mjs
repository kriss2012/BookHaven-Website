import https from 'https';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function test() {
  const query = 'intitle:Sapiens+inauthor:Yuval+Noah+Harari';
  const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`;
  const res = await fetchJson(url);
  console.log('Google Books result for Sapiens:', res.items?.[0]?.volumeInfo?.imageLinks);
}

test();
