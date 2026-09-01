# Security Policy

Silicon Index handles market pricing data and community-submitted transaction proofs. We take the security and privacy of this data seriously and appreciate responsible disclosure from the community.

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities or sensitive data leaks.** Public issues are indexed and visible to everyone immediately, which can expose an unpatched vulnerability or leaked data to bad actors before a fix is available.

Instead, report vulnerabilities privately using **[GitHub Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)**:

1. Go to the **Security** tab of the affected repository.
2. Click **Report a vulnerability**.
3. Provide as much detail as possible (see below).

This applies to all repositories under the [`silicon-index`](https://github.com/silicon-index) organization, including the Main Portal, Backend API, Market Database, Market Scrapers, and Admin Dashboard.

### What to Include

* A clear description of the vulnerability and its potential impact.
* Steps to reproduce (proof-of-concept code or requests, if applicable).
* Affected module/repository, version, and environment.
* Any evidence of exposed secrets, credentials, PII, or unauthorized data access — **do not paste the sensitive data itself** into the report; describe its nature and location instead.

### Scope

In scope:

* Authentication, authorization, and access-control flaws.
* Injection, XSS, SSRF, and other OWASP Top 10 issues in any `silicon-index` service.
* Data ingestion pipeline bypasses (e.g. circumventing the strict whitelist rule described in [DEV-GUIDE.md](./DEV-GUIDE.md)).
* Exposure of PII, credentials, tokens, or other sensitive data.
* Supply-chain or CI/CD pipeline compromise.

Out of scope:

* Denial-of-service testing against production infrastructure.
* Automated vulnerability scanning that generates significant traffic without prior coordination.
* Social engineering against maintainers or contributors.

## Our Commitment

* We will acknowledge receipt of your report as soon as possible.
* We will investigate and keep you updated on remediation progress.
* We will credit reporters who wish to be credited once a fix is released, unless anonymity is requested.
* We will not pursue legal action against good-faith, non-destructive security research conducted under this policy.

## Data Handling Note

Per [DEV-GUIDE.md](./DEV-GUIDE.md), core repositories are designed to reject PII and unstructured data at ingestion. If you discover a path by which PII, secrets, or other sensitive data has entered any `silicon-index` system, treat it as a security report under this policy rather than a bug report.
