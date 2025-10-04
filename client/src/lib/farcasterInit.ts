import sdk from "@farcaster/frame-sdk";

let sdkReadySuccess = false;
let frameReadyPromise: Promise<{ success: boolean; inFrame: boolean }> | null = null;

export function isInFarcasterFrame(): boolean {
  if (typeof window === 'undefined') return false;
  return window !== window.parent;
}

export async function initializeFarcasterSDK(): Promise<{ success: boolean; inFrame: boolean }> {
  if (frameReadyPromise) {
    return frameReadyPromise;
  }

  frameReadyPromise = new Promise<{ success: boolean; inFrame: boolean }>((resolve) => {
    const inFrame = isInFarcasterFrame();
    const frameInfo = inFrame ? "in Farcaster Frame" : "in browser";
    console.log(`🚀 Initializing Farcaster SDK (${frameInfo}) - calling ready()...`);
    
    const timeoutMs = 3000;
    let timeoutId: number;
    let resolved = false;

    const resolveOnce = (success: boolean, message: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      console.log(message);
      sdkReadySuccess = success;
      resolve({ success, inFrame });
    };

    timeoutId = window.setTimeout(() => {
      resolveOnce(false, `⏱️ SDK ready() timeout after 3s (${frameInfo}) - splash dismissed, app active`);
    }, timeoutMs);

    sdk.actions.ready()
      .then(() => {
        resolveOnce(true, `✅ SDK ready() completed (${frameInfo}) - splash dismissed, app active`);
      })
      .catch((err) => {
        console.error("⚠️ SDK ready() failed (non-fatal):", err);
        resolveOnce(false, `⚠️ SDK ready() failed (${frameInfo}) - splash dismissed, app active`);
      });
  });

  return frameReadyPromise;
}

export async function getFarcasterContext() {
  if (!sdkReadySuccess) {
    console.log("⚠️ SDK not fully ready - attempting context fetch anyway");
  }
  
  try {
    const context = await sdk.context;
    if (context?.user) {
      console.log("✅ Farcaster context loaded:", context.user.username);
      return context;
    }
    console.log("ℹ️ Context available but no user data");
    return null;
  } catch (error) {
    console.log("ℹ️ Running outside Farcaster - context unavailable");
    return null;
  }
}

export function getSDK() {
  return sdk;
}
