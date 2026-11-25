const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

function isValidGtin(value) {
  if (!GTIN_LENGTHS.has(value.length) || /[^0-9]/.test(value)) return false;

  let sum = 0;
  let weight = 1;
  for (let index = value.length - 1; index >= 0; index--) {
    sum += Number(value[index]) * weight;
    weight = 4 - weight;
  }
  return sum % 10 === 0;
}

function isValidIsbn10(value) {
  if (value.length !== 10 || !/^[0-9]{9}[0-9X]$/i.test(value)) return false;

  let sum = 0;
  for (let index = 0; index < 10; index++) {
    const digit = value[index].toUpperCase() === 'X' ? 10 : Number(value[index]);
    sum += digit * (10 - index);
  }
  return sum % 11 === 0;
}

function expandUpcE(value) {
  if (value.length !== 8 || !/^[01][0-9]{7}$/.test(value)) return null;

  const [system, first, second, third, fourth, fifth, compression, check] = value;
  const prefix = `${system}${first}${second}`;
  if (compression <= '2') return `${prefix}${compression}0000${third}${fourth}${fifth}${check}`;
  if (compression === '3') return `${prefix}${third}00000${fourth}${fifth}${check}`;
  if (compression === '4') return `${prefix}${third}${fourth}00000${fifth}${check}`;
  return `${prefix}${third}${fourth}${fifth}0000${compression}${check}`;
}

export { isValidGtin, isValidIsbn10, expandUpcE };
