// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Form descriptors for category-specific specs.
 *
 * Drives the contribution form so the fields offered always match the chosen
 * category — a GPU is a card on a bus and is never asked for a socket, RAM has
 * no architecture, and only storage offers a drive type. That constraint comes
 * from the contracts, not from this file; these descriptors just describe how
 * to collect what `SPEC_FIELDS` already permits.
 *
 * Enumerated fields are `select` rather than free text, per DEV-GUIDE.md §3.1
 * ("dropdown-only spec fields; no free-text spec inputs"). Numeric fields are
 * number inputs with units fixed by the contract, so nothing has to parse
 * "3.2 GHz" later.
 */

import type { ComponentCategory } from "@modules/database/contracts";

export interface SpecFieldDescriptor {
  /** Key within the category's spec interface. */
  key: string;
  label: string;
  kind: "select" | "number" | "text";
  required: boolean;
  /** Options for `select`. */
  options?: readonly string[];
  /** Unit hint shown beside the label, e.g. "MHz". */
  unit?: string;
  placeholder?: string;
}

const SOCKETS = ["AM5", "AM4", "LGA1851", "LGA1700", "LGA1200", "sTR5", "Socket 4", "Slot 1", "Socket 754", "LGA775"];
const MEMORY_TYPES = ["DDR5", "DDR4", "DDR3", "DDR2", "DDR", "SDRAM"];
const VRAM_TYPES = ["GDDR7", "GDDR6X", "GDDR6", "GDDR5X", "GDDR5", "HBM2e", "GDDR3", "SDR"];
const BUSES = ["PCIe 5.0 x16", "PCIe 4.0 x16", "PCIe 3.0 x16", "AGP 8x", "AGP 4x", "PCI"];
const FORM_FACTORS = ["ATX", "Micro-ATX", "Mini-ITX", "E-ATX"];
const STORAGE_FORM_FACTORS = ["M.2 2280", "M.2 2230", "2.5in", "3.5in"];
const STORAGE_INTERFACES = ["PCIe 5.0 x4", "PCIe 4.0 x4", "PCIe 3.0 x4", "SATA III"];
const CPU_ARCHITECTURES = ["Zen 5", "Zen 4", "Zen 3", "Arrow Lake", "Raptor Lake Refresh", "Raptor Lake", "Alder Lake"];
const GPU_ARCHITECTURES = ["RDNA 4", "RDNA 3", "RDNA 2", "Blackwell", "Ada Lovelace", "Ampere"];

/**
 * Fields offered per category. Keys must exist in that category's
 * `SPEC_FIELDS` entry, and every `required: true` key must be in
 * `REQUIRED_SPEC_FIELDS` — the test suite asserts both, so this cannot drift
 * from the contracts.
 */
export const SPEC_FORM_FIELDS: Record<ComponentCategory, readonly SpecFieldDescriptor[]> = {
  CPU: [
    { key: "architecture", label: "Architecture", kind: "select", required: true, options: CPU_ARCHITECTURES },
    { key: "socket", label: "Socket", kind: "select", required: true, options: SOCKETS },
    { key: "cores", label: "Cores", kind: "number", required: true, placeholder: "8" },
    { key: "threads", label: "Threads", kind: "number", required: false, placeholder: "16" },
    { key: "baseClock", label: "Base clock", kind: "number", required: false, unit: "MHz", placeholder: "4200" },
    { key: "boostClock", label: "Boost clock", kind: "number", required: false, unit: "MHz", placeholder: "5000" },
    { key: "tdp", label: "TDP", kind: "number", required: false, unit: "W", placeholder: "120" },
    { key: "cache", label: "Cache", kind: "text", required: false, placeholder: "96MB L3" }
  ],
  GPU: [
    // No socket: a GPU is a card on a bus. `GpuSpecs` has no such field.
    { key: "architecture", label: "Architecture", kind: "select", required: true, options: GPU_ARCHITECTURES },
    { key: "codename", label: "Codename", kind: "text", required: false, placeholder: "Navi 48" },
    { key: "bus", label: "Bus", kind: "select", required: false, options: BUSES },
    { key: "vramCapacity", label: "VRAM", kind: "number", required: true, unit: "GB", placeholder: "16" },
    { key: "vramType", label: "VRAM type", kind: "select", required: false, options: VRAM_TYPES },
    { key: "memoryBusWidth", label: "Memory bus", kind: "number", required: false, unit: "bit", placeholder: "256" },
    { key: "memoryClock", label: "Memory clock", kind: "number", required: false, unit: "MHz", placeholder: "2518" },
    { key: "coreClock", label: "Core clock", kind: "number", required: false, unit: "MHz", placeholder: "2400" },
    { key: "boostClock", label: "Boost clock", kind: "number", required: false, unit: "MHz", placeholder: "2970" },
    { key: "computeUnits", label: "Compute units", kind: "number", required: false, placeholder: "64" },
    { key: "shadingUnits", label: "Shading units", kind: "number", required: false, placeholder: "4096" },
    { key: "tmus", label: "TMUs", kind: "number", required: false, placeholder: "256" },
    { key: "rops", label: "ROPs", kind: "number", required: false, placeholder: "128" },
    { key: "tdp", label: "TDP", kind: "number", required: false, unit: "W", placeholder: "304" }
  ],
  MOBO: [
    { key: "chipset", label: "Chipset", kind: "text", required: true, placeholder: "X870E" },
    { key: "socket", label: "Socket", kind: "select", required: true, options: SOCKETS },
    { key: "formFactor", label: "Form factor", kind: "select", required: true, options: FORM_FACTORS },
    { key: "memoryType", label: "Memory type", kind: "select", required: true, options: MEMORY_TYPES }
  ],
  RAM: [
    // No socket and no architecture: neither applies to a memory kit.
    { key: "capacity", label: "Capacity", kind: "number", required: true, unit: "GB", placeholder: "32" },
    { key: "memoryType", label: "Memory type", kind: "select", required: true, options: MEMORY_TYPES },
    { key: "speed", label: "Speed", kind: "number", required: true, unit: "MT/s", placeholder: "6000" },
    { key: "latency", label: "Latency", kind: "text", required: false, placeholder: "CL30" },
    { key: "modules", label: "Kit layout", kind: "text", required: false, placeholder: "2x16GB" }
  ],
  STORAGE: [
    { key: "type", label: "Drive type", kind: "select", required: true, options: ["NVMe", "SATA", "HDD"] },
    { key: "capacity", label: "Capacity", kind: "number", required: true, unit: "GB", placeholder: "2048" },
    { key: "formFactor", label: "Form factor", kind: "select", required: false, options: STORAGE_FORM_FACTORS },
    { key: "interface", label: "Interface", kind: "select", required: false, options: STORAGE_INTERFACES },
    { key: "readSpeed", label: "Sequential read", kind: "number", required: false, unit: "MB/s", placeholder: "7450" },
    { key: "writeSpeed", label: "Sequential write", kind: "number", required: false, unit: "MB/s", placeholder: "6900" }
  ]
};
