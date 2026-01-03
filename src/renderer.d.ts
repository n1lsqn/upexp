export interface IElectronAPI {
  openFile: () => Promise<string | null>;
  parseUnityPackage: (filePath: string) => Promise<FileNode>;
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
