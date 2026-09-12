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

console.log('9780062316097 ->', isbn13To10('9780062316097')); // should be 0062316095
console.log('9780735211292 ->', isbn13To10('9780735211292')); // should be 0735211299
console.log('9780451524935 ->', isbn13To10('9780451524935')); // should be 0451524934
