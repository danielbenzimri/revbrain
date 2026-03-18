/**
 * Documents View Component
 *
 * Project documents management matching legacy "אסמכתאות" layout with:
 * - Predefined folder structure for project documents
 * - File upload with drag & drop
 * - Search functionality
 * - Context menu for file operations
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  FileImage,
  FileCode,
  FileText,
  Search,
  Trash2,
  Download,
  ChevronRight,
  ChevronDown,
  Folder,
  Upload,
  Plus,
  Loader2,
  File,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useProjectFiles,
  useUploadFile,
  useDeleteFile,
  type ProjectFile,
} from '../hooks/use-project-files';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface DocumentsViewProps {
  projectId: string;
}

interface FolderNode {
  id: string;
  nameKey: string;
  children?: FolderNode[];
}

// ============================================================================
// FOLDER STRUCTURE
// ============================================================================

// Predefined folder structure matching legacy "אסמכתאות"
const FOLDER_STRUCTURE: FolderNode[] = [
  { id: 'contracts', nameKey: 'contracts' },
  { id: 'technical_specs', nameKey: 'technicalSpecs' },
  { id: 'general_spec', nameKey: 'generalSpec' },
  { id: 'catalogs', nameKey: 'catalogs' },
  { id: 'price_lists', nameKey: 'priceLists' },
  { id: 'planner_guidelines', nameKey: 'plannerGuidelines' },
  { id: 'field_photos', nameKey: 'fieldPhotos' },
  { id: 'delivery_certs', nameKey: 'deliveryCerts' },
  { id: 'guarantees', nameKey: 'guarantees' },
  { id: 'quantity_calcs', nameKey: 'quantityCalcs' },
];

// Flatten folder structure for easy lookup
const getAllFolders = (): { id: string; nameKey: string }[] => {
  const folders: { id: string; nameKey: string }[] = [];
  const traverse = (nodes: FolderNode[]) => {
    nodes.forEach((node) => {
      folders.push({ id: node.id, nameKey: node.nameKey });
      if (node.children) traverse(node.children);
    });
  };
  traverse(FOLDER_STRUCTURE);
  return folders;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function DocumentsView({ projectId }: DocumentsViewProps) {
  const { t, i18n } = useTranslation('docs');
  const isRTL = i18n.language === 'he';

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(FOLDER_STRUCTURE.map((f) => f.id))
  );
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileId: string } | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [uploadTargetFolder, setUploadTargetFolder] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const { data: filesData, isLoading } = useProjectFiles(projectId);
  const uploadFile = useUploadFile();
  const deleteFile = useDeleteFile();

  const files = useMemo(() => filesData?.files || [], [filesData?.files]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle folder expansion
  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, fileId });
  };

  // File icon based on type
  const getFileIcon = (type: string | null) => {
    switch (type?.toLowerCase()) {
      case 'dxf':
      case 'dwg':
      case 'dwf':
        return <FileCode size={16} className="text-purple-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        return <FileImage size={16} className="text-green-500" />;
      case 'pdf':
        return <FileText size={16} className="text-red-500" />;
      case 'doc':
      case 'docx':
        return <FileText size={16} className="text-blue-500" />;
      case 'xls':
      case 'xlsx':
        return <FileText size={16} className="text-green-600" />;
      default:
        return <File size={16} className="text-slate-400" />;
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Group files by folder
  const fileTree = useMemo(() => {
    const tree: Record<string, ProjectFile[]> = { uncategorized: [] };

    // Initialize structure
    const initStructure = (nodes: FolderNode[]) => {
      nodes.forEach((node) => {
        tree[node.id] = [];
        if (node.children) initStructure(node.children);
      });
    };
    initStructure(FOLDER_STRUCTURE);

    // Distribute files
    files.forEach((file) => {
      if (searchTerm && !file.fileName.toLowerCase().includes(searchTerm.toLowerCase())) return;

      const folder = file.folderPath?.replace(/^\//, '') || 'uncategorized';
      if (tree[folder]) {
        tree[folder].push(file);
      } else {
        tree['uncategorized'].push(file);
      }
    });

    return tree;
  }, [files, searchTerm]);

  // File upload handler
  const handleFileUpload = useCallback(
    async (uploadFiles: FileList, targetFolder: string) => {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        try {
          await uploadFile.mutateAsync({
            projectId,
            file,
            folderPath: `/${targetFolder}`,
          });
          toast.success(t('toast.uploaded'));
        } catch {
          toast.error(t('toast.uploadError'));
        }
      }
    },
    [projectId, uploadFile, t]
  );

  // Delete file handler
  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      if (!window.confirm(t('deleteConfirm'))) return;
      try {
        await deleteFile.mutateAsync({ fileId, projectId });
        toast.success(t('toast.deleted'));
      } catch {
        toast.error(t('toast.deleteError'));
      }
    },
    [deleteFile, projectId, t]
  );

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetFolder: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        handleFileUpload(droppedFiles, targetFolder);
      }
    },
    [handleFileUpload]
  );

  // Trigger file input for folder
  const handleUploadToFolder = (folderId: string) => {
    setUploadTargetFolder(folderId);
    fileInputRef.current?.click();
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0 && uploadTargetFolder) {
      handleFileUpload(selectedFiles, uploadTargetFolder);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadTargetFolder(null);
  };

  // Render a single file
  const renderFile = (file: ProjectFile) => {
    return (
      <div
        key={file.id}
        onContextMenu={(e) => handleContextMenu(e, file.id)}
        className={`group flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all ${isRTL ? 'mr-4 border-r-2' : 'ml-4 border-l-2'} hover:bg-slate-50 border-transparent`}
      >
        <div className="min-w-[20px] flex justify-center">{getFileIcon(file.fileType)}</div>

        <div className="flex-1 min-w-0">
          <div className="text-xs truncate text-slate-700">{file.fileName}</div>
          <div className="text-[10px] text-slate-400">{formatSize(file.fileSizeBytes)}</div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Download file
            }}
            className="p-1 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded transition-all"
            title={t('download')}
          >
            <Download size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteFile(file.id);
            }}
            className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-all"
            title={t('delete')}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  };

  // Render a folder
  const renderFolder = (folder: FolderNode, level = 0) => {
    const folderFiles = fileTree[folder.id] || [];
    const isExpanded = expandedFolders.has(folder.id);
    const hasSubfolders = folder.children && folder.children.length > 0;

    return (
      <div
        key={folder.id}
        className="select-none"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, folder.id)}
      >
        <div
          onClick={() => toggleFolder(folder.id)}
          className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded cursor-pointer text-slate-700 group"
          style={{ paddingInlineStart: `${level * 12 + 8}px` }}
        >
          <div className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown size={14} className="text-slate-400" />
            ) : (
              <ChevronRight size={14} className="text-slate-400" />
            )}
            <Folder size={16} className="text-amber-400 fill-amber-100" />
            <span className="text-sm font-medium">{t(`folders.${folder.nameKey}`)}</span>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 rounded-full">
              {folderFiles.length}
            </span>
          </div>

          {/* Upload Button for Folder */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleUploadToFolder(folder.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-50 text-blue-500 rounded transition-all"
            title={t('uploadToFolder')}
          >
            <Upload size={14} />
          </button>
        </div>

        {isExpanded && (
          <div>
            {hasSubfolders && folder.children?.map((child) => renderFolder(child, level + 1))}
            {folderFiles.length > 0 ? (
              folderFiles.map(renderFile)
            ) : (
              <div
                className={`text-xs text-slate-400 py-2 ${isRTL ? 'pr-8' : 'pl-8'}`}
                style={{ paddingInlineStart: `${level * 12 + 32}px` }}
              >
                {t('emptyFolder')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <FolderOpen size={20} className="text-amber-500" />
            <h2 className="text-lg font-bold text-slate-800">{t('title')}</h2>
          </div>
          <Button
            size="sm"
            onClick={() => handleUploadToFolder('uncategorized')}
            disabled={uploadFile.isPending}
          >
            <Plus size={16} className={isRTL ? 'ml-2' : 'mr-2'} />
            {uploadFile.isPending ? t('uploading') : t('uploadFile')}
          </Button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search
              size={14}
              className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`}
            />
            <input
              type="text"
              placeholder={t('searchFiles')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
            />
          </div>
        </div>

        {/* File Tree */}
        <div
          className={`flex-1 overflow-y-auto p-2 ${isDragging ? 'bg-blue-50 border-2 border-dashed border-blue-300' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'uncategorized')}
        >
          {files.length === 0 && !searchTerm ? (
            <div className="text-center py-16 text-slate-400">
              <FolderOpen size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">{t('noFiles')}</p>
              <p className="text-sm">{t('dragHint')}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {FOLDER_STRUCTURE.map((folder) => renderFolder(folder))}

              {/* Uncategorized Files */}
              {fileTree['uncategorized']?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="px-2 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t('additionalFiles')}
                  </div>
                  {fileTree['uncategorized'].map(renderFile)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-slate-200 z-[9999] w-48 py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 250),
            left: window.innerWidth - contextMenu.x < 200 ? contextMenu.x - 192 : contextMenu.x,
          }}
        >
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-500 bg-slate-50">
            {t('moveToFolder')}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {getAllFolders().map((folder) => (
              <button
                key={folder.id}
                onClick={() => {
                  // TODO: Move file to folder
                  setContextMenu(null);
                }}
                className={`w-full px-3 py-1.5 text-xs hover:bg-blue-50 text-slate-700 flex items-center gap-2 ${isRTL ? 'text-right' : 'text-left'}`}
              >
                <Folder size={12} className="text-amber-400" />
                {t(`folders.${folder.nameKey}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
