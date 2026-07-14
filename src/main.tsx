import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";

function showBootError(err: unknown): void {
  const root = document.getElementById("root");
  const box = document.getElementById("boot-error");
  const msg = document.getElementById("boot-error-msg");
  if (root) root.style.display = "none";
  if (box) box.style.display = "block";
  if (msg) {
    msg.textContent =
      err instanceof Error
        ? `${err.name}: ${err.message}\n\n${err.stack || ""}`
        : String(err);
  }
  console.error("[agentx boot]", err);
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found");
}

if (!window.agentx) {
  showBootError(
    new Error(
      "window.agentx is missing. Preload bridge failed — check Electron preload path and sandbox settings.",
    ),
  );
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (err) {
    showBootError(err);
  }
}

window.addEventListener("unhandledrejection", (e) => {
  console.error("[agentx unhandledrejection]", e.reason);
});
