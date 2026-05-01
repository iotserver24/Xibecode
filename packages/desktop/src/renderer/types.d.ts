import type { XibeCodeAPI } from '../preload/index';

declare global {
  interface Window {
    xibecode: XibeCodeAPI;
  }
}

export {};
