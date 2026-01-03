import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  parseUnityPackage: (filePath: string) => ipcRenderer.invoke('unitypackage:parse', filePath),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  extractFiles: (unityPackagePath: string, selectedPaths: string[], outputPath: string) =>
    ipcRenderer.invoke('unitypackage:extract', unityPackagePath, selectedPaths, outputPath),
  getDirectoryPath: (filePath: string) => ipcRenderer.invoke('path:dirname', filePath),
});
