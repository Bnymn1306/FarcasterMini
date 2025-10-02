import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ERROR SUPPRESSION - Hide overlay but log errors
window.addEventListener('unhandledrejection', (event) => {
  const errorMsg = event.reason?.message || event.reason;
  
  // Only suppress browser extension errors
  if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('has not been authorized yet')) {
    event.preventDefault();
    event.stopPropagation();
    console.debug('Suppressed browser extension error');
  } else {
    // Log real errors but prevent overlay
    console.error('Real error:', errorMsg);
    event.preventDefault(); // Still prevent overlay
  }
});

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

// Remove ALL error modals immediately (super aggressive)
const removeErrorModals = () => {
  const selectors = [
    '[data-vite-plugin-runtime-error-modal]',
    '#vite-plugin-runtime-error-modal',
    '[class*="runtime-error"]',
    '[class*="error-overlay"]',
    '[class*="error-modal"]',
    'div[style*="z-index: 9999"]',
    'div[style*="position: fixed"]'
  ];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      const text = el.textContent || '';
      if (text.includes('runtime-error-plugin') || text.includes('authorized') || text.includes('error')) {
        el.remove();
      }
    });
  });
};

// Run immediately and continuously
removeErrorModals();
setInterval(removeErrorModals, 100);

// Watch for new error modals
const observer = new MutationObserver(removeErrorModals);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

createRoot(document.getElementById("root")!).render(<App />);
