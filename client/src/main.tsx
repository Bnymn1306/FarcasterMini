import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// TOTAL ERROR SUPPRESSION - Completely consume browser extension errors
window.addEventListener('unhandledrejection', (event) => {
  const errorMsg = event.reason?.message || event.reason;
  
  // Completely suppress browser extension errors (no log, no overlay)
  if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('has not been authorized yet')) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return false;
  }
  
  // For other errors, log but prevent overlay
  console.error('Real error:', errorMsg);
  event.preventDefault();
}, true);

window.addEventListener('error', (event) => {
  // Log errors for debugging
  if (event.message || event.error) {
    console.error('Window error:', event.message, event.error);
  }
  event.preventDefault(); // Prevent overlay
}, true);

// Note: Aggressive overlay removal scripts removed - was causing mobile WebView crashes

// Render App immediately - SDK ready() will be called from App component
createRoot(document.getElementById("root")!).render(<App />);
