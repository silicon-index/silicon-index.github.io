## Summary

<!-- What does this PR change, and why? -->

## Related Issue(s)

<!-- Link any related issues, e.g. Closes #123 -->

---

## Checklist

Please confirm the following before requesting review. See [DEV-GUIDE.md](../DEV-GUIDE.md) for full data-handling and workflow standards.

- [ ] **Targets the `dev` branch** (not `main`). Direct PRs to `main` will not be merged.
- [ ] **No PII** — no seller names, individual user accounts, phone numbers, emails, or physical locations are included in code, data, or commit history.
- [ ] **No secrets committed** — no API keys, tokens, `.env` files, credentials, or private URLs are present in the diff.
- [ ] **No raw/unstructured data** — no free-text descriptions, forum posts, or arbitrary HTML/scraped snippets were ingested outside the strict whitelist fields (`component_id`, `price_amount`, `currency`, `timestamp`, `source_type`).
- [ ] **Tracking parameters stripped** — any source URLs have `utm_*`, affiliate tags, and internal tracking tokens removed.
- [ ] Code passes local linting/formatting.
- [ ] Changes were tested locally (describe how, below).
- [ ] Documentation updated if behavior, schema, or workflow changed.

## How Was This Tested?

<!-- Describe manual testing, mock data used, or automated tests run -->

## Screenshots (if UI change)

<!-- Optional -->
