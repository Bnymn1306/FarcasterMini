---
name: Vercel hosting boundary
description: Why Vercel is frontend-only and canonical identity stays on the existing domain.
---

Vercel hosts the frontend only; the existing persistent backend retains the database connections and the sole background trading executors. Keep a backend origin independent of any frontend custom-domain change.

**Why:** The user requested Vercel compatibility without interrupting active trading. The existing polling executors are not safe to duplicate or transplant unchanged into request-scoped functions.

**How to apply:** Do not treat a Vercel import as permission to move funds, migrate data, stop the backend, or change DNS. The supplemental Vercel URL is not a newly verified Farcaster miniapp: canonical metadata and the signed domain association remain unchanged until a separate domain migration is authorized.

Validate clean Linux dependency resolution, not only a build with the workspace's preinstalled dependencies.

**Why:** A previously installed workspace built successfully while a fresh npm install rejected a macOS-only transitive watcher whose optional marker was missing in the lockfile.

**How to apply:** Include a clean-install check when preparing another hosting provider; preserve platform-specific optional dependency metadata rather than using force-install flags.

A dry-run install does not validate package download URLs. Workspace-only registry addresses can survive in lockfiles even when the package is publicly available.

**Why:** The local build and npm dry-run passed, but Vercel could not resolve an internal package registry hostname during the real download.

**How to apply:** Check every resolved registry host before exporting, verify public replacement tarballs against the existing integrity hash, and use an isolated real install rather than presenting dry-run success as a complete deployment check.