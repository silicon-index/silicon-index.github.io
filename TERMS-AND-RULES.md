# Silicon Index — Terms of Service, Community Rules & Governance

> Last updated: September 2026

Welcome to **Silicon Index**. By accessing our web applications, using our data APIs, or contributing code/data to any repository within the `silicon-index` organization, you agree to comply with the terms and rules outlined below.

---

## 1. General Terms of Use

* **Informational & Statistical Purpose:** Silicon Index is an open, community-driven hardware market fair-value screener. All indices, calculated metrics, and fair-value estimations are provided strictly for educational and analytical purposes.
* **No Financial or Commercial Advice:** Price metrics and index trends reflect historical aggregated telemetry and algorithm models. They do not constitute certified financial, purchasing, or commercial advice.
* **"As-Is" Provision:** The software, APIs, and datasets are provided "as is", without warranty of any kind, express or implied. The maintainers are not liable for transaction outcomes, hardware availability shifts, or marketplace listing discrepancies.

---

## 2. Community & Data Rules

To maintain high data integrity and ensure complete privacy compliance (GDPR & international standards), all users and contributors must observe the following rules:

* **Zero Personal Data (No PII):** No scraping tool, API submission, or frontend view may process, ingest, or expose individual seller names, direct contact information, phone numbers, or private locations.
* **No Market Manipulation or Sybil Tactics:** Submitting artificial, fabricated, or biased pricing points to manipulate a component's *Fair Value Score* will result in immediate blacklisting of the submitting client/token.
* **Responsible Data Extraction:** All scraping utilities and indexing scripts must implement strict rate-limiting, exponential backoff, and follow ethical data-collection practices. Do not execute destructive, high-frequency request patterns against public endpoints.
* **Respectful Collaboration:** Constructive discussion is mandatory across all GitHub Issues, Pull Requests, and community discussions. Harassment or toxic behavior will lead to repository access revocation.

---

## 3. Intellectual Property & Open Source Licensing

* **Core Codebase:** All public tools and frontends are open-sourced under the **MIT License**.
* **Contributed Work:** Any code, patch, or schema documentation submitted via Pull Request is irrevocably licensed under the project’s default MIT terms upon merge.
* **Fair Use Telemetry:** Silicon Index processes only public numeric data points and hardware product nomenclature. We do not claim ownership of third-party trademarks or proprietary vendor assets.

---

## 4. Governance: How Terms and Rules Can Be Amended

Silicon Index follows an open, transparent governance model. Changes to these Terms, community rules, or data schemas are not made arbitrarily.

### Amendment Workflow:

1. **RFC (Request for Comments) / Issue:**
   * Any contributor or community member can propose a policy change or rule adjustment by opening an Issue labeled `governance/rfc`.
   * A minimum review period of **7 days** is allocated for community feedback and open discussion.

2. **Pull Request & Documentation:**
   * An official Pull Request must be submitted updating `TERMS-AND-RULES.md` or related governance files.
   * The PR description must clearly summarize the rationale, legal/operational justification, and backward compatibility implications.

3. **Core Review & Consensus:**
   * Approval requires formal sign-off from designated maintainers/code owners.
   * Material changes affecting data licensing, contributor rights, or data hygiene undergo mandatory security audit before merging.

4. **Version Tagging & Notice:**
   * Upon merging, the `Last updated` date is adjusted, and the changelog is summarized in the release notes or the official project blog.

---

## 5. Contact & Incident Reporting

To report a critical security vulnerability, data ingestion bug, or an inadvertent terms violation, open a confidential issue via **GitHub Security Advisories** on the respective repository or contact the core maintainers directly.
