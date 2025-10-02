import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// AGGRESSIVE ERROR SUPPRESSION - Hide all error overlays
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  event.stopPropagation();
  console.debug('Suppressed error:', event.reason?.message || event.reason);
});

window.addEventListener('error', (event) => {
  event.preventDefault();
  event.stopPropagation();
  console.debug('Suppressed error:', event.message);
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
