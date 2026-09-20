#!/usr/bin/env bash
set -euo pipefail

export CI=1

# Reconcile any package changes introduced by the merged task without
# prompting, then verify that the merged application still builds.
npm install --no-audit --no-fund --prefer-offline
npm run build