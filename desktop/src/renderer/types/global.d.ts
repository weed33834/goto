import type { GotoAPI } from '../lib/webAPI';

declare global {
  interface Window {
    gotoAPI: GotoAPI;
  }
}

export {};
