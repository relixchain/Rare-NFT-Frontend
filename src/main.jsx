// src/main.jsx

import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/globals.css";
import { Providers } from "./app/providers";
import App from "./app/App.jsx";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error('Root element "#root" was not found. Check your index.html.');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>
);
