function normalizeBarcodeType(type) {
  const normalized = type?.trim().toUpperCase() || 'CUSTOM';
  return /^(NS-PID|NS_PID|NSPID)$/.test(normalized) ? 'NS-PID' : normalized;
}

function readLegacyBarcode(value) {
  const trimmed = value?.trim();
  return trimmed ? [{ type: 'CUSTOM', value: trimmed }] : [];
}

function parseBarcodes(cell) {
  if (cell == null || cell === '') return [];

  const barcodes = [];
  let type = null;
  let value = '';

  function finishBarcode() {
    const trimmed = value.trim();
    if (type || trimmed) barcodes.push({ type: normalizeBarcodeType(type), value: trimmed });
    type = null;
    value = '';
  }

  for (let index = 0; index < cell.length; index++) {
    const character = cell[index];
    const next = cell[index + 1];
    if (character === '\\' && (next === '\\' || next === ';' || next === ':')) {
      value += next;
      index++;
    } else if (character === ';') {
      finishBarcode();
    } else if (character === ':' && type === null) {
      type = value.trim();
      value = '';
    } else {
      value += character;
    }
  }

  finishBarcode();
  return barcodes;
}

export { normalizeBarcodeType, readLegacyBarcode, parseBarcodes };
