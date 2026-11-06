import type { MarketSmithLiveMetrics, MarketSmithFinanceData } from "../../data/providers/marketSmithStockData.js";

export interface NikScoreBreakdown {
  growthScore: number;
  roceScore: number;
  pbScore: number;
  finalScore: number;
  salesGrowthUsed: number[];
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function prepareNikScoreSalesGrowth(
  quarterlyGrowth: MarketSmithLiveMetrics["quarterlyGrowth"]
): number[] {
  const chronological = quarterlyGrowth.map((quarter) => quarter.salesPct);
  const padded = chronological.length >= 4
    ? chronological.slice(-4)
    : [...Array(4 - chronological.length).fill(0), ...chronological];
  return padded.reverse();
}

export function calculateNikScore(
  salesGrowthNewestFirst: readonly number[],
  roce: number,
  pb: number
): NikScoreBreakdown {
  if (salesGrowthNewestFirst.length !== 4 ||
      !salesGrowthNewestFirst.every(Number.isFinite) ||
      !Number.isFinite(roce) || !Number.isFinite(pb)) {
    throw new TypeError("NikScore requires four finite sales-growth values, ROCE and P/B");
  }
  const weights = [0.4, 0.3, 0.2, 0.1];
  const weightedGrowth = salesGrowthNewestFirst.reduce((sum, growth, index) =>
    sum + growth * weights[index], 0);
  const growthScore = clamp(50 + weightedGrowth * 2);
  const roceScore = roce < 10 ? 20 : roce < 15 ? 40 : roce < 20 ? 60 :
    roce < 25 ? 75 : roce < 30 ? 90 : 100;
  const pbScore = pb < 1 ? 100 : pb < 2 ? 90 : pb < 4 ? 75 :
    pb < 6 ? 55 : pb < 8 ? 35 : 20;
  return {
    growthScore: Math.round(growthScore * 100) / 100,
    roceScore,
    pbScore,
    finalScore: Math.round((0.45 * growthScore + 0.35 * roceScore + 0.20 * pbScore) * 100) / 100,
    salesGrowthUsed: [...salesGrowthNewestFirst]
  };
}

export function calculateNikScoreFromMarketSmith(
  metrics: MarketSmithLiveMetrics,
  finance: MarketSmithFinanceData
): NikScoreBreakdown {
  const latestRoce = finance.annualRoce.at(-1)?.value;
  if (metrics.livePb === null || latestRoce === undefined) {
    throw new Error("MarketSmith did not provide P/B or annual ROCE");
  }
  return calculateNikScore(prepareNikScoreSalesGrowth(metrics.quarterlyGrowth), latestRoce, metrics.livePb);
}
