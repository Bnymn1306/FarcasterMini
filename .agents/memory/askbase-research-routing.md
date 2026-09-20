---
name: AskBase research routing
description: Decision boundary between authoritative connected data tools and open-ended sourced research.
---

AskBase must accept free-form questions, but route authoritative metrics such as verified-pool DEX volume to direct data tools rather than asking a research model to infer them. Open-ended questions use dynamic research and must return valid source links; a missing or incomplete source is an explicit failure, not permission to fall back to a generic response.

**Why:** Deterministic templates repeated irrelevant answers, while web research can guess or cite broader market figures when a precise connected metric is available. Turkish inflections such as “hacmi” also demonstrated that routing must account for natural-language morphology.

**How to apply:** Add direct tools for metrics the app can calculate from verified sources. Keep open-ended research question-specific, language-consistent, citation-validated, time-bounded, rate-limited, and fail-closed. Test EN/TR routing phrases whenever a new metric intent is added.