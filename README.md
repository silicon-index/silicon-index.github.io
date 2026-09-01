# Silicon Index 🖥️📊

> **Open-Source, Community-Verified PC Hardware Market Index & Fair-Value Screener**

Silicon Index is a decentralized, transparent analytics ecosystem designed to track real-time hardware pricing across global retail and secondary markets. By combining automated aggregation, strict data sanitization, and deterministic fair-value algorithms, Silicon Index identifies artificial inflation, scalper margins, and market depreciation trends.

---

## 🏛️ Ecosystem Repositories

The platform is architected across 11 modular repositories under the [`silicon-index`](https://github.com/silicon-index) organization to ensure strict separation of concerns, data hygiene, and security.

| Module | Source Repository | Live Service / Deployment | Description |
| :--- | :--- | :--- | :--- |
| **Main Portal** | [`silicon-index.github.io`](https://github.com/silicon-index/silicon-index.github.io) | [🌐 Web UI](https://silicon-index.github.io) | Primary market screener, component search, and live index tables. |
| **Backend API** | [`silicon-index-backend-api`](https://github.com/silicon-index/silicon-index-backend-api) | `api.silicon-index.internal` | REST/Serverless microservices, telemetry endpoints, and data delivery. |
| **Market Database** | [`silicon-index-market-database.github.io`](https://github.com/silicon-index/silicon-index-market-database.github.io) | `DB Migration Layer` | MongoDB schemas, validation definitions, and point-in-time recovery tooling. |
| **Market Scrapers** | [`silicon-index-market-scrapers.github.io`](https://github.com/silicon-index/silicon-index-market-scrapers.github.io) | `Automated Workers` | Multi-source price aggregation bots with integrated whitelist sanitization. |
| **AI Models** | [`silicon-index-ai.github.io`](https://github.com/silicon-index/silicon-index-ai.github.io) | `Valuation Engine` | Mathematical models for price anomaly detection and fair-value scoring. |
| **Security Hub** | [`silicon-index-security.github.io`](https://github.com/silicon-index/silicon-index-security.github.io) | [🌐 Security Portal](https://silicon-index.github.io/silicon-index-security.github.io) | Security governance, incident advisories, and disclosure policies. |
| **Admin Dashboard** | [`silicon-index-admin-dashboard.github.io`](https://github.com/silicon-index/silicon-index-admin-dashboard.github.io) | [🌐 Admin Console](https://silicon-index.github.io/silicon-index-admin-dashboard.github.io) | Internal interface for price validation and moderation controls. |
| **Contributors** | [`silicon-index-contributors.github.io`](https://github.com/silicon-index/silicon-index-contributors.github.io) | [🌐 Contributor Hub](https://silicon-index.github.io/silicon-index-contributors.github.io) | Guidelines, community badges, and maintainer onboarding. |
| **Donations API** | [`silicon-index-donations-api.github.io`](https://github.com/silicon-index/silicon-index-donations-api.github.io) | `Gateway Layer` | Financial ledger and donation processing integration. |
| **Tech Museum** | [`silicon-index-museum.github.io`](https://github.com/silicon-index/silicon-index-museum.github.io) | [🌐 Museum Archive](https://silicon-index.github.io/silicon-index-museum.github.io) | Retrospective archive of legacy architectures and historic MSRP benchmarks. |
| **Community Blog** | [`silicon-index-blog.github.io`](https://github.com/silicon-index/silicon-index-blog.github.io) | [🌐 Blog & Logs](https://silicon-index.github.io/silicon-index-blog.github.io) | Market trend reports, teardowns, and algorithm release notes. |

---

## 🔒 Key Operational Standards

* **Strict Whitelist Pipeline:** The platform ingests only normalized identifiers (`component_id`), validated numeric values (`price_amount`), currencies, and timestamps. Free text, seller names, user addresses, and personal identifiable information (PII) are rejected at ingestion boundaries.
* **Open Source & Protected Branches:** Core branches (`main`) enforce mandatory review checkpoints. Direct commits are restricted to maintain deployment stability and codebase integrity.
* **Decoupled Architecture:** Scraping logic, internal databases, and private moderation tooling operate independently of the public client interfaces.

---

## 🧭 Project Navigation & Governance

* 📖 **[Developer Guide (`DEV-GUIDE.md`)](./DEV-GUIDE.md)**: Coding standards, schema validation, and PR workflows.
* 📜 **[Terms & Rules (`TERMS-AND-RULES.md`)](./TERMS-AND-RULES.md)**: Community rules, data policies, and amendment processes.
* 🛡️ **[Security Advisories](https://github.com/silicon-index/silicon-index-security.github.io)**: Responsible vulnerability disclosure procedures.

---

## 🛠️ Contributing

1. Fork the respective repository within the [`silicon-index`](https://github.com/silicon-index) organization.
2. Create a branch from `dev` (`git checkout -b feature/your-feature-name`).
3. Implement your changes adhering to local linting and test coverage.
4. Open a Pull Request targeting the `dev` branch with a clear description of the updates.

---

## 📄 License

This project is licensed under the **[MIT License](https://opensource.org/licenses/MIT)**.
