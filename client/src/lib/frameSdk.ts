let sdkPromise: Promise<any> | null = null;

export async function initFrameSDK() {
  if (sdkPromise) {
    return sdkPromise;
  }

  sdkPromise = (async () => {
    try {
      const sdkModule = await import("@farcaster/frame-sdk");
      const frameSDK = sdkModule?.default ?? sdkModule;
      
      if (!frameSDK) {
        throw new Error("Frame SDK module not found");
      }

      console.log("🚀 Initializing Farcaster Frame SDK...");
      
      const sdk = await frameSDK.init({ fetchContext: true });
      
      console.log("✅ Frame SDK initialized successfully");
      
      await sdk.actions.ready();
      
      console.log("✅ Frame SDK ready() called - splash should close");
      
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
