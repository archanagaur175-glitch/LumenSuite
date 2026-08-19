import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./core/store";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);

window.addEventListener("error", (e) => {
  console.error("[global]", e.error ?? e.message);
});