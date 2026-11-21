/*
 * A pack's GS1 DataMatrix as a scanner types it: element strings, each an application identifier (AI) and its value,
 * e.g. 01 06221025101853 17 270531 10 LOT42 GS 21 SN0001. A value of fixed length ends where its length does; one of
 * variable length (a lot, a serial) ends at the group separator (GS, ASCII 29) or at the end. A scanner may type the
 * separator as a key (e.g. F8: scannedCharacter) or a character (e.g. |), as the settings say (GET
 * /api/settings/scanner). Typed by hand, the AIs may be in brackets: (01)06221025101853(17)270531(10)LOT42(21)SN0001.
 *
 * Of the AIs: 01 the GTIN, 17 the expiry (YYMMDD), 10 the lot (batch number), 21 the serial. The others a pack may
 * carry are read past.
 */

export const GROUP_SEPARATOR = '\u001d';

// The AIs of a fixed length: their value's length
const FIXED_LENGTH = {
  '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2,
};

// The AIs of a variable length: their value's longest
const VARIABLE_LENGTH = {
  '10': 20, '21': 20, '22': 20, '30': 8, '37': 8, '240': 30, '241': 30, '250': 30,
  '710': 20, '711': 20, '712': 20, '713': 20, '714': 20, '715': 20,
};

// What a scanner may put first: the symbology identifier (]d2 for a GS1 DataMatrix)
const SYMBOLOGY_IDENTIFIER = /^\][A-Za-z][0-9]/;

const lengthOf = (ai) => FIXED_LENGTH[ai] ?? VARIABLE_LENGTH[ai];

/** The AI the text starts with at the position: two digits, or three (240, 714...); null for none known. */
function aiAt(text, position) {
  for (const length of [2, 3]) {
    const ai = text.slice(position, position + length);
    if (lengthOf(ai) !== undefined) {
      return ai;
    }
  }
  return null;
}

/** The element strings of a scan without brackets: { ai: value }, or an error. */
function readElementStrings(text) {
  const values = {};
  let position = 0;
  while (position < text.length) {
    if (text[position] === GROUP_SEPARATOR) {
      position += 1;
      continue;
    }
    const ai = aiAt(text, position);
    if (ai === null) {
      return { error: `رمز تطبيق غير معروف عند "${text.slice(position, position + 4)}"` };
    }
    const start = position + ai.length;
    let end;
    if (FIXED_LENGTH[ai] !== undefined) {
      end = start + FIXED_LENGTH[ai];
      if (end > text.length) {
        return { error: `القيمة بعد (${ai}) أقصر من ${FIXED_LENGTH[ai]} رقماً` };
      }
    } else {
      const separator = text.indexOf(GROUP_SEPARATOR, start);
      end = separator < 0 ? text.length : separator;
      if (end - start > VARIABLE_LENGTH[ai]) {
        return { error: `القيمة بعد (${ai}) أطول من ${VARIABLE_LENGTH[ai]} حرفاً: هل فاصل المجموعات مضبوط في الإعدادات؟` };
      }
    }
    values[ai] = text.slice(start, end);
    position = end;
  }
  return { values };
}

/** The element strings of a scan typed with its AIs in brackets: { ai: value }, or an error. */
function readBracketed(text) {
  const values = {};
  const pattern = /\((\d{2,4})\)([^(]*)/gy;
  let match;
  let position = 0;
  while ((match = pattern.exec(text)) !== null) {
    values[match[1]] = match[2].replaceAll(GROUP_SEPARATOR, '');
    position = pattern.lastIndex;
  }
  return position === text.length ? { values } : { error: 'صيغة الأقواس غير صحيحة' };
}

/**
 * The expiry of a pack (YYMMDD) as ISO date text; day 00 (the month only) is the month's first day, as a month is
 * entered here. Null when it isn't a date.
 */
function expiryOf(text) {
  if (!/^\d{6}$/.test(text)) {
    return null;
  }
  const year = 2000 + Number(text.slice(0, 2));
  const month = Number(text.slice(2, 4));
  const day = Math.max(Number(text.slice(4, 6)), 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day > daysInMonth) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The pack's GTIN, expiry (ISO date), lot and serial a scan carries, each null when it doesn't; or { error } when the
 * scan can't be read.
 *
 * @param {string} scanned       as typed into the scan field
 * @param {string|null} separatorCharacter  the character the scanner types for the group separator, if it's one (a
 *                                         key is turned into GS as it's pressed: scannedCharacter)
 */
export function parseDataMatrix(scanned, separatorCharacter = null) {
  let text = scanned.trim().replace(SYMBOLOGY_IDENTIFIER, '');
  if (separatorCharacter) {
    text = text.replaceAll(separatorCharacter, GROUP_SEPARATOR);
  }
  if (text === '') {
    return { error: 'لا يوجد كود' };
  }
  const read = text.startsWith('(') ? readBracketed(text) : readElementStrings(text);
  if (read.error) {
    return { error: read.error };
  }
  const { values } = read;
  const expiryDate = values['17'] === undefined ? null : expiryOf(values['17']);
  if (values['17'] !== undefined && expiryDate === null) {
    return { error: `تاريخ الصلاحية (17) غير صحيح: ${values['17']}` };
  }
  if (values['01'] === undefined && values['21'] === undefined) {
    return { error: 'الكود لا يحمل GTIN (01) ولا سيريال (21)' };
  }
  return {
    gtin: values['01'] ?? null,
    expiryDate,
    batchNumber: values['10'] ?? null,
    serialNumber: values['21'] ?? null,
  };
}

/** A GTIN as its 14 digits (a shorter one padded with zeros in front, as products keep it); null when not digits. */
export function gtinOf(text) {
  const digits = (text ?? '').trim();
  return /^(\d{8}|\d{12,14})$/.test(digits) ? digits.padStart(14, '0') : null;
}

// The characters of the keys a code is made of, by the physical key (KeyboardEvent.code): unshifted and shifted, as
// on a US keyboard
const KEY_CHARACTERS = {
  Digit0: ['0', ')'], Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'],
  Digit5: ['5', '%'], Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('],
  Minus: ['-', '_'], Equal: ['=', '+'], Period: ['.', '>'], Comma: [',', '<'], Slash: ['/', '?'],
  Semicolon: [';', ':'], Quote: ['\'', '"'], Backslash: ['\\', '|'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
  Backquote: ['`', '~'], Space: [' ', ' '],
};

/**
 * What a key press in the scan field types instead of what the keyboard layout makes of it: a scanner types its code
 * key by key, and in an Arabic layout its letters would come out Arabic, so a key that types something else than a
 * Latin character is read from the physical key. The key the settings name for the group separator (e.g. F8), or
 * Ctrl+] (how some scanners send it), types GS. Null: the key does what it does (a Latin character, Enter,
 * Backspace, a paste...).
 *
 * @param {KeyboardEvent} event
 * @param {string|null} separatorKey  the key the scanner presses for the group separator, e.g. "F8"
 */
export function scannedCharacter(event, separatorKey) {
  if (separatorKey && event.key === separatorKey) {
    return GROUP_SEPARATOR;
  }
  if (event.ctrlKey && event.code === 'BracketRight') {
    return GROUP_SEPARATOR;
  }
  if (event.ctrlKey || event.altKey || event.metaKey || /^[ -~]$/.test(event.key)) {
    return null;
  }
  const letter = /^Key([A-Z])$/.exec(event.code ?? '');
  if (letter) {
    const capsLock = event.getModifierState?.('CapsLock') ?? false;
    return event.shiftKey !== capsLock ? letter[1] : letter[1].toLowerCase();
  }
  const numpad = /^Numpad([0-9])$/.exec(event.code ?? '');
  if (numpad) {
    return numpad[1];
  }
  const characters = KEY_CHARACTERS[event.code];
  return characters ? characters[event.shiftKey ? 1 : 0] : null;
}

/** Whether the scanner's group separator setting is a key (F1-F12) rather than a character. */
export const isSeparatorKey = (setting) => /^F([1-9]|1[0-2])$/.test(setting ?? '');
