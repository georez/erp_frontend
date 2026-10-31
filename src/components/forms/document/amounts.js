import { Big } from 'bigdecimal.js';
import { formatDecimal } from '@/utils/decimals';

/** Decimal text from the backend ("12.5"), formatted for the grid (thousands separators); empty for none. */
export const formatAmount = (value) => (value == null ? '' : formatDecimal(Big(value)));

/** A signed difference: "+3" for a gain, "-3" for a loss, "0"; empty for none. */
export const formatDifference = (value) => {
  if (value == null) {
    return '';
  }
  const sign = Big(value).signum() > 0 ? '+' : '';
  return `${sign}${formatDecimal(Big(value))}`;
};

/** Whether an amount (decimal text) is other than zero. */
export const isNonZero = (value) => value != null && Big(value).signum() !== 0;

// Numbers left to right inside the right-to-left grid, so a sign stays in front ("-3", not "3-"); still aligned
// with the other cells, at the column's start
export const NUMBER_CELL = { direction: 'ltr', textAlign: 'right' };

export const GAIN_COLOR = '#2e7d32';
export const LOSS_COLOR = '#c62828';
