// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * uPlot wrapper for hardware price history.
 *
 * Thin by design: uPlot is chosen for its zero-overhead canvas rendering, so
 * this adds theming and data mapping and nothing else — no reactive layer, no
 * per-frame work, one chart instance per open drawer.
 *
 * Consumes `PricePointTuple[]` from `@modules/database/contracts` — the
 * `[unix-ms timestamp, price]` pairs carried by `HardwareComponent`
 * (`historicalPrices`) and by `HardwarePriceSeries` (`observations`).
 */

import uPlot from "uplot";
import type { PricePointTuple } from "@modules/database/contracts";

/** Terminal/zinc palette, matched to the header restyle. */
export const CHART_THEME = {
  line: "#34d399",
  lineFill: "rgba(52, 211, 153, 0.10)",
  point: "#34d399",
  grid: "#27272a",
  axis: "#52525b",
  label: "#a1a1aa",
  cursor: "#3f3f46",
  font: '10px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
} as const;

export interface PriceChartOptions {
  /** Element the canvas is mounted into. Cleared first. */
  target: HTMLElement;
  /** `[unix-ms timestamp, price]` pairs. Order is normalized internally. */
  observations: PricePointTuple[];
  currency: string;
  width: number;
  height?: number;
}

export interface PriceChartHandle {
  resize(width: number, height?: number): void;
  destroy(): void;
}

function currencySymbol(currency: string): string {
  return currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
}

/**
 * Maps `[ms, price]` pairs into uPlot's parallel-array format.
 * uPlot requires x ascending and works in SECONDS on a time scale, so the
 * series is sorted and divided here rather than trusting the caller.
 */
export function toUplotSeries(observations: PricePointTuple[]): [number[], number[]] {
  const sorted = [...observations]
    .filter(([ts, price]) => Number.isFinite(ts) && Number.isFinite(price))
    .sort((a, b) => a[0] - b[0]);
  return [sorted.map(([ts]) => ts / 1000), sorted.map(([, price]) => price)];
}

/**
 * Renders the chart. Returns null when there is nothing plottable, having
 * placed an empty-state message in `target` — an empty series is a normal
 * state for a newly tracked SKU, not an error.
 */
export function createPriceChart(options: PriceChartOptions): PriceChartHandle | null {
  const { target, observations, currency, width, height = 240 } = options;
  target.replaceChildren();

  const [xs, ys] = toUplotSeries(observations);
  if (xs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent = "No price history recorded for this component yet.";
    target.appendChild(empty);
    return null;
  }

  const symbol = currencySymbol(currency);
  const fmtPrice = (v: number | null) => (v == null ? "--" : symbol + v.toLocaleString());

  let chart: uPlot | null = new uPlot(
    {
      width,
      height,
      padding: [12, 8, 0, 0],
      cursor: {
        y: false,
        points: { size: 6 },
        drag: { x: false, y: false }
      },
      legend: { live: true },
      scales: { x: { time: true } },
      axes: [
        {
          stroke: CHART_THEME.axis,
          font: CHART_THEME.font,
          grid: { stroke: CHART_THEME.grid, width: 1 },
          ticks: { stroke: CHART_THEME.grid, width: 1 }
        },
        {
          stroke: CHART_THEME.axis,
          font: CHART_THEME.font,
          grid: { stroke: CHART_THEME.grid, width: 1 },
          ticks: { stroke: CHART_THEME.grid, width: 1 },
          size: 58,
          values: (_self, ticks) => ticks.map((t) => symbol + t.toLocaleString())
        }
      ],
      series: [
        { label: "Date" },
        {
          label: `Price (${currency})`,
          stroke: CHART_THEME.line,
          width: 2,
          fill: CHART_THEME.lineFill,
          points: { show: xs.length <= 24, size: 5, stroke: CHART_THEME.point, fill: CHART_THEME.point },
          value: (_self, v) => fmtPrice(v)
        }
      ]
    },
    [xs, ys],
    target
  );

  return {
    resize(nextWidth: number, nextHeight?: number) {
      chart?.setSize({ width: nextWidth, height: nextHeight ?? height });
    },
    destroy() {
      chart?.destroy();
      chart = null;
    }
  };
}
