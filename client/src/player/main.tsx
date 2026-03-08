import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../shared/AppShell";
import "../../public/css/index.css";

const rootElement = document.getElementById("app");
if (!rootElement) {
  throw new Error("Missing #app root element for player app");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppShell role="player" />
  </StrictMode>,
);
