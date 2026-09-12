import http from 'http';

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve({ port, status: res.statusCode });
    });
    req.on('error', (e) => resolve({ port, error: e.message }));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve({ port, error: 'timeout' });
    });
  });
}

async function run() {
  console.log('Checking port 5500:', await checkPort(5500));
  console.log('Checking port 8080:', await checkPort(8080));
  console.log('Checking port 8001:', await checkPort(8001));
}

run();
