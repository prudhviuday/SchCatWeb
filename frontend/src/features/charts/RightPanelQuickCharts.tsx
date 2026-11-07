import { getRoceBand, prepareInstitutionBars, prepareRevenueEpsComparison } from "./rightPanelCharts";

export function RoceHistoryChart({ points }: { points: Array<{ year: number; value: number }> }) {
  if (!points.length) return <div className="right-panel-chart-empty">No ROCE history returned.</div>;
  const width = 720; const height = 190; const left = 20; const right = 16; const top = 18; const bottom = 145;
  const values = points.map(point => point.value); const min = Math.min(0, ...values); const max = Math.max(1, ...values); const spread = max - min || 1;
  const x = (index: number) => left + (points.length === 1 ? (width-left-right)/2 : index*(width-left-right)/(points.length-1));
  const y = (value: number) => bottom - (value-min)/spread*(bottom-top);
  return <div className="right-panel-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Annual ROCE history with legacy 15 and 10 percent quality thresholds">
    {[0,1,2,3].map(tick => { const value=min+(spread*tick/3); const py=y(value); return <g key={tick}><line x1={left} x2={width-right} y1={py} y2={py} className="chart-grid-line"/><text x={left+3} y={py-4} className="chart-axis-label">{value.toFixed(1)}%</text></g>; })}
    {points.slice(1).map((point,index) => <line key={point.year} x1={x(index)} y1={y(points[index].value)} x2={x(index+1)} y2={y(point.value)} className={`right-panel-roce-${getRoceBand(point.value)}`}/>)}
    {points.map((point,index) => <g key={point.year}><circle cx={x(index)} cy={y(point.value)} r="3.5" className={`right-panel-roce-dot-${getRoceBand(point.value)}`}/><text x={x(index)} y={bottom+18} textAnchor="middle" className="chart-axis-label">{point.year}</text></g>)}
  </svg><div className="right-panel-chart-legend"><span><i className="right-panel-legend-strong"/> ≥15% strong</span><span><i className="right-panel-legend-moderate"/> 10–15% moderate</span><span><i className="right-panel-legend-weak"/> Below 10% weak</span></div></div>;
}

export function InstitutionalOwnershipChart({ points }: { points: Array<{ period: string; value: number }> }) {
  const bars = prepareInstitutionBars(points.map(point => ({ label: point.period, value: point.value })), 20);
  if (!bars.length) return <div className="right-panel-chart-empty">No institutional ownership history returned.</div>;
  const width = 720; const height = 170; const left = 12; const right = 12; const top = 12; const bottom = 126; const slot = (width-left-right)/bars.length; const barWidth = Math.max(3,slot*.62);
  return <div className="right-panel-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Institutional ownership history, ${bars.length} quarterly observations`}>
    <line x1={left} x2={width-right} y1={bottom} y2={bottom} className="chart-grid-line"/>
    {bars.map((bar,index) => { const barHeight=bar.heightPct/100*(bottom-top); const bx=left+index*slot+(slot-barWidth)/2; return <g key={bar.label+index}><rect x={bx} y={bottom-barHeight} width={barWidth} height={barHeight} rx="2" className="right-panel-ownership-bar"><title>{bar.label}: {bar.value.toLocaleString("en-IN")}</title></rect>{(index===0||index===bars.length-1||index===Math.floor((bars.length-1)/2))&&<text x={bx+barWidth/2} y={bottom+18} textAnchor="middle" className="chart-axis-label">{bar.label}</text>}</g>; })}
  </svg><p className="workspace-chart-note">Reported fund-held shares · latest 20 observations · bar height scaled to the highest observation in this series.</p></div>;
}

export function RevenueEpsHistoryChart({ revenue, eps }: { revenue: Array<{ year:number; normalized:number|null }>; eps: Array<{ year:number; normalized:number|null }> }) {
  const points=prepareRevenueEpsComparison(revenue,eps).filter(point=>point.revenueIndex!==null||point.epsIndex!==null);
  if(!points.length) return <div className="right-panel-chart-empty">No aligned annual revenue or EPS history returned.</div>;
  const width=720; const height=190; const left=20; const right=16; const top=16; const bottom=145;
  const x=(index:number)=>left+(points.length===1?(width-left-right)/2:index*(width-left-right)/(points.length-1));
  const y=(value:number)=>bottom-Math.max(0,Math.min(100,value))/100*(bottom-top);
  const line=(key:"revenueIndex"|"epsIndex")=>{ let drawing=false; return points.map((point,index)=>{ const value=point[key]; if(value===null){drawing=false;return "";} const command=drawing?"L":"M"; drawing=true; return `${command} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`; }).filter(Boolean).join(" "); };
  return <div className="right-panel-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Annual revenue and EPS normalized index comparison by fiscal year">
    {[0,25,50,75,100].map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="chart-grid-line"/><text x={left+3} y={y(value)-4} className="chart-axis-label">{value}</text></g>)}
    {line("revenueIndex").includes(" L ")&&<path d={line("revenueIndex")} className="right-panel-revenue-line"/>}
    {line("epsIndex").includes(" L ")&&<path d={line("epsIndex")} className="right-panel-eps-line"/>}
    {points.map((point,index)=><text key={point.year} x={x(index)} y={bottom+18} textAnchor="middle" className="chart-axis-label">{point.year}</text>)}
  </svg><div className="right-panel-chart-legend"><span><i className="right-panel-legend-revenue"/> Revenue index</span><span><i className="right-panel-legend-eps"/> EPS index</span></div><p className="workspace-chart-note">Uses the existing legacy-normalized 0–100 series. Missing fiscal years remain gaps; raw revenue and EPS units are not mixed on one axis.</p></div>;
}

