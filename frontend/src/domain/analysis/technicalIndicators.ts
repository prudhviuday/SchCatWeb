/**
 * Browser TypeScript port of the indicator wrappers in CRIP4/indicators.js.
 *
 * Reference library in the desktop CRIP4 lockfile:
 * fast-technical-indicators ^1.1.4.
 *
 * Compatibility details preserved:
 * - SMA/EMA start at source index period - 1 (the EMA seed is the first SMA).
 * - RSI starts at source index period and rounds to two decimals.
 * - smaInc/emaInc/rsiInc left-pad results with empty strings.
 * - ULTM and ATP retain the original raw-output indexing behaviour. The legacy
 *   code did not align the EMA arrays to candle timestamps before combining
 *   them; this can create NaN/trailing undefined values. Do not silently
 *   "correct" that historical output without reviewing the resulting charts.
 */

export type IndicatorValue = number | "";

export interface CloseInput {
  close: number;
}

export interface GoldCloseInput extends CloseInput {
  gold: number;
  sgclose?: number;
}

export interface UlTmInput extends CloseInput {
  ultm?: number;
}

export type AtpOutput<T> = T & {
  ultmS: number | undefined;
  ultmG: number | undefined;
};

export type UltmOutput<T> = T & {
  ultm: number | undefined;
};

function validatePeriod(period: number): void {
  if (!Number.isInteger(period)) {
    throw new TypeError("Indicator period must be an integer");
  }
}

/**
 * fast-technical-indicators 1.1.4 SMA.calculate behaviour:
 * rolling arithmetic mean, first result at index period - 1.
 */
export function calculateSma(
  values: readonly number[],
  period: number
): number[] {
  validatePeriod(period);
  if (period <= 0 || period > values.length) return [];

  const result: number[] = [];
  for (let index = period - 1; index < values.length; index += 1) {
    let sum = 0;
    for (
      let cursor = index - period + 1;
      cursor <= index;
      cursor += 1
    ) {
      sum += values[cursor];
    }
    result.push(sum / period);
  }
  return result;
}

/**
 * fast-technical-indicators 1.1.4 EMA.calculate behaviour:
 * initial value is the first period-sized SMA; subsequent values use
 * alpha = 2 / (period + 1).
 */
export function calculateEma(
  values: readonly number[],
  period: number
): number[] {
  validatePeriod(period);
  if (period <= 0 || values.length < period) return [];

  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  const firstSma = calculateSma(values.slice(0, period), period);
  let previousEma = firstSma[0];
  result.push(previousEma);

  for (let index = period; index < values.length; index += 1) {
    const currentEma =
      (values[index] - previousEma) * multiplier + previousEma;
    result.push(currentEma);
    previousEma = currentEma;
  }
  return result;
}

/**
 * fast-technical-indicators 1.1.4 RSI.calculate behaviour.
 * The source library rounds RSI to two decimal places and uses rs=100 when
 * average loss is zero (so a strictly rising/flat series returns 99.01).
 */
export function calculateRsi(
  values: readonly number[],
  period = 14
): number[] {
  validatePeriod(period);
  if (period <= 0 || values.length <= period) return [];

  const gains: number[] = [];
  const losses: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const difference = values[index] - values[index - 1];
    gains.push(difference > 0 ? difference : 0);
    losses.push(difference < 0 ? Math.abs(difference) : 0);
  }

  let averageGain =
    gains.slice(0, period).reduce((sum, gain) => sum + gain, 0) / period;
  let averageLoss =
    losses.slice(0, period).reduce((sum, loss) => sum + loss, 0) / period;

  const result: number[] = [];
  const firstRs = averageLoss === 0 ? 100 : averageGain / averageLoss;
  result.push(Number((100 - 100 / (1 + firstRs)).toFixed(2)));

  for (let index = period; index < gains.length; index += 1) {
    averageGain =
      (averageGain * (period - 1) + gains[index]) / period;
    averageLoss =
      (averageLoss * (period - 1) + losses[index]) / period;

    const relativeStrength =
      averageLoss === 0 ? 100 : averageGain / averageLoss;
    result.push(
      Number((100 - 100 / (1 + relativeStrength)).toFixed(2))
    );
  }

  return result;
}

function padWithEmptyValues(
  values: readonly number[],
  targetLength: number
): IndicatorValue[] {
  const paddingLength = Math.max(0, targetLength - values.length);
  return [
    ...Array.from({ length: paddingLength }, () => "" as const),
    ...values
  ];
}

/**
 * Port of sma_inc(data, samplesize, key). The dynamic property assignment is
 * implemented without the old eval() call.
 */
export function smaInc<
  T extends CloseInput,
  K extends string
>(
  data: readonly T[],
  sampleSize: number,
  key: K
): Array<T & Record<K, IndicatorValue>> {
  const calculated = calculateSma(data.map((row) => row.close), sampleSize);
  const aligned = padWithEmptyValues(calculated, data.length);
  return data.map((row, index) => ({
    ...row,
    [key]: aligned[index]
  })) as Array<T & Record<K, IndicatorValue>>;
}

/**
 * Port of ema_inc(data, length, key, name). The legacy gold-series marker is
 * spelt "stcokgold"; preserve that exact marker for caller compatibility.
 */
export function emaInc<
  T extends CloseInput & { sgclose?: number },
  K extends string
>(
  data: readonly T[],
  length: number,
  key: K,
  name = "stock"
): Array<T & Record<K, IndicatorValue>> {
  const source = name === "stcokgold"
    ? data.map((row) => row.sgclose as number)
    : data.map((row) => row.close);
  const calculated = calculateEma(source, length);
  const aligned = padWithEmptyValues(calculated, data.length);

  return data.map((row, index) => ({
    ...row,
    [key]: aligned[index]
  })) as Array<T & Record<K, IndicatorValue>>;
}

/** Port of rsi_inc(data), including the fixed legacy period of 21. */
export function rsiInc<T extends CloseInput>(
  data: readonly T[]
): Array<T & { rsi: IndicatorValue }> {
  const calculated = calculateRsi(data.map((row) => row.close), 21);
  const aligned = padWithEmptyValues(calculated, data.length);
  return data.map((row, index) => ({
    ...row,
    rsi: aligned[index]
  }));
}

/**
 * Port of ultm_inc(stockdata, SD, BigSD).
 *
 * Important: it intentionally mirrors the old implementation's unaligned
 * raw EMA arrays and its 123 / (fastEMA / slowEMA - 100) formula. This is not
 * the same as a timestamp-aligned fast/slow EMA ratio.
 */
export function ultmInc<T extends CloseInput>(
  stockData: readonly T[],
  shortPeriod: number,
  longPeriod: number
): Array<UltmOutput<T>> {
  const closes = stockData.map((row) => row.close);
  const shortEma = calculateEma(closes, shortPeriod);
  const longEma = calculateEma(closes, longPeriod);

  const atp = shortEma.map(
    (value, index) => (value / (longEma[index] as number)) * 100
  );
  const reverse = atp.map((value) => value - 100);
  const ultimator = stockData.map(
    (_row, index) => (1 / (reverse[index] as number)) * 123
  );

  // Legacy CRIP4 code copies the second value over the first.
  ultimator[0] = ultimator[1];

  return stockData.map((row, index) => ({
    ...row,
    ultm: ultimator[index]
  })) as Array<UltmOutput<T>>;
}

/**
 * Port of ATP_inc(stockdata, SD, BigSD): calculate stock and gold EMA ratios
 * independently, then attach their raw arrays from index zero (no padding).
 */
export function atpInc<T extends GoldCloseInput>(
  stockData: readonly T[],
  shortPeriod: number,
  longPeriod: number
): Array<AtpOutput<T>> {
  const stockCloses = stockData.map((row) => row.close);
  const goldCloses = stockData.map((row) => row.gold);

  const shortStockEma = calculateEma(stockCloses, shortPeriod);
  const longStockEma = calculateEma(stockCloses, longPeriod);
  const shortGoldEma = calculateEma(goldCloses, shortPeriod);
  const longGoldEma = calculateEma(goldCloses, longPeriod);

  const stockStrength = shortStockEma.map(
    (value, index) => (value / (longStockEma[index] as number)) * 100
  );
  const goldStrength = shortGoldEma.map(
    (value, index) => (value / (longGoldEma[index] as number)) * 100
  );

  return stockData.map((row, index) => ({
    ...row,
    ultmS: stockStrength[index],
    ultmG: goldStrength[index]
  })) as Array<AtpOutput<T>>;
}
