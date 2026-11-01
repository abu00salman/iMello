import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CallsProvider } from "./lib/calls";
import { PrefsProvider } from "./lib/prefs";
import { SessionProvider } from "./lib/session";
import "./styles.css";
import "./theme.css";
import { registerServiceWorker } from "./lib/push";

registerServiceWorker(localStorage.getItem("imello.locale") === "en" ? "en" : "ar");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrefsProvider>
      <SessionProvider>
        <CallsProvider>
          <App />
        </CallsProvider>
      </SessionProvider>
    </PrefsProvider>
  </StrictMode>,
);
