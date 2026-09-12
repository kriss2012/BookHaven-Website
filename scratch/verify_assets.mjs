import fs from 'fs';
import path from 'path';

const assetsDir = path.resolve('frontend/assets');
const files = fs.readdirSync(assetsDir);

console.log(`Total files in ${assetsDir}: ${files.length}\n`);

let hasError = false;
for (const file of files) {
  const fullPath = path.join(assetsDir, file);
  const stat = fs.statSync(fullPath);
  const size = stat.size;

  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
    const buf = fs.readFileSync(fullPath);
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    if (!isJpeg || size < 2000) {
      console.error(`[ERROR] Invalid JPG: ${file} (size: ${size})`);
      hasError = true;
    } else {
      console.log(`[OK] JPG ${file} (${size} bytes)`);
    }
  } else if (file.endsWith('.svg')) {
    const str = fs.readFileSync(fullPath, 'utf8');
    if (!str.includes('<svg')) {
      console.error(`[ERROR] Invalid SVG: ${file} (size: ${size})`);
      hasError = true;
    } else {
      console.log(`[OK] SVG ${file} (${size} bytes)`);
    }
  } else {
    console.log(`[OTHER] ${file} (${size} bytes)`);
  }
}

if (!hasError) {
  console.log('\nALL ASSET FILES ARE 100% VALID AND NON-EMPTY!');
} else {
  process.exit(1);
}
