import React, { useState, useEffect } from 'react';
import FileTree from './components/FileTree';
import type { FileNode } from './components/FileTree';

// ヘルパー関数: あるノードとそのすべての子孫のフルパスを取得する
const getAllDescendantPaths = (
  node: FileNode,
  currentFullPath: string,
  paths: Set<string>,
) => {
  if (node.type === 'file') {
    paths.add(currentFullPath);
    return;
  }
  // ディレクトリの場合
  paths.add(currentFullPath); // フォルダ自体も選択パスに含める
  node.children?.forEach((child) => {
    getAllDescendantPaths(
      child,
      `${currentFullPath}/${child.name}`,
      paths,
    );
  });
};


function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<FileNode | null>(null);
  const [outputDirectory, setOutputDirectory] = useState<string | null>(null);
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());

  // parsedDataが変更されたらcheckedPathsをリセット
  useEffect(() => {
    setCheckedPaths(new Set());
  }, [parsedData]);

  // ファイルパスを受け取って解析する共通ロジック
  const processFile = async (filePath: string) => { // グローバルな 'path' モジュールが利用可能な場合にシャドウイングを避けるため、'path' を 'filePath' に名前変更
    setFilePath(filePath);
    if (filePath) {
      console.log('Processing file:', filePath);
      try {
        const dir = await window.electronAPI.getDirectoryPath(filePath);
        if (dir) {
          setOutputDirectory(dir);
        }
        const result = await window.electronAPI.parseUnityPackage(filePath);
        setParsedData(result);
        console.log('Parsed data:', result);
      } catch (error) {
        alert(`Failed to parse package: ${error}`);
        console.error('Failed to parse package:', error);
      }
    }
  };

  const handleSelectFile = async () => {
    const path = await window.electronAPI.openFile();
    if (path) {
      await processFile(path);
    }
  };

  const handleOpenOutputDirectory = async () => {
    const dirPath = await window.electronAPI.openDirectory();
    setOutputDirectory(dirPath);
  };

  const handleCheckChange = (fullPath: string, isChecked: boolean, node: FileNode) => {
    setCheckedPaths((prev) => {
      const newSet = new Set(prev);
      if (isChecked) {
        newSet.add(fullPath);
      } else {
        newSet.delete(fullPath);
      }
      if (node.type === 'directory') {
        const descendantPaths = new Set<string>();
        getAllDescendantPaths(node, fullPath, descendantPaths);
        descendantPaths.forEach((descendantPath) => {
          if (isChecked) {
            newSet.add(descendantPath);
          } else {
            newSet.delete(descendantPath);
          }
        });
      }
      return newSet;
    });
  };

  const handleExtractSelected = async () => {
    if (!outputDirectory || !filePath || checkedPaths.size === 0) {
      alert('Please select a package, an output directory, and at least one file/folder to extract.');
      return;
    }
    try {
      await window.electronAPI.extractFiles(filePath, Array.from(checkedPaths), outputDirectory);
      alert('Selected files extracted successfully!');
    } catch (error) {
      alert(`Extraction failed: ${error}`);
      console.error('Extraction failed:', error);
    }
  };

  return (
    <div className="flex h-screen bg-violet-950 text-white">
      {/* ファイルツリーのサイドバー */}
      <div className="w-1/3 border-r border-gray-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Package Contents</h2>
        {parsedData && parsedData.children ? (
          <FileTree nodes={parsedData.children} checkedPaths={checkedPaths} onCheckChange={handleCheckChange} />
        ) : (
          <p className="text-gray-400">Upload a file to see its contents.</p>
        )}
      </div>

      {/* メインコンテンツエリア */}
      <div className="w-2/3 p-4 flex flex-col">
        <div className="flex-grow flex items-center justify-center w-full h-full">
          <div className="text-center">
            <button onClick={handleSelectFile} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">
              Select a File
            </button>
            {filePath && (
              <div className="mt-4 flex flex-col items-center">
                <p className="text-green-400">Selected:</p>
                <p className="mt-1 text-sm text-green-300 max-w-full truncate" title={filePath}>
                  {filePath}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 出力ディレクトリと展開ボタン */}
        <div className="mt-4 p-4 border-t border-gray-700">
          <h3 className="text-lg font-bold mb-2">Extraction Options</h3>
          <div className="flex items-center space-x-2">
            <button onClick={handleOpenOutputDirectory} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md font-semibold">
              Select Output Directory...
            </button>
            <span className="text-sm">
              {outputDirectory ? `Output: ${outputDirectory}` : 'No directory selected'}
            </span>
          </div>
          <button
            onClick={handleExtractSelected}
            className="mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-md font-bold w-full"
            disabled={!outputDirectory || !filePath || checkedPaths.size === 0}
          >
            Extract Selected Files
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
