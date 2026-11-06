import type { MarketUniverseRecord } from "../../data/reference/marketUniverse.js";
import { fetchChartData, buildCloseVolumeHistory } from "../../data/providers/chartData.js";
import { fetchMarketSmithStockMetrics, fetchMarketSmithRelativeStrength } from "../../data/providers/marketSmithStockData.js";
import { fetchNseDeliveryHistory } from "../../data/providers/nseDelivery.js";
import { aggregateIndustrySeries, type LegacyIndustryResult } from "./industryAnalysis.js";

export interface IndustryLiveFailure { symbol: string; message: string; }
export interface IndustryLiveProgress { completed: number; total: number; symbol: string; }
export interface IndustryLiveDependencies {
  fetchInstitutionalValue: (stock: MarketUniverseRecord, auth: string) => Promise<number[]>;
  fetchRelativeStrength: (stock: MarketUniverseRecord, auth: string) => Promise<number[]>;
  fetchCloseVolume: (stock: MarketUniverseRecord) => Promise<number[]>;
  fetchDelivery: (stock: MarketUniverseRecord) => Promise<{ deliveryValue: number[]; tradedValue: number[] }>;
}
export interface IndustryLiveOptions {
  concurrency?: number;
  onProgress?: (progress: IndustryLiveProgress) => void;
  dependencies?: IndustryLiveDependencies;
}
export interface IndustryLiveResult {
  result: LegacyIndustryResult;
  failures: IndustryLiveFailure[];
  completed: number;
  total: number;
  successfulStocks: number;
}
interface SuccessfulStock {
  stock: MarketUniverseRecord;
  institutional: number[];
  closeVolume: number[];
  deliveryValue: number[];
  tradedValue: number[];
  weightedRs: number[];
}
const defaultDependencies: IndustryLiveDependencies = {
  async fetchInstitutionalValue(stock, auth) {
    if (stock.instrumentId === null) throw new Error("Missing MarketSmith instrument ID");
    const metrics = await fetchMarketSmithStockMetrics(stock.instrumentId, stock.symbol, auth);
    return metrics.institutionalCost.map((point) => point.value);
  },
  async fetchRelativeStrength(stock, auth) {
    if (stock.instrumentId === null) throw new Error("Missing MarketSmith instrument ID");
    const points = await fetchMarketSmithRelativeStrength(stock.instrumentId, stock.symbol, auth);
    const marketCap = stock.marketCap ?? 1;
    return points.map((point) => point.value * marketCap);
  },
  async fetchCloseVolume(stock) {
    const candles = await fetchChartData(stock.symbol, "1W");
    return buildCloseVolumeHistory(candles, 30).map((point) => point[1]);
  },
  async fetchDelivery(stock) {
    const points = await fetchNseDeliveryHistory(stock.symbol, 300);
    return {
      deliveryValue: points.map((point) => point.deliveryValueCr),
      tradedValue: points.map((point) => point.tradedValueCr)
    };
  }
};
/** Run the legacy IndustryWorker for one selected industry with bounded concurrency. */
export async function runLiveIndustryAnalysis(
  industry: string,
  stocks: readonly MarketUniverseRecord[],
  marketSmithAuth: string,
  options: IndustryLiveOptions = {}
): Promise<IndustryLiveResult> {
  if (!industry.trim()) throw new TypeError("Select an industry before starting live analysis");
  if (!marketSmithAuth.trim()) throw new Error("Save a current MarketSmith session in Provider Diagnostics first.");
  if (stocks.length === 0) throw new RangeError("The selected industry has no constituents");
  const concurrency = options.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new RangeError("Industry analysis concurrency must be between 1 and 8");
  }
  const dependencies = options.dependencies ?? defaultDependencies;
  const outcomes: Array<SuccessfulStock | IndustryLiveFailure | null> = Array(stocks.length).fill(null);
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < stocks.length) {
      const index = cursor++;
      const stock = stocks[index];
      try {
        if (stock.instrumentId === null) throw new Error("Missing MarketSmith instrument ID");
        const [institutional, closeVolume, delivery, relativeStrength] = await Promise.all([
          dependencies.fetchInstitutionalValue(stock, marketSmithAuth),
          dependencies.fetchCloseVolume(stock),
          dependencies.fetchDelivery(stock),
          dependencies.fetchRelativeStrength(stock, marketSmithAuth)
        ]);
        outcomes[index] = {
          stock, institutional, closeVolume,
          deliveryValue: delivery.deliveryValue,
          tradedValue: delivery.tradedValue,
          weightedRs: relativeStrength
        };
      } catch (error) {
        outcomes[index] = {
          symbol: stock.symbol,
          message: error instanceof Error ? error.message : "Unknown provider error"
        };
      } finally {
        completed += 1;
        options.onProgress?.({ completed, total: stocks.length, symbol: stock.symbol });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, stocks.length) }, () => worker()));
  const successful = outcomes.filter((item): item is SuccessfulStock => item !== null && "stock" in item);
  const failures = outcomes.filter((item): item is IndustryLiveFailure => item !== null && "message" in item);
  const aggregated = aggregateIndustrySeries({
    institutionalValue: successful.map((item) => item.institutional),
    closeVolume: successful.map((item) => item.closeVolume),
    deliveryValue: successful.map((item) => item.deliveryValue),
    tradedValue: successful.map((item) => item.tradedValue),
    marketCapWeightedRelativeStrength: successful.map((item) => item.weightedRs),
    // The desktop denominator includes every constituent, even when a provider call fails.
    marketCaps: stocks.map((stock) => stock.marketCap)
  });
  return {
    result: {
      industry,
      institutionalValueBillions: aggregated.institutionalValueBillions,
      closeVolumeBillions: aggregated.closeVolumeBillions,
      deliveryPercent: aggregated.deliveryPercent,
      industryRelativeStrength: aggregated.industryRelativeStrength
    },
    failures, completed, total: stocks.length, successfulStocks: successful.length
  };
}