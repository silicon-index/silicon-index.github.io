// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Sample moderation queue, for verifying the admin table layout.
 *
 * Deliberately NOT auto-loaded. Seeding fake submissions into the live queue
 * on page load would put invented items in front of a moderator with nothing
 * to distinguish them from real contributions — someone would eventually
 * approve one into the index. Loading is an explicit action, every sample
 * carries a `demo_` submission id so the row can be marked and the set removed
 * precisely, and proof URLs point at `example.com` so no real listing is
 * implied.
 */

import type { PriceSubmission } from "@modules/contributors/contracts";
import { readStaged, writeStaged } from "@/services/dataService";

/** Prefix identifying a sample record. Real submissions use `sub_`. */
export const DEMO_ID_PREFIX = "demo_";

export function isDemoSubmission(submission: Pick<PriceSubmission, "submissionId">): boolean {
  return submission.submissionId.startsWith(DEMO_ID_PREFIX);
}

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

/**
 * Covers the cases the table has to render: both contributor tiers, the
 * `anon-` handle format, several categories, a known SKU that the auto-accept
 * engine can price against, and one whose SKU is absent from the catalogue.
 */
export const SAMPLE_SUBMISSIONS: PriceSubmission[] = [
  {
    submissionId: DEMO_ID_PREFIX + "gpu_9070xt",
    contributorHash: "0189d3f2-7c41-4a9b-9f3e-1122334455aa",
    contributorId: "anon-0189d3f2",
    contributorTier: "anonymous",
    sku: "gpu_amd_radeon_rx_9070_xt",
    componentName: "AMD Radeon RX 9070 XT",
    manufacturer: "AMD",
    releaseYear: 2025,
    category: "GPU",
    specs: {
      architecture: "RDNA 4",
      codename: "Navi 48",
      bus: "PCIe 5.0 x16",
      vramCapacity: 16,
      vramType: "GDDR6",
      memoryBusWidth: 256,
      memoryClock: 2518,
      boostClock: 2970,
      computeUnits: 64,
      shadingUnits: 4096,
      tmus: 256,
      rops: 128,
      tdp: 304
    },
    reportedPrice: 689,
    currency: "USD",
    proofUrl: "https://example.com/listing/rx-9070-xt",
    status: "pending",
    submittedAt: hoursAgo(2)
  },
  {
    submissionId: DEMO_ID_PREFIX + "cpu_7800x3d",
    contributorHash: "7b2c9910-44de-4f0a-8c31-99aa77bb2210",
    contributorId: "anon-7b2c9910",
    contributorTier: "anonymous",
    sku: "cpu_amd_ryzen7_7800x3d",
    componentName: "AMD Ryzen 7 7800X3D",
    manufacturer: "AMD",
    releaseYear: 2023,
    category: "CPU",
    specs: { architecture: "Zen 4", socket: "AM5", cores: 8, threads: 16, boostClock: 5000, tdp: 120, cache: "96MB L3" },
    // Far above the historical median: the engine should refuse to auto-accept.
    reportedPrice: 812,
    currency: "USD",
    proofUrl: "https://example.com/marketplace/7800x3d",
    status: "pending",
    submittedAt: hoursAgo(9)
  },
  {
    submissionId: DEMO_ID_PREFIX + "ram_ddr5",
    contributorHash: "c41f0a55-1d8e-4b72-9a05-5f6e7d8c9b01",
    contributorId: "maintainer_kim",
    contributorTier: "trusted",
    sku: "ram_gskill_trident_z5_neo_32gb_ddr5_6000",
    componentName: "G.Skill Trident Z5 Neo 32GB DDR5-6000",
    manufacturer: "G.Skill",
    releaseYear: 2023,
    category: "RAM",
    specs: { capacity: 32, memoryType: "DDR5", speed: 6000, latency: "CL30", modules: "2x16GB" },
    reportedPrice: 118,
    currency: "USD",
    proofUrl: "https://example.com/receipt/trident-z5",
    status: "pending",
    submittedAt: hoursAgo(21)
  },
  {
    submissionId: DEMO_ID_PREFIX + "storage_unknown",
    contributorHash: "ee5510cc-9032-4a11-b7d4-0099aabbccdd",
    contributorId: "anon-ee5510cc",
    contributorTier: "anonymous",
    // Not in the catalogue: exercises the "no series" path in the queue.
    sku: "storage_generic_4tb_nvme",
    componentName: "Generic 4TB NVMe",
    manufacturer: "Unbranded",
    releaseYear: 2024,
    category: "STORAGE",
    specs: { type: "NVMe", capacity: 4096, formFactor: "M.2 2280", interface: "PCIe 4.0 x4" },
    reportedPrice: 189,
    currency: "USD",
    proofUrl: "https://example.com/store/generic-4tb",
    status: "pending",
    submittedAt: hoursAgo(30)
  }
];

/** Adds any sample rows not already present. Existing submissions are untouched. */
export function loadSampleQueue(): number {
  const staged = readStaged();
  const present = new Set(staged.map((s) => s.submissionId));
  const missing = SAMPLE_SUBMISSIONS.filter((s) => !present.has(s.submissionId));
  if (missing.length > 0) writeStaged([...staged, ...missing]);
  return missing.length;
}

/** Removes only the sample rows, leaving real submissions in place. */
export function clearSampleQueue(): number {
  const staged = readStaged();
  const kept = staged.filter((s) => !isDemoSubmission(s));
  const removed = staged.length - kept.length;
  if (removed > 0) writeStaged(kept);
  return removed;
}
