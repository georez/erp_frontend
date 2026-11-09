import { Big, RoundingMode } from 'bigdecimal.js';

/**
 * An amount in Egyptian pounds written out in Arabic words (تفقيط), as a printed invoice states its total:
 * 1235.5 → "فقط ألف ومائتان وخمسة وثلاثون جنيه مصري وخمسون قرش لا غير".
 *
 * The numbers are masculine, as جنيه and قرش are. The currency names stay as they are after any number ("جنيه مصري",
 * "قرش"), as Egyptian invoices write them, rather than changing with the number (جنيهان, جنيهات, جنيهاً).
 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر',
  'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة',
  'تسعمائة'];

// Thousands, millions and billions: one of it, two, three to ten of it, eleven to ninety-nine of it
const SCALES = [
  { one: 'ألف', two: 'ألفان', few: 'آلاف', many: 'ألفاً' },
  { one: 'مليون', two: 'مليونان', few: 'ملايين', many: 'مليوناً' },
  { one: 'مليار', two: 'ملياران', few: 'مليارات', many: 'ملياراً' },
];

const MAX_POUNDS = 10n ** 12n;

/** 1 to 999 in words: "مائة وخمسة وعشرون". */
function belowThousand(number) {
  const parts = [];
  if (number >= 100) {
    parts.push(HUNDREDS[Math.floor(number / 100)]);
  }
  const rest = number % 100;
  if (rest >= 20) {
    const ones = rest % 10;
    parts.push(ones ? `${ONES[ones]} و${TENS[Math.floor(rest / 10)]}` : TENS[Math.floor(rest / 10)]);
  } else if (rest >= 10) {
    parts.push(TEENS[rest - 10]);
  } else if (rest > 0) {
    parts.push(ONES[rest]);
  }
  return parts.join(' و');
}

/** A count of thousands (or millions, billions), 1 to 999: "ألفان", "ثلاثة آلاف", "خمسة عشر ألفاً", "مائة ألف". */
function scaled(count, scale) {
  if (count === 1) {
    return scale.one;
  }
  if (count === 2) {
    return scale.two;
  }
  const lastTwo = count % 100;
  if (lastTwo >= 3 && lastTwo <= 10) {
    return `${belowThousand(count)} ${scale.few}`;
  }
  return `${belowThousand(count)} ${lastTwo >= 11 ? scale.many : scale.one}`;
}

/** A whole number from 1 up to (not including) a trillion, in words. */
export function numberInWords(number) {
  const parts = [];
  let rest = BigInt(number);
  for (let index = SCALES.length - 1; index >= 0; index -= 1) {
    const size = 1000n ** BigInt(index + 1);
    const count = Number(rest / size);
    rest %= size;
    if (count > 0) {
      parts.push(scaled(count, SCALES[index]));
    }
  }
  if (rest > 0n) {
    parts.push(belowThousand(Number(rest)));
  }
  return parts.join(' و');
}

/**
 * The amount (decimal text, e.g. "1235.5") in words, rounded half up to piasters; empty for none. Amounts under zero or
 * of a trillion pounds or more aren't written out: they're returned as they are.
 */
export function amountInWords(value) {
  if (value == null || value === '') {
    return '';
  }
  const rounded = Big(value).setScale(2, RoundingMode.HALF_UP);
  const [poundsText, piastersText] = rounded.toPlainString().split('.');
  const pounds = BigInt(poundsText);
  const piasters = Number(piastersText);
  if (rounded.signum() < 0 || pounds >= MAX_POUNDS) {
    return String(value);
  }
  const parts = [];
  if (pounds > 0n || piasters === 0) {
    parts.push(`${pounds > 0n ? numberInWords(pounds) : 'صفر'} جنيه مصري`);
  }
  if (piasters > 0) {
    parts.push(`${numberInWords(piasters)} قرش`);
  }
  return `فقط ${parts.join(' و')} لا غير`;
}
