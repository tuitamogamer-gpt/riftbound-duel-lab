import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "./i18n";
import { CardPreviewProvider } from "./components/CardPreview";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-ext-600.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-ext-400.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-ext-600.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-ext-600.css";
import "@fontsource/exo-2/latin-800-italic.css";
import "@fontsource/exo-2/latin-ext-800-italic.css";
import "@fontsource/exo-2/latin-800.css";
import "@fontsource/exo-2/latin-ext-800.css";
import "./styles.css";
import "./marvel-theme.css";
import "./game-theme.css";
import "./i18n/language.css";
import "./match-layout.css";
import "./battlefield-layout.css";
import "./desktop-table.css";
import "./components/MatchControls.css";
import "./equipment-sleeves.css";
import "./match-skin.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <CardPreviewProvider>
        <App />
      </CardPreviewProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
