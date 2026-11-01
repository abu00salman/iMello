import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrefsProvider } from "./lib/prefs";
import { SessionProvider } from "./lib/session";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrefsProvider>
      <SessionProvider>
        <App />
      </SessionProvider>
    </PrefsProvider>
  </StrictMode>,
);
