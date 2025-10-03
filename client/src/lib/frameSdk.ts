let sdkPromise: Promise<any> | null = null;

export async function initFrameSDK() {
  if (sdkPromise) {
    return sdkPromise;
  }

  sdkPromise = (async () => {
    try {
      console.log("🚀 Loading Farcaster Frame SDK...");
      
      const sdkModule = await import("@farcaster/frame-sdk");
      const sdk = sdkModule?.default ?? sdkModule;
      
      if (!sdk) {
        throw new Error("Frame SDK module not found");
      }

      console.log("✅ SDK loaded, calling ready()...");
      
      await sdk.actions.ready();
      
      console.log("✅ SDK ready() completed - splash screen should close");
      
      return sdk;
    } catch (error) {
      console.error("❌ Frame SDK initialization failed:", error);
      
      try {
        window.parent?.postMessage({ type: "farcaster.miniapp.ready" }, "*");
        console.log("⚠️ Sent fallback postMessage");
      } catch (fallbackError) {
        console.error("❌ Fallback postMessage failed:", fallbackError);
      }
      
      throw error;
    }
  })();

  return sdkPromise;
}

export function getFrameSDK(): Promise<any> {
  if (!sdkPromise) {
    return initFrameSDK();
  }
  return sdkPromise;
}
