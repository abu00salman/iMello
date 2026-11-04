import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CallsProvider } from "./lib/calls";
import { watchLayout } from "./lib/layout";
import { PrefsProvider } from "./lib/prefs";
import { SessionProvider } from "./lib/session";
import { unlockSounds } from "./lib/sounds";
import { bindVisualViewport } from "./lib/viewport";
import "./tokens.css";
import "./styles.css";
import "./calls.css";
import "./classic.css";
import { registerServiceWorker } from "./lib/push";

watchLayout();
bindVisualViewport();
addEventListener("pointerdown", () => unlockSounds(), { once: true });

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
