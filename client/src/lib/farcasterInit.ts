import sdk from "@farcaster/frame-sdk";

export function getSDK() {
  return sdk;
}

export async function initializeFarcasterSDK() {
  try {
    await sdk.actions.ready();
    console.log("✅ Farcaster SDK ready - splash dismissed");
  } catch (error) {
    console.error("SDK ready error:", error);
  }
}

export async function getFarcasterContext() {
  try {
    const context = await sdk.context;
    console.log("Farcaster context:", context?.user?.username || "no user");
    return context;
  } catch (error) {
    console.log("No Farcaster context available");
    return null;
  }
}
