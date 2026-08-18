export interface UpdaterMessage {
  status: 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
  text: string;
  version?: string;
}

interface ElectronAPI {
  onUpdaterMessage: (callback: (data: UpdaterMessage) => void) => () => void;
  onUpdaterProgress: (callback: (percent: number) => void) => () => void;
  restartAndInstall: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
