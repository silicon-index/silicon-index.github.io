// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Sliding price-history drawer.
 *
 * Owns the open/close lifecycle and mounts one `createPriceChart` instance
 * per open. The markup lives in `components/PriceDrawer.astro`; this file is
 * the only thing that touches it, so the screener just calls
 * `openPriceDrawer(component)`.
 */

import type { HardwareComponent } from "@modules/database/contracts";
import { CATEGORY_LABELS, specChips } from "./specDisplay";
import { createPriceChart, type PriceChartHandle } from "./priceChart";
import { formatPrice } from "./format";

let chart: PriceChartHandle | null = null;
let lastFocused: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;

interface DrawerElements {
  root: HTMLElement;
  panel: HTMLElement;
  title: HTMLElement;
  sku: HTMLElement;
  stats: HTMLElement;
  canvas: HTMLElement;
  close: HTMLButtonElement;
}

function elements(): DrawerElements | null {
  const root = document.getElementById("price-drawer");
  const panel = document.getElementById("price-drawer-panel");
  const title = document.getElementById("price-drawer-title");
  const sku = document.getElementById("price-drawer-sku");
  const stats = document.getElementById("price-drawer-stats");
  const canvas = document.getElementById("price-drawer-canvas");
  const close = document.getElementById("price-drawer-close") as HTMLButtonElement | null;
  if (!root || !panel || !title || !sku || !stats || !canvas || !close) return null;
  return { root, panel, title, sku, stats, canvas, close };
}

/** Chart width available inside the panel, accounting for its padding. */
function measure(canvas: HTMLElement): number {
  const width = canvas.clientWidth;
  return width > 0 ? width : Math.min(560, window.innerWidth - 64);
}

function statChip(label: string, value: string, accent = false): string {
  return `<div class="drawer-stat${accent ? " drawer-stat--accent" : ""}">
    <span class="drawer-stat-label">${label}</span>
    <span class="drawer-stat-value">${value}</span>
  </div>`;
}

export function openPriceDrawer(component: HardwareComponent): void {
  const els = elements();
  if (!els) return;

  lastFocused = document.activeElement as HTMLElement | null;

  els.title.textContent = component.name;
  els.sku.textContent = component.sku;

  const overMedian = component.medianMarketPrice > component.fairValueScore;
  els.stats.innerHTML = [
    statChip("Median market", formatPrice(component.medianMarketPrice, component.currency), overMedian),
    // Historical parts may have no documented launch price.
    statChip("MSRP", component.originalMSRP === null ? "—" : formatPrice(component.originalMSRP, component.currency)),
    statChip("Fair value", formatPrice(component.fairValueScore, component.currency)),
    statChip("Category", CATEGORY_LABELS[component.category]),
    statChip("Manufacturer", component.manufacturer),
    statChip("Released", String(component.releaseYear)),
    // Category-specific; absent fields are omitted, not shown as blanks.
    ...specChips(component).map((chip) => statChip(chip.label, chip.value))
  ].join("");

  // Reveal before measuring: a hidden element has zero width.
  els.root.hidden = false;
  // Next frame, so the slide-in transition has a start state to animate from.
  requestAnimationFrame(() => els.root.setAttribute("data-open", "true"));

  chart?.destroy();
  chart = createPriceChart({
    target: els.canvas,
    observations: component.historicalPrices,
    currency: component.currency,
    width: measure(els.canvas)
  });

  if (!resizeObserver && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      if (!els.root.hidden) chart?.resize(measure(els.canvas));
    });
    resizeObserver.observe(els.canvas);
  }

  els.close.focus();
}

export function closePriceDrawer(): void {
  const els = elements();
  if (!els || els.root.hidden) return;

  els.root.removeAttribute("data-open");
  chart?.destroy();
  chart = null;

  const finish = () => {
    els.root.hidden = true;
    els.canvas.replaceChildren();
  };

  // Let the slide-out play, unless the viewer prefers reduced motion.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) finish();
  else window.setTimeout(finish, 180);

  lastFocused?.focus();
  lastFocused = null;
}

/** Wires the drawer's own controls. Safe to call on pages without one. */
export function initPriceDrawer(): void {
  const els = elements();
  if (!els) return;

  els.close.addEventListener("click", closePriceDrawer);

  els.root.addEventListener("click", (event) => {
    // Scrim only — clicks inside the panel must not close it.
    if (!els.panel.contains(event.target as Node)) closePriceDrawer();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.root.hidden) closePriceDrawer();
  });

  // Keep focus inside the panel while it is open.
  els.panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = els.panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (!els.root.hidden) chart?.resize(measure(els.canvas));
  });
}
