---
name: Vercel hosting boundary
description: Safe separation of Vercel frontend hosting from a full backend and trading-worker migration.
---

Vercel hosts the frontend only; the existing persistent backend retains the database connections and the sole background trading executors. Keep a backend origin independent of any frontend custom-domain change.

**Why:** The existing polling executors are not safe to duplicate or transplant unchanged into request-scoped functions. A full migration is authorized, but authorization to prepare it is not evidence that a worker cutover is safe.

**How to apply:** Preserve the canonical basedmem.xyz identity and signed domain association. Keep the persistent backend and sole trading executor active until independent database ownership, provider credentials, and transaction-reconciliation safeguards have been verified. Stage full-backend changes outside the production GitHub branch to avoid triggering a premature cutover.

Validate clean Linux dependency resolution, not only a build with the workspace's preinstalled dependencies.

**Why:** A previously installed workspace built successfully while a fresh npm install rejected a macOS-only transitive watcher whose optional marker was missing in the lockfile.

**How to apply:** Include a clean-install check when preparing another hosting provider; preserve platform-specific optional dependency metadata rather than using force-install flags.

A dry-run install does not validate package download URLs. Workspace-only registry addresses can survive in lockfiles even when the package is publicly available.

**Why:** The local build and npm dry-run passed, but Vercel could not resolve an internal package registry hostname during the real download.

**How to apply:** Check every resolved registry host before exporting, verify public replacement tarballs against the existing integrity hash, and use an isolated real install rather than presenting dry-run success as a complete deployment check.