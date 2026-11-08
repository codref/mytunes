/**
 * Ambient types for Quasar + mytunes.
 */
interface ImportMetaEnv {}

import type { MytunesApi } from './src/models/api';

declare global {
  interface Window {
    mytunes?: MytunesApi;
  }
}

export {};
