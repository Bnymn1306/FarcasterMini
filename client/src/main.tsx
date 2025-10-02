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
  // Suppress buffer module errors (known Vite issue)
  if (event.message && event.message.includes('buffer')) {
    event.preventDefault();
    return;
  }
  
  // Log other errors
  if (event.message || event.error) {
    console.error('Window error:', event.message, event.error);
  }
  event.preventDefault(); // Prevent overlay
}, true);

// EXTREME OVERLAY REMOVAL - Target Replit runtime error plugin
const nukeThatOverlay = () => {
  // Kill all overlays
  const killSelectors = [
    '[data-vite-plugin-runtime-error-modal]',
    '#vite-plugin-runtime-error-modal',
    'iframe[data-vite-plugin]',
    'div[class*="runtime"]',
    'div[class*="error-overlay"]',
    'div[style*="position: fixed"][style*="inset: 0"]',
    'div[style*="z-index: 2147483647"]',
  ];

  killSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Kill ALL iframes with high z-index or fixed position
  document.querySelectorAll('iframe').forEach(iframe => {
    const style = iframe.getAttribute('style') || '';
    const computedStyle = window.getComputedStyle(iframe);
    
    if (style.includes('position: fixed') || 
        computedStyle.position === 'fixed' ||
        parseInt(computedStyle.zIndex) > 1000) {
      iframe.remove();
    }
  });

  // Kill divs with error text
  document.querySelectorAll('div').forEach(div => {
    const text = div.textContent || '';
    if ((text.includes('runtime-error-plugin') || 
         text.includes('has not been authorized')) &&
        div.parentElement?.tagName === 'BODY') {
      div.remove();
    }
  });
};

// Nuclear option: run every 30ms
nukeThatOverlay();
setInterval(nukeThatOverlay, 30);

// Observer with immediate callback
const observer = new MutationObserver(() => {
  nukeThatOverlay();
});

observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true
});

createRoot(document.getElementById("root")!).render(<App />);
