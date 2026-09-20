---
name: Deployment startup and port binding
description: Reserved VM startup rules that keep BasedMem externally reachable during production health checks.
---

Production must bind to the runtime-provided `PORT`; never add a separate fixed `PORT` entry under project environment configuration. Keep one explicit web mapping from local port `5000` to external port `80`.

**Why:** Replit Reserved VM's sidecar may report an internal mapped port that differs from the app's local port. Removing the web mapping breaks Preview, while duplicating `PORT` in environment configuration can interfere with runtime configuration.

**How to apply:** Start the HTTP listener before database seeding and background executors, bind to `process.env.PORT` with a `5000` fallback, retain the single `5000 → 80` web mapping, and leave project environment `PORT` unset.