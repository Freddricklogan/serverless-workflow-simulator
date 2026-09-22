import { tokens } from './exec-shell.js';
/** Chart.js wiring. Every function here touches the DOM; none of them compute. */
const GRID = 'rgba(34,48,77,.6)';
const TICK = tokens().muted;
export const PALETTE = [tokens().accent, tokens().ok, tokens().warn, tokens().danger, tokens().series[4], tokens().accent2, tokens().series[5], tokens().muted];

export async function loadChartLib() {
  if (globalThis.Chart) return globalThis.Chart;
  try {
    await import('../vendor/chart.min.js');
  } catch {
    return null;
  }
  return globalThis.Chart ?? null;
}

const base = (xTitle, yTitle, legend = false) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: legend, labels: { color: TICK } } },
  scales: {
    x: { ticks: { color: TICK, maxTicksLimit: 8 }, grid: { color: GRID }, title: { display: !!xTitle, text: xTitle, color: TICK } },
    y: { ticks: { color: TICK }, grid: { color: GRID }, title: { display: !!yTitle, text: yTitle, color: TICK } }
  }
});

export function makeCharts(Chart) {
  const live = new Map();
  const mount = (canvas, config) => {
    if (!Chart || !canvas) return;
    live.get(canvas)?.destroy();
    live.set(canvas, new Chart(canvas.getContext('2d'), config));
  };
  return {
    donut(canvas, labels, values, colours = null) {
      mount(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colours ?? labels.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: tokens().panel, borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '55%', plugins: { legend: { position: 'right', labels: { color: TICK, boxWidth: 12 } } } }
      });
    },
    scatter(canvas, points) {
      mount(canvas, {
        type: 'scatter',
        data: { datasets: [{ data: points.map((p) => ({ x: p.risk, y: p.ret, label: p.symbol })), backgroundColor: tokens().accent, pointRadius: 5 }] },
        options: { ...base('Annualised volatility (%)', 'Annualised return (%)'), plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw.label}: σ ${c.raw.x.toFixed(1)}%, μ ${c.raw.y.toFixed(1)}%` } } } }
      });
    },
    line(canvas, labels, series, xTitle, yTitle) {
      mount(canvas, {
        type: 'line',
        data: { labels, datasets: series.map((s, i) => ({ label: s.label, data: s.data, borderColor: s.colour ?? PALETTE[i], backgroundColor: `${s.colour ?? PALETTE[i]}22`, borderWidth: s.width ?? 2, pointRadius: 0, fill: s.fill ?? false, borderDash: s.dash })) },
        options: base(xTitle, yTitle, series.length > 1)
      });
    },
    bars(canvas, labels, values, yTitle, colour = tokens().accent) {
      mount(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: `${colour}99`, borderColor: colour, borderWidth: 1 }] },
        options: { ...base('', yTitle), indexAxis: 'y' }
      });
    },
    histogram(canvas, { edges, counts }, xTitle, colour = tokens().accent) {
      mount(canvas, {
        type: 'bar',
        data: { labels: edges.slice(0, -1).map((e) => Math.round(e).toLocaleString()), datasets: [{ data: counts, backgroundColor: `${colour}99`, borderColor: colour, borderWidth: 1 }] },
        options: base(xTitle, 'Count')
      });
    }
  };
}
