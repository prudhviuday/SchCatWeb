import type { MarketSmithFinanceData, MarketSmithLiveMetrics } from "../../data/providers/marketSmithStockData";
import { InstitutionalOwnershipChart, RevenueEpsHistoryChart, RoceHistoryChart } from "../charts/RightPanelQuickCharts";

export interface SelectedStockGraphsProps {
  symbol: string;
  status: "idle" | "loading" | "ready" | "partial" | "auth-required" | "error";
  finance: MarketSmithFinanceData | null;
  metrics: MarketSmithLiveMetrics | null;
  message: string;
  updatedAt: string | null;
}

export default function SelectedStockGraphs({
  symbol,
  status,
  finance,
  metrics,
  message,
  updatedAt
}: SelectedStockGraphsProps) {
  const statusLabel = status === "loading" ? "Loading…" :
    status === "ready" ? "LIVE" :
    status === "partial" ? "PARTIAL" :
    status === "auth-required" ? "SESSION REQUIRED" :
    status === "error" ? "UNAVAILABLE" : "—";

  return (
    <section className="screener-detail-graphs" aria-label={symbol + " live company history graphs"}>
      <div className="screener-detail-graphs-heading">
        <strong>Company history</strong>
        <span className={"screener-detail-live-status " + status}>{statusLabel}</span>
      </div>
      <p className="screener-detail-research-message" role="status" aria-live="polite">
        {message || "Graphs load automatically when you select a stock."}
      </p>
      <article className="screener-detail-graph">
        <div className="screener-detail-graph-title"><strong>Annual ROCE</strong><span>MarketSmith · %</span></div>
        <RoceHistoryChart points={finance?.annualRoce ?? []} />
      </article>
      <article className="screener-detail-graph">
        <div className="screener-detail-graph-title"><strong>Institutional ownership</strong><span>Fund-held shares · quarterly</span></div>
        <InstitutionalOwnershipChart points={metrics?.institutionalOwnership ?? []} />
      </article>
      <article className="screener-detail-graph">
        <div className="screener-detail-graph-title"><strong>Revenue / EPS</strong><span>Annual · normalized index</span></div>
        <RevenueEpsHistoryChart
          revenue={(finance?.annualRevenue ?? []).map((point) => ({ year: point.year, normalized: point.normalized }))}
          eps={(finance?.annualEps ?? []).map((point) => ({ year: point.year, normalized: point.normalized }))}
        />
      </article>
      {updatedAt && <p className="screener-detail-research-updated">Updated {updatedAt} · MarketSmith India</p>}
    </section>
  );
}
