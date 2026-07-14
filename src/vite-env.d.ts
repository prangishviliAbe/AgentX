/// <reference types="vite/client" />

import type { AgentXApi } from "../electron/preload";

declare global {
  interface Window {
    agentx: AgentXApi;
  }
}

export {};
