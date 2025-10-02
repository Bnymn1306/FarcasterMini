import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('has not been authorized yet')) {
    event.preventDefault();
    console.debug('Suppressed browser extension authorization error');
  }
});

createRoot(document.getElementById("root")!).render(<App />);
