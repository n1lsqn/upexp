import React, { useState } from 'react';

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

const FileOrFolderIcon: React.FC<{ type: 'file' | 'directory' }> = ({ type }) => {
  return <span className="mr-2 w-4">{type === 'directory' ? '📁' : '📄'}</span>;
};

const TreeNode: React.FC<{ node: FileNode }> = ({ node }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isDirectory = node.type === 'directory';

  const handleToggle = () => {
    if (isDirectory) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className="my-1 text-sm">
      <div
        onClick={handleToggle}
        className={`flex items-center rounded-md p-1 ${ isDirectory ? 'cursor-pointer hover:bg-gray-700' : ''}`}
      >
        <FileOrFolderIcon type={node.type} />
        <span>{node.name}</span>
      </div>
      {isDirectory && isOpen && node.children && (
        <div className="pl-5 border-l border-gray-600">
          <FileTree nodes={node.children} />
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC<{ nodes: FileNode[] }> = ({ nodes }) => {
  return (
    <div>
      {nodes.map((node, index) => (
        <TreeNode key={`${node.name}-${index}`} node={node} />
      ))}
    </div>
  );
};

export default FileTree;
