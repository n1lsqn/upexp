export interface IElectronAPI {
  openFile: () => Promise<string | null>;
  parseUnityPackage: (filePath: string) => Promise<any>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
