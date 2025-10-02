import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress browser extension errors
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('has not been authorized yet')) {
    event.preventDefault();
    console.debug('Suppressed browser extension authorization error');
  }
});

// Prevent error overlay from showing
window.addEventListener('error', (event) => {
  if (event.message?.includes('has not been authorized yet')) {
    event.preventDefault();
    event.stopPropagation();
  }
});

// Remove error overlay if it appears (aggressive approach)
const observer = new MutationObserver(() => {
  const errorModal = document.querySelector('[data-vite-plugin-runtime-error-modal]') || 
                     document.querySelector('#vite-plugin-runtime-error-modal') ||
                     document.querySelector('[class*="runtime-error"]');
  
  if (errorModal) {
    errorModal.remove();
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

createRoot(document.getElementById("root")!).render(<App />);
