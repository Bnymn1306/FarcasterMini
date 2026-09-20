// Replit-only entrypoint. The standalone Vercel handler never imports this file.
import { normalizeCdpSecret } from "./normalize-cdp-secret";

normalizeCdpSecret();
import("./replit-bootstrap")
  .then(({ startReplitServer }) => startReplitServer())
  .catch(() => {
    console.error("Server startup failed");
    process.exit(1);
  });