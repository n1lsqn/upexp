import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

async function handleFileOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Unity Packages', extensions: ['unitypackage'] }],
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
}

// FileNodeインターフェースの定義
interface FileNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

// buildFileTree関数
function buildFileTree(paths: string[]): FileNode {
  const root: FileNode = { name: '', type: 'directory', children: [] }; // 仮想ルート

  paths.forEach(fullPath => {
    const parts = fullPath.split('/');
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let existingNode = currentNode.children?.find(
        (node) => node.name === part && node.type === (i === parts.length - 1 ? 'file' : 'directory'),
      );

      if (!existingNode) {
        existingNode = {
          name: part,
          type: i === parts.length - 1 ? 'file' : 'directory',
          children: i === parts.length - 1 ? undefined : [],
        };
        currentNode.children?.push(existingNode);
        // 子ノードは名前でソートしておく
        currentNode.children?.sort((a, b) => {
            if (a.type === 'directory' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
        });
      }
      currentNode = existingNode;
    }
  });

  return root;
}

async function handleParseUnityPackage(
  _event: Electron.IpcMainInvokeEvent,
  filePath: string,
): Promise<FileNode> {
  return new Promise((resolve, reject) => {
    const assetPaths: string[] = [];
    const stream = fs.createReadStream(filePath);
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();

    extract.on('entry', (header, entryStream, next) => {
      // 'pathname' ファイルのみを対象とする
      if (header.name.endsWith('/pathname')) {
        let content = '';
        entryStream.on('data', (chunk) => {
          content += chunk.toString();
        });
        entryStream.on('end', () => {
          // contentから改行などを除去してクリーンなパスにする
          const assetPath = content.trim();
          if (assetPath) {
            assetPaths.push(assetPath);
          }
          next();
        });
      } else {
        // pathname 以外のファイルはストリームを消費して次に進む
        entryStream.on('end', () => next());
        entryStream.resume();
      }
    });

    extract.on('finish', () => {
      // パスをアルファベット順にソートしてからツリーを構築
      const fileTree = buildFileTree(assetPaths.sort());
      resolve(fileTree);
    });

    extract.on('error', reject);
    gunzip.on('error', reject);
    stream.on('error', reject);

    stream.pipe(gunzip).pipe(extract);
  });
}

async function handleOpenOutputDirectory() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'], // ディレクトリを選択するプロパティ
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
}

// ヘルパー関数: パスが選択されたパスのリストに含まれているか、またはその子孫であるかをチェック
function isPathSelected(fullPath: string, selectedPaths: Set<string>): boolean {
  if (selectedPaths.has(fullPath)) {
    return true;
  }
  // 選択されたパスのいずれかがこのパスの親ディレクトリであるかチェック
  for (const selectedPath of selectedPaths) {
    if (fullPath.startsWith(selectedPath + '/') && selectedPath !== fullPath) {
      return true;
    }
  }
  return false;
}

// 実際の解凍ロジックは後で実装
async function handleExtractFiles(
  _event: Electron.IpcMainInvokeEvent,
  unityPackagePath: string,
  selectedPathsArray: string[],
  outputPath: string,
) {
  return new Promise<void>((resolve, reject) => {
    const selectedPaths = new Set(selectedPathsArray);

    const stream = fs.createReadStream(unityPackagePath);
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();

    const assetDataMap = new Map<string, { header: tar.Headers; data?: Buffer; actualPath?: string }>();
    const pathnameContents = new Map<string, string>();

    extract.on('entry', async (header, entryStream, next) => {
      const guidMatch = header.name.match(/^([0-9a-fA-F]{32})\//);
      const guid = guidMatch ? guidMatch[1] : null;

      if (!guid) {
        entryStream.on('end', () => next());
        entryStream.resume();
        return;
      }

      if (header.name.endsWith('/pathname')) {
        let content = '';
        entryStream.on('data', (chunk) => (content += chunk.toString()));
        entryStream.on('end', () => {
          pathnameContents.set(guid, content.trim());
          next();
        });
      } else if (header.name.endsWith('/asset')) {
        const chunks: Buffer[] = [];
        entryStream.on('data', (chunk) => chunks.push(chunk));
        entryStream.on('end', () => {
          assetDataMap.set(guid, {
            header: header,
            data: Buffer.concat(chunks),
            actualPath: undefined,
          });
          next();
        });
      } else {
        entryStream.on('end', () => next());
        entryStream.resume();
      }
    });

    extract.on('finish', async () => {
      for (const [guid, entry] of assetDataMap) {
        if (pathnameContents.has(guid)) {
          entry.actualPath = pathnameContents.get(guid)!;
        }
      }

      const extractPromises: Promise<void>[] = [];

      for (const [guid, entry] of assetDataMap) {
        const fullActualPath = entry.actualPath;
        if (!fullActualPath || !entry.data) continue;

        if (isPathSelected(fullActualPath, selectedPaths)) {
          extractPromises.push(new Promise<void>((resolveEntry, rejectEntry) => {
            const outputFilePath = path.join(outputPath, fullActualPath);
            const outputDirPath = path.dirname(outputFilePath);

            fs.mkdir(outputDirPath, { recursive: true }, (err) => {
              if (err) return rejectEntry(err);
              fs.writeFile(outputFilePath, entry.data!, (err) => {
                if (err) return rejectEntry(err);
                resolveEntry();
              });
            });
          }));
        }
      }

      try {
        await Promise.all(extractPromises);
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    extract.on('error', reject);
    gunzip.on('error', reject);
    stream.on('error', reject);

    stream.pipe(gunzip).pipe(extract);
  });
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  ipcMain.handle('dialog:openFile', handleFileOpen);
  ipcMain.handle('unitypackage:parse', handleParseUnityPackage);
  ipcMain.handle('dialog:openDirectory', handleOpenOutputDirectory);
  ipcMain.handle('unitypackage:extract', handleExtractFiles);
  ipcMain.handle('path:dirname', (_event, filePath: string) => {
    return path.dirname(filePath);
  });
  
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
