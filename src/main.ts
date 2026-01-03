import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import started from 'electron-squirrel-startup';

// Windowsでのインストール/アンインストール時にショートカットを作成/削除するのを処理します。
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
          const actualPath = pathnameContents.get(guid);
          if (actualPath) {
            entry.actualPath = actualPath;
          }
        }
      }

      const extractPromises: Promise<void>[] = [];

      for (const entry of assetDataMap.values()) {
        const fullActualPath = entry.actualPath;
        if (!fullActualPath || !entry.data) continue;

        if (isPathSelected(fullActualPath, selectedPaths)) {
          extractPromises.push(new Promise<void>((resolveEntry, rejectEntry) => {
            const outputFilePath = path.join(outputPath, fullActualPath);
            const outputDirPath = path.dirname(outputFilePath);

            fs.mkdir(outputDirPath, { recursive: true }, (err) => {
              if (err) return rejectEntry(err);
              if (entry.data) {
                fs.writeFile(outputFilePath, entry.data, (err) => {
                  if (err) return rejectEntry(err);
                  resolveEntry();
                });
              } else {
                // entry.data が存在しない場合、何もしないか、エラーを報告することができます。
                // ここでは、単に成功として解決します。
                resolveEntry();
              }
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
  // ブラウザウィンドウを作成します。
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // そして、アプリの index.html をロードします。
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // DevToolsを開きます。
  mainWindow.webContents.openDevTools();
};

// このメソッドは、Electronの初期化が完了し、ブラウザウィンドウを作成する準備ができたときに呼び出されます。
// 一部のAPIは、このイベントが発生した後にのみ使用できます。
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

// すべてのウィンドウが閉じたときに終了します（macOSを除く）。macOSでは、アプリケーションとそのメニューバーは、ユーザーがCmd + Qで明示的に終了するまでアクティブなままになるのが一般的です。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // OS Xでは、ドックアイコンがクリックされ、他のウィンドウが開いていないときに、アプリでウィンドウを再作成するのが一般的です。
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// このファイルには、アプリの残りの特定のメインプロセスコードを含めることができます。
// それらを別のファイルに入れて、ここでインポートすることもできます。
