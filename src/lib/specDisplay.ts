/**
 * Category-aware spec presentation.
 *
 * `specs` is a discriminated union, so every read has to narrow on `category`.
 * That narrowing lives here rather than being repeated in each component, and
 * it is where units become human-readable — the contracts store bare numbers
 * (MHz, GB, watts, MB/s) precisely so nothing has to parse "3.2 GHz" at read
 * time, and the formatting belongs at the edge.
 *
 * Presentation only: the modules stay free of UI concerns.
 */

import type { CatalogComponent, ComponentCategory } from "@modules/database/contracts";

/**
 * The minimal shape these formatters need: a category paired with its specs.
 *
 * Distributive so the union survives — this is what lets one formatter serve
 * both a catalogued `HardwareComponent` and a staged `PriceSubmission`, which
 * share the category/specs pairing but nothing else.
 */
export type CategorizedSpecs<T = CatalogComponent> = T extends { category: infer C; specs: infer S }
  ? { category: C; specs: S }
  : never;

export interface SpecChip {
  label: string;
  value: string;
}

const mhz = (v: number | undefined): string | null => (v == null ? null : v >= 1000 ? `${(v / 1000).toFixed(2)} GHz` : `${v} MHz`);
const watts = (v: number | undefined): string | null => (v == null ? null : `${v} W`);
const gb = (v: number | undefined): string | null =>
  v == null ? null : v < 1 ? `${Math.round(v * 1024)} MB` : v >= 1024 ? `${v / 1024} TB` : `${v} GB`;
const mbps = (v: number | undefined): string | null => (v == null ? null : `${v.toLocaleString()} MB/s`);
const text = (v: string | undefined): string | null => v ?? null;

function chips(pairs: [string, string | null][]): SpecChip[] {
  return pairs.filter((pair): pair is [string, string] => pair[1] !== null).map(([label, value]) => ({ label, value }));
}

/**
 * Full spec set for the drawer, ordered most-identifying first.
 * Absent optional fields are omitted rather than rendered as "—", so a 1993
 * part does not show a column of blanks for concepts that did not exist.
 */
export function specChips(component: CategorizedSpecs): SpecChip[] {
  switch (component.category) {
    case "CPU": {
      const s = component.specs;
      return chips([
        ["Socket", text(s.socket)],
        ["Architecture", text(s.architecture)],
        ["Cores / Threads", s.threads ? `${s.cores} / ${s.threads}` : `${s.cores}`],
        ["Base clock", mhz(s.baseClock)],
        ["Boost clock", mhz(s.boostClock)],
        ["Cache", text(s.cache)],
        ["TDP", watts(s.tdp)]
      ]);
    }
    case "GPU": {
      const s = component.specs;
      const memory = [gb(s.vramCapacity), s.vramType, s.memoryBusWidth ? `${s.memoryBusWidth} bit` : null]
        .filter(Boolean)
        .join(" / ");
      const cores = [s.shadingUnits, s.tmus, s.rops].every((v) => v != null)
        ? `${s.shadingUnits} / ${s.tmus} / ${s.rops}`
        : null;
      return chips([
        ["Architecture", text(s.architecture)],
        ["Codename", text(s.codename)],
        ["Bus", text(s.bus)],
        ["Memory", memory || null],
        ["GPU clock", mhz(s.boostClock ?? s.coreClock)],
        ["Memory clock", mhz(s.memoryClock)],
        ["Cores / TMUs / ROPs", cores],
        ["Compute units", s.computeUnits == null ? null : String(s.computeUnits)],
        ["TDP", watts(s.tdp)]
      ]);
    }
    case "MOBO": {
      const s = component.specs;
      return chips([
        ["Socket", text(s.socket)],
        ["Chipset", text(s.chipset)],
        ["Form factor", text(s.formFactor)],
        ["Memory", text(s.memoryType)]
      ]);
    }
    case "RAM": {
      const s = component.specs;
      return chips([
        ["Capacity", gb(s.capacity)],
        ["Type", text(s.memoryType)],
        ["Speed", `${s.speed.toLocaleString()} MT/s`],
        ["Latency", text(s.latency)],
        ["Kit", text(s.modules)]
      ]);
    }
    case "STORAGE": {
      const s = component.specs;
      return chips([
        ["Type", text(s.type)],
        ["Capacity", gb(s.capacity)],
        ["Interface", text(s.interface)],
        ["Form factor", text(s.formFactor)],
        ["Read", mbps(s.readSpeed)],
        ["Write", mbps(s.writeSpeed)]
      ]);
    }
  }
}

/**
 * One-line summary for the screener table.
 * Deliberately different per category — a socket is the identifying fact for a
 * CPU, capacity and speed for RAM.
 */
export function specSummary(component: CategorizedSpecs): string {
  switch (component.category) {
    case "CPU":
      return [component.specs.socket, component.specs.architecture].filter(Boolean).join(" · ");
    case "GPU":
      return [component.specs.architecture, gb(component.specs.vramCapacity)].filter(Boolean).join(" · ");
    case "MOBO":
      return [component.specs.socket, component.specs.chipset, component.specs.formFactor].filter(Boolean).join(" · ");
    case "RAM":
      return [component.specs.memoryType, `${component.specs.speed.toLocaleString()} MT/s`, component.specs.latency]
        .filter(Boolean)
        .join(" · ");
    case "STORAGE":
      return [component.specs.type, gb(component.specs.capacity), component.specs.interface].filter(Boolean).join(" · ");
  }
}

/** Socket, for the categories that have one. Used by the screener filter. */
export function socketOf(component: CategorizedSpecs): string | undefined {
  return component.category === "CPU" || component.category === "MOBO" ? component.specs.socket : undefined;
}

/** Memory type, for the categories that have one. Used by the screener filter. */
export function memoryTypeOf(component: CategorizedSpecs): string | undefined {
  return component.category === "MOBO" || component.category === "RAM" ? component.specs.memoryType : undefined;
}

/** Human label for a category code. */
export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  CPU: "CPU",
  GPU: "GPU",
  RAM: "Memory",
  MOBO: "Motherboard",
  STORAGE: "Storage"
};
