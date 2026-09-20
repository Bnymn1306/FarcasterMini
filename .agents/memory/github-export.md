---
name: GitHub export
description: Safe exports when workspace and GitHub histories have diverged.
---

When synchronizing this workspace to its existing GitHub repository, preserve the remote history and avoid force-pushing. A full current-file snapshot can be committed with the latest remote commit as its parent when intermediate workspace history is not needed.

**Why:** Workspace checkpoint history and the remote branch can diverge. Exporting all intermediate history is unnecessary for a current-source transfer and can expose historical files that were not reviewed.

**How to apply:** Review the current snapshot for secrets and missing required assets, check the remote head before writing, and verify the resulting commit's explicit tree SHA against the local snapshot. Git CLI authentication and connector authorization are independent; a failing CLI credential does not imply the connected GitHub account needs reauthorization.