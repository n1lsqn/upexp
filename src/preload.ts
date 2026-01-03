import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  parseUnityPackage: (filePath: string) => ipcRenderer.invoke('unitypackage:parse', filePath),
});