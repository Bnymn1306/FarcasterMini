import sdk from "@farcaster/frame-sdk";

let isFrameReady = false;
let frameReadyPromise: Promise<boolean> | null = null;

export function isInFarcasterFrame(): boolean {
  if (typeof window === 'undefined') return false;
  return window !== window.parent;
}

export async function initializeFarcasterSDK(): Promise<boolean> {
  if (frameReadyPromise) {
    return frameReadyPromise;
  }

  frameReadyPromise = new Promise<boolean>((resolve) => {
    const inFrame = isInFarcasterFrame();
    
    if (!inFrame) {
      console.log("ℹ️ Not running in Farcaster Frame - skipping SDK ready()");
      isFrameReady = false;
      resolve(false);
      return;
    }

    console.log("🚀 Farcaster Frame detected, calling SDK ready()...");
    
    const timeoutMs = 5000;
    let timeoutId: number;
    let resolved = false;

    const resolveOnce = (success: boolean, message: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      console.log(message);
      isFrameReady = success;
      resolve(success);
    };

    timeoutId = window.setTimeout(() => {
      resolveOnce(false, "⚠️ SDK ready() timeout after 5s - continuing anyway");
    }, timeoutMs);

    sdk.actions.ready()
      .then(() => {
        resolveOnce(true, "✅ SDK ready() completed - splash should close");
      })
      .catch((err) => {
        console.error("❌ SDK ready() failed:", err);
        resolveOnce(false, "❌ SDK ready() failed - continuing anyway");
      });
  });

  return frameReadyPromise;
}

export async function getFarcasterContext() {
  if (!isFrameReady) {
    console.log("⚠️ SDK not ready, skipping context fetch");
    return null;
  }

  try {
    const context = await sdk.context;
    return context;
  } catch (error) {
    console.error("❌ Failed to get Farcaster context:", error);
    return null;
  }
}

export function getSDK() {
  return sdk;
}
