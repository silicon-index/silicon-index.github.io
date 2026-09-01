// SPDX-License-Identifier: AGPL-3.0-or-later
export function formatPrice(value: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency + " ";
  return symbol + Number(value).toLocaleString();
}

export function escapeHtml(str: string): string {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
