---
name: UI demo recording
description: Reliable browser-recording waits for BasedMem's continuously updating screens.
---

BasedMem screens that load live market and wallet data may keep network requests active indefinitely. Automated browser recordings must not use network-idle as their page-ready condition.

**Why:** A recording attempt timed out even though the page and server were healthy because background polling prevented the network from becoming idle.

**How to apply:** Navigate with DOM-content-loaded, then wait for the specific visible control that starts the recorded flow.