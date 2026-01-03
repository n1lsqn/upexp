import React, { useState, useEffect, useRef, useMemo } from 'react';

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

// ヘルパー関数: あるノードの子孫のチェック状態を計算
// 戻り値: { allChecked: boolean, noneChecked: boolean }
const calculateCheckState = (node: FileNode, checkedPaths: Set<string>, currentFullPath: string): { allChecked: boolean, noneChecked: boolean } => {
  if (node.type === 'file') {
    return { allChecked: checkedPaths.has(currentFullPath), noneChecked: !checkedPaths.has(currentFullPath) };
  }

  // ディレクトリの場合
  // 自身がチェックされているか
  const selfChecked = checkedPaths.has(currentFullPath);

  if (!node.children || node.children.length === 0) {
    // 子がないディレクトリは自身のチェック状態のみ
    return { allChecked: selfChecked, noneChecked: !selfChecked };
  }

  let allChildrenChecked = true;
  let allChildrenUnchecked = true;

  for (const child of node.children) {
    const childFullPath = `${currentFullPath}/${child.name}`;
    const childState = calculateCheckState(child, checkedPaths, childFullPath);

    if (!childState.allChecked) {
      allChildrenChecked = false;
    }
    if (!childState.noneChecked) {
      allChildrenUnchecked = false;
    }
    // 両方falseになったらこれ以上計算する必要はない
    if (!allChildrenChecked && !allChildrenUnchecked) break;
  }

  return {
    allChecked: allChildrenChecked && selfChecked,
    noneChecked: allChildrenUnchecked && !selfChecked,
  };
};

const FileOrFolderIcon: React.FC<{ type: 'file' | 'directory' }> = ({ type }) => {
  return <span className="mr-2 w-4">{type === 'directory' ? '📁' : '📄'}</span>;
};

const TreeNode: React.FC<{
  node: FileNode;
  fullPath: string;
  checkedPaths: Set<string>;
  onCheckChange: (fullPath: string, isChecked: boolean, node: FileNode) => void;
}> = ({ node, fullPath, checkedPaths, onCheckChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isDirectory = node.type === 'directory';

  const checkboxRef = useRef<HTMLInputElement>(null);

  // 子孫のチェック状態を計算
  const { allChecked, noneChecked } = useMemo(() => {
    return calculateCheckState(node, checkedPaths, fullPath);
  }, [node, checkedPaths, fullPath]);

  // indeterminate状態をDOMに直接設定
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = !allChecked && !noneChecked;
      checkboxRef.current.checked = allChecked;
    }
  }, [allChecked, noneChecked]);


  const handleToggle = () => {
    if (isDirectory) {
      setIsOpen(!isOpen);
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckChange(fullPath, e.target.checked, node);
  };

  return (
    <div className="my-1 text-sm">
      <div
        className={`flex items-center rounded-md p-1 ${ isDirectory ? 'hover:bg-gray-700' : ''}`}
      >
        <input
          type="checkbox"
          className="mr-2"
          ref={checkboxRef} // refを設定
          onChange={handleCheckboxChange} // 変更ハンドラを設定
        />
        <span onClick={handleToggle} className={`flex items-center ${isDirectory ? 'cursor-pointer' : ''}`}>
          <FileOrFolderIcon type={node.type} />
          <span>{node.name}</span>
        </span>
      </div>
      {isDirectory && isOpen && node.children && (
        <div className="pl-5 border-l border-gray-600">
          <FileTree
            nodes={node.children}
            checkedPaths={checkedPaths}
            onCheckChange={onCheckChange}
            parentPath={fullPath}
          />
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC<{
  nodes: FileNode[];
  checkedPaths: Set<string>;
  onCheckChange: (fullPath: string, isChecked: boolean, node: FileNode) => void;
  parentPath?: string;
}> = ({ nodes, checkedPaths, onCheckChange, parentPath = '' }) => {
  return (
    <div>
      {nodes.map((node, index) => (
        <TreeNode
          key={`${node.name}-${index}`}
          node={node}
          fullPath={parentPath ? `${parentPath}/${node.name}` : node.name}
          checkedPaths={checkedPaths}
          onCheckChange={onCheckChange}
        />
      ))}
    </div>
  );
};

export default FileTree;