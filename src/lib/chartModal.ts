import uPlot from "uplot";
import type { HardwareComponent } from "../services/dataService";
import { formatPrice } from "./format";

let chart: uPlot | null = null;

export function openChartModal(item: HardwareComponent): void {
  const backdrop = document.getElementById("chart-modal-backdrop");
  const title = document.getElementById("chart-modal-title");
  const specs = document.getElementById("chart-modal-specs");
  const canvasWrap = document.getElementById("chart-canvas-wrap");
  if (!backdrop || !title || !specs || !canvasWrap) return;

  title.textContent = item.name;
  specs.innerHTML = [
    `<span class="meta-chip">${item.category}</span>`,
    `<span class="meta-chip">${item.socket} · ${item.generation}</span>`,
    `<span class="meta-chip">${item.releaseYear}</span>`,
    `<span class="meta-chip">${item.tdpWatts}W TDP</span>`,
    `<span class="meta-chip">MSRP ${formatPrice(item.msrp, item.currency)}</span>`,
    `<span class="meta-chip meta-chip--live">Fair Value ${formatPrice(item.fairValueScore, item.currency)}</span>`
  ].join("");

  canvasWrap.innerHTML = "";
  if (chart) {
    chart.destroy();
    chart = null;
  }

  // uPlot wants parallel arrays; the service stores [timestamp_ms, price] tuples
  // and uPlot's time scale expects seconds.
  const xs = item.historicalPrices.map(([ts]) => ts / 1000);
  const ys = item.historicalPrices.map(([, price]) => price);

  chart = new uPlot(
    {
      width: Math.min(600, window.innerWidth - 80),
      height: 260,
      series: [
        {},
        {
          label: `Price (${item.currency})`,
          stroke: "#4f8dfd",
          width: 2,
          fill: "rgba(79, 141, 253, 0.12)",
          points: { show: true, size: 4, fill: "#4f8dfd" }
        }
      ],
      axes: [
        { stroke: "#5c6373", grid: { stroke: "#1a1e28" } },
        { stroke: "#5c6373", grid: { stroke: "#1a1e28" } }
      ],
      scales: { x: { time: true } }
    },
    [xs, ys],
    canvasWrap
  );

  backdrop.hidden = false;
}

export function initChartModalClose(): void {
  const backdrop = document.getElementById("chart-modal-backdrop");
  const closeBtn = document.getElementById("chart-modal-close");
  if (!backdrop || !closeBtn) return;

  const close = () => {
    backdrop.hidden = true;
    if (chart) {
      chart.destroy();
      chart = null;
    }
  };

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) close();
  });
}
