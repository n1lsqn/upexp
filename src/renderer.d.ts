export interface IElectronAPI {
  openFile: () => Promise<string | null>;
  parseUnityPackage: (filePath: string) => Promise<FileNode>;
  openDirectory: () => Promise<string | null>;
  extractFiles: (unityPackagePath: string, selectedPaths: string[], outputPath: string) => Promise<void>;
  getDirectoryPath: (filePath: string) => Promise<string | null>;
}

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
