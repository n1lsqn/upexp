import React, { useState } from 'react';
import FileTree from './components/FileTree';
import type { FileNode } from './components/FileTree';

function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<FileNode | null>(null);

  const handleSelectFile = async () => {
    const path = await window.electronAPI.openFile();
    setFilePath(path);
    if (path) {
      console.log('Selected file:', path);
      const result = await window.electronAPI.parseUnityPackage(path);
      setParsedData(result);
      console.log('Parsed data:', result);
    }
  };

  return (
    <div className="flex h-screen bg-gray-800 text-white">
      {/* Sidebar for File Tree */}
      <div className="w-1/3 border-r border-gray-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Package Contents</h2>
        {parsedData && parsedData.children ? (
          <FileTree nodes={parsedData.children} />
        ) : (
          <p className="text-gray-400">Upload a file to see its contents.</p>
        )}
      </div>

      {/* Main Content Area */}
      <div className="w-2/3 p-4 flex flex-col">
        <div className="flex items-center justify-center w-full h-full border-2 border-dashed border-gray-600 rounded-lg">
          <div className="text-center">
            <p className="mb-2">Drag & Drop a .unitypackage file here</p>
            <p className="text-sm text-gray-400">or</p>
            <button onClick={handleSelectFile} className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">
              Select a File
            </button>
            {filePath && (
              <p className="mt-4 text-green-400">Selected: {filePath}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
