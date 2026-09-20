import sdk from "@farcaster/frame-sdk";

export function getSDK() {
  // Always return SDK - it handles environment detection internally
  // SDK will work in Farcaster Frame and be inert in browser
  return sdk;
}

// Get notification details from Frame context
export async function getNotificationDetails(): Promise<{ token: string; url: string } | null> {
  try {
    // First try to get from SDK context
    const context = await sdk.context;
    if (context?.client?.notificationDetails) {
      return {
        token: context.client.notificationDetails.token,
        url: context.client.notificationDetails.url,
      };
    }
    
    // Fallback: Try to get from addFrame result
    const result = await sdk.actions.addFrame();
    if (result?.notificationDetails?.token && result?.notificationDetails?.url) {
      return {
        token: result.notificationDetails.token,
        url: result.notificationDetails.url,
      };
    }
    
    return null;
  } catch (err) {
    console.error("Failed to get notification details:", err);
    return null;
  }
}

// ✅ Async Mini App detection using the official SDK method.
// The Base app (Coinbase) hosts Mini Apps but its webview UA does NOT contain
// "warpcast"/"farcaster" and the page is NOT in an iframe, so the boot-time UA
// sniffing in index.html caches __FRAME_ENV=false there. sdk.isInMiniApp()
// talks to the actual host over the SDK channel, so it detects Warpcast AND
// the Base app reliably. If it returns true we flip the cached flag so all
// downstream isInFarcasterFrame() calls use the SDK wallet provider.
let miniAppDetectionPromise: Promise<boolean> | null = null;
export function ensureMiniAppDetection(): Promise<boolean> {
  // De-duplicate concurrent calls, but only cache a POSITIVE result permanently.
  // A false result may just be a timeout during slow host init (exactly the
  // Base app case we're fixing), so allow later calls to re-check.
  if (miniAppDetectionPromise) return miniAppDetectionPromise;
  const attempt = (async () => {
    try {
      if (typeof window === 'undefined') return false;
      // Already known to be in a frame? Nothing to do.
      if ((window as any).__FRAME_ENV === true) return true;
      const inMiniApp = await Promise.race([
        sdk.isInMiniApp(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
      ]);
      if (inMiniApp) {
        console.log('📱 Mini App detected via sdk.isInMiniApp() (Base app / Warpcast)');
        (window as any).__FRAME_ENV = true;
        return true;
      }
      console.log('🖥️ sdk.isInMiniApp() = false (or timed out) — will re-check on next call');
      return (window as any).__FRAME_ENV === true;
    } catch (err) {
      console.warn('⚠️ isInMiniApp() check failed:', err);
      return typeof window !== 'undefined' && (window as any).__FRAME_ENV === true;
    }
  })();
  miniAppDetectionPromise = attempt;
  // Reset the memo on a negative/failed outcome so future calls retry.
  attempt.then((result) => {
    if (!result) miniAppDetectionPromise = null;
  }).catch(() => {
    miniAppDetectionPromise = null;
  });
  return attempt;
}

export function isInFarcasterFrame(): boolean {
  // ✅ CRITICAL FIX: Strict Frame detection - browser wallet should NEVER be mistaken for Frame
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    
    // ✅ PRIMARY: Use boot-time cached detection (set in index.html before UA stripped!)
    if (typeof (window as any).__FRAME_ENV !== 'undefined') {
      console.log('📱 Frame detection via __FRAME_ENV:', (window as any).__FRAME_ENV);
      return (window as any).__FRAME_ENV as boolean;
    }
    
    // ✅ Check User-Agent for Farcaster/Warpcast indicators
    const ua = navigator.userAgent || '';
    const uaLower = ua.toLowerCase();
    const isFrameUA = uaLower.includes('warpcast') || 
                      uaLower.includes('farcaster') ||
                      uaLower.includes('replit-bonsai');
    
    if (isFrameUA) {
      console.log('📱 Frame detected via User-Agent:', ua);
      return true;
    }
    
    // ✅ Check for mobile webview environment (Farcaster mobile app)
    // Mobile webview with iframe means we're in Farcaster Frame
    const isMobileWebView = /wv|webview|android.*chrome\/[.0-9]* (?!mobile)/i.test(ua) || 
                            (ua.includes('Mobile') && ua.includes('wv'));
    const isInIframe = window !== window.parent;
    
    if (isMobileWebView && isInIframe) {
      console.log('📱 Frame detected via mobile webview + iframe');
      (window as any).__FRAME_ENV = true;
      return true;
    }
    
    // ✅ Check for Farcaster Frame context in parent window
    const hasFrameContext = !!(window as any).fc;
    
    if (isInIframe && hasFrameContext) {
      console.log('📱 Frame detected via iframe + fc context');
      return true;
    }
    
    // ✅ Check if SDK wallet provider is available (late initialization indicator)
    try {
      const sdk = getSDK();
      if (sdk?.wallet?.ethProvider && isMobileWebView) {
        console.log('📱 Frame detected via mobile webview + SDK wallet provider');
        (window as any).__FRAME_ENV = true;
        return true;
      }
    } catch (sdkErr) {
      // SDK check failed, continue
    }
    
    // ❌ IMPORTANT: Do NOT check SDK wallet provider here!
    // SDK can be present in browser without being in a Frame
    console.log('🖥️ Not in Farcaster Frame - using browser wallet');
    return false;
  } catch (err) {
    console.error('❌ Frame detection error:', err);
    return false;
  }
}
