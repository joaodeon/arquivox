import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import WheelApp from "./WheelApp";
import "./App.css";

const isWheel = new URLSearchParams(window.location.search).get("view") === "wheel";

if (isWheel) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isWheel ? <WheelApp /> : <App />}
  </React.StrictMode>,
);
