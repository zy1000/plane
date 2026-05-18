import { useCallback, useEffect, useMemo, useState } from "react";
import { message } from "antd";
import type {
  TAssetExplorerFile,
  TAssetFolder,
  TFolderStatsResponse,
} from "@/services/asset-explorer.service";
import { AssetExplorerService } from "@/services/asset-explorer.service";
import type { TAssetExplorerProps, TExplorerRow, TMoveConflictItem } from "./types";

type TUseAssetExplorer = TAssetExplorerProps;

const rowAssetId = (row: TExplorerRow): string | null => (row.kind === "file" ? row.file.id : null);
const rowFolderId = (row: TExplorerRow): number | null => (row.kind === "folder" ? row.folder.id : null);

export const useAssetExplorer = (props: TUseAssetExplorer) => {
  const { workspaceSlug, projectId, onEdit, onPreview } = props;
  const service = useMemo(() => new AssetExplorerService(), []);

  const [rootFolder, setRootFolder] = useState<TAssetFolder | null>(null);
  const [currentFolder, setCurrentFolder] = useState<TAssetFolder | null>(null);
  const [folders, setFolders] = useState<TAssetFolder[]>([]);
  const [files, setFiles] = useState<TAssetExplorerFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<TAssetFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");

  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(() => new Set());

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<TAssetFolder | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"copy" | "move">("copy");

  const [moveConflicts, setMoveConflicts] = useState<TMoveConflictItem[]>([]);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingMoveTargetFolderId, setPendingMoveTargetFolderId] = useState<number | null>(null);

  const [folderStats, setFolderStats] = useState<TFolderStatsResponse | null>(null);
  const [folderStatsLoading, setFolderStatsLoading] = useState(false);

  const rows = useMemo<TExplorerRow[]>(
    () => [
      ...folders.map((folder) => ({ key: `folder-${folder.id}`, kind: "folder" as const, folder })),
      ...files.map((file) => ({ key: `file-${file.id}`, kind: "file" as const, file })),
    ],
    [folders, files]
  );

  const selectedCount = selectedAssetIds.size + selectedFolderIds.size;
  const selectedAssetIdsArray = useMemo(() => Array.from(selectedAssetIds), [selectedAssetIds]);
  const selectedFolderIdsArray = useMemo(() => Array.from(selectedFolderIds), [selectedFolderIds]);

  const clearSelection = useCallback(() => {
    setSelectedAssetIds(new Set());
    setSelectedFolderIds(new Set());
  }, []);

  const isRowSelected = useCallback(
    (row: TExplorerRow) => {
      if (row.kind === "file") return selectedAssetIds.has(row.file.id);
      return selectedFolderIds.has(row.folder.id);
    },
    [selectedAssetIds, selectedFolderIds]
  );

  const toggleRow = useCallback((row: TExplorerRow) => {
    if (row.kind === "file") {
      const id = row.file.id;
      setSelectedAssetIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      const id = row.folder.id;
      setSelectedFolderIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  }, []);

  const toggleAllRows = useCallback((allRows: TExplorerRow[]) => {
    const allAssetIds = allRows.map(rowAssetId).filter((v): v is string => !!v);
    const allFolderIds = allRows.map(rowFolderId).filter((v): v is number => v !== null);
    setSelectedAssetIds((prev) => {
      const allSelected = allAssetIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allAssetIds);
    });
    setSelectedFolderIds((prev) => {
      const allSelected = allFolderIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allFolderIds);
    });
  }, []);

  const loadBreadcrumb = useCallback(
    async (folderId: number) => {
      try {
        const res = await service.getBreadcrumb(workspaceSlug, projectId, folderId);
        setBreadcrumbs(Array.isArray(res?.breadcrumbs) ? res.breadcrumbs : []);
      } catch {
        setBreadcrumbs([]);
      }
    },
    [projectId, service, workspaceSlug]
  );

  /**
   * Folder summary stats (recursive size + direct/recursive counts).
   * Fired async after the folder list resolves so the table stays snappy.
   */
  const loadFolderStats = useCallback(
    async (folderId: number) => {
      if (!workspaceSlug || !projectId || !folderId) return;
      setFolderStatsLoading(true);
      try {
        const stats = await service.getFolderStats(workspaceSlug, projectId, folderId);
        setFolderStats(stats ?? null);
      } catch {
        setFolderStats(null);
      } finally {
        setFolderStatsLoading(false);
      }
    },
    [projectId, service, workspaceSlug]
  );

  const loadFolder = useCallback(
    async ({
      folderId,
      page,
      size,
      search,
    }: {
      folderId: number;
      page: number;
      size: number;
      search?: string;
    }) => {
      if (!workspaceSlug || !projectId) return;
      setLoading(true);
      try {
        const res = await service.listFolder(workspaceSlug, projectId, {
          folder_id: folderId,
          page,
          page_size: size,
          ...(search ? { name__icontains: search } : {}),
        });
        setCurrentFolder(res?.current_folder ?? null);
        setFolders(Array.isArray(res?.folders) ? res.folders : []);
        setFiles(Array.isArray(res?.files?.data) ? res.files.data : []);
        setTotal(Number(res?.files?.count ?? 0));
        setCurrentPage(page);
        setPageSize(size);
        clearSelection();
        if (res?.current_folder?.id) {
          await loadBreadcrumb(res.current_folder.id);
          void loadFolderStats(res.current_folder.id);
        }
      } catch (error: any) {
        message.error(error?.detail || error?.error || error?.message || "加载文件列表失败");
      } finally {
        setLoading(false);
      }
    },
    [clearSelection, loadBreadcrumb, loadFolderStats, projectId, service, workspaceSlug]
  );

  const initialize = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setLoading(true);
    try {
      const rootRes = await service.ensureRoot(workspaceSlug, projectId);
      const root = rootRes?.root_folder ?? null;
      if (!root?.id) {
        message.error("初始化文件目录失败");
        return;
      }
      setRootFolder(root);
      await loadFolder({ folderId: root.id, page: 1, size: pageSize, search: keyword });
    } catch (error: any) {
      message.error(error?.detail || error?.error || error?.message || "初始化文件目录失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, loadFolder, pageSize, projectId, service, workspaceSlug]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const refresh = useCallback(async () => {
    const folderId = currentFolder?.id ?? rootFolder?.id;
    if (!folderId) return;
    await loadFolder({ folderId, page: currentPage, size: pageSize, search: keyword });
  }, [currentFolder?.id, currentPage, keyword, loadFolder, pageSize, rootFolder?.id]);

  const navigateFolder = useCallback(
    async (folderId: number) => {
      await loadFolder({ folderId, page: 1, size: pageSize, search: keyword });
    },
    [keyword, loadFolder, pageSize]
  );

  const onUploadFiles = useCallback(
    async (uploadFiles: File[]) => {
      if (!currentFolder?.id || uploadFiles.length === 0) return;
      setUploading(true);
      try {
        for (const file of uploadFiles) {
          await service.uploadAsset(workspaceSlug, projectId, currentFolder.id, file);
        }
        message.success(uploadFiles.length > 1 ? `已上传 ${uploadFiles.length} 个文件` : "上传成功");
        await refresh();
      } catch (error: any) {
        message.error(error?.detail || error?.error || error?.message || "上传失败");
      } finally {
        setUploading(false);
      }
    },
    [currentFolder?.id, projectId, refresh, service, workspaceSlug]
  );

  const onCreateFolder = useCallback(
    async (name: string) => {
      if (!currentFolder?.id) return;
      await service.createFolder(workspaceSlug, projectId, currentFolder.id, name);
      setCreateFolderOpen(false);
      await refresh();
    },
    [currentFolder?.id, projectId, refresh, service, workspaceSlug]
  );

  const onRenameFolder = useCallback(
    async (name: string) => {
      if (!renamingFolder?.id) return;
      await service.renameFolder(workspaceSlug, projectId, renamingFolder.id, name);
      setRenameFolderOpen(false);
      setRenamingFolder(null);
      await refresh();
    },
    [projectId, refresh, renamingFolder, service, workspaceSlug]
  );

  const onDeleteFiles = useCallback(
    async (assetIds: string[]) => {
      if (!assetIds.length) return;
      await service.batchDelete(workspaceSlug, projectId, assetIds);
      await refresh();
    },
    [projectId, refresh, service, workspaceSlug]
  );

  const onDeleteFolder = useCallback(
    async (folderId: number) => {
      await service.deleteFolder(workspaceSlug, projectId, folderId);
      await refresh();
    },
    [projectId, refresh, service, workspaceSlug]
  );

  const onDownloadFile = useCallback(
    async (asset: TAssetExplorerFile) => {
      if (!asset?.id) return;
      const url = await service.getAssetPresignedURL(workspaceSlug, projectId, asset.id, "attachment");
      if (!url) {
        message.error("下载失败");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [projectId, service, workspaceSlug]
  );

  const onBatchDownload = useCallback(() => {
    if (selectedCount === 0) return;
    const url = service.getBatchDownloadURL(workspaceSlug, projectId, {
      assetIds: selectedAssetIdsArray,
      folderIds: selectedFolderIdsArray,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }, [projectId, selectedAssetIdsArray, selectedCount, selectedFolderIdsArray, service, workspaceSlug]);

  const onBatchDelete = useCallback(async () => {
    if (selectedFolderIdsArray.length) {
      for (const folderId of selectedFolderIdsArray) {
        await service.deleteFolder(workspaceSlug, projectId, folderId);
      }
    }
    if (selectedAssetIdsArray.length) {
      await service.batchDelete(workspaceSlug, projectId, selectedAssetIdsArray);
    }
    await refresh();
  }, [projectId, refresh, selectedAssetIdsArray, selectedFolderIdsArray, service, workspaceSlug]);

  const openPickerFor = useCallback(
    (mode: "copy" | "move") => {
      if (!selectedAssetIdsArray.length) {
        if (selectedFolderIdsArray.length) {
          message.info("当前版本仅支持文件复制/移动，文件夹请使用重命名或删除");
        } else {
          message.info("请先选择文件");
        }
        return;
      }
      setPickerMode(mode);
      setPickerOpen(true);
    },
    [selectedAssetIdsArray.length, selectedFolderIdsArray.length]
  );

  const submitPicker = useCallback(
    async (targetFolderId: number) => {
      if (!selectedAssetIdsArray.length) {
        setPickerOpen(false);
        return;
      }
      try {
        if (pickerMode === "copy") {
          await service.batchCopy(workspaceSlug, projectId, selectedAssetIdsArray, targetFolderId);
          message.success("复制成功");
        } else {
          const moveResult = await service.batchMove(
            workspaceSlug,
            projectId,
            selectedAssetIdsArray,
            targetFolderId,
            "cancel"
          );
          if (moveResult?.conflicts?.length) {
            setMoveConflicts(moveResult.conflicts);
            setPendingMoveTargetFolderId(targetFolderId);
            setConflictOpen(true);
            setPickerOpen(false);
            return;
          }
          message.success("移动成功");
        }
        setPickerOpen(false);
        await refresh();
      } catch (error: any) {
        if (pickerMode === "move" && Number(error?.status) === 409 && Array.isArray(error?.conflicts)) {
          setMoveConflicts(error.conflicts);
          setPendingMoveTargetFolderId(targetFolderId);
          setConflictOpen(true);
          setPickerOpen(false);
          return;
        }
        message.error(error?.detail || error?.error || error?.message || `${pickerMode === "copy" ? "复制" : "移动"}失败`);
      }
    },
    [pickerMode, projectId, refresh, selectedAssetIdsArray, service, workspaceSlug]
  );

  const resolveMoveConflict = useCallback(
    async (mode: "overwrite" | "rename") => {
      if (!pendingMoveTargetFolderId || !selectedAssetIdsArray.length) {
        setConflictOpen(false);
        return;
      }
      try {
        await service.batchMove(workspaceSlug, projectId, selectedAssetIdsArray, pendingMoveTargetFolderId, mode);
        message.success(mode === "overwrite" ? "已覆盖冲突文件并完成移动" : "已按重命名规则完成移动");
        setConflictOpen(false);
        setPendingMoveTargetFolderId(null);
        setMoveConflicts([]);
        await refresh();
      } catch (error: any) {
        message.error(error?.detail || error?.error || error?.message || "处理冲突失败");
      }
    },
    [pendingMoveTargetFolderId, projectId, refresh, selectedAssetIdsArray, service, workspaceSlug]
  );

  const onOpenRow = useCallback(
    async (row: TExplorerRow) => {
      if (row.kind === "folder") {
        await navigateFolder(row.folder.id);
        return;
      }
      if (onEdit) {
        await onEdit(row.file);
        return;
      }
      if (onPreview) {
        await onPreview(row.file);
      }
    },
    [navigateFolder, onEdit, onPreview]
  );

  return {
    service,
    rootFolder,
    currentFolder,
    rows,
    folders,
    files,
    breadcrumbs,
    folderStats,
    folderStatsLoading,
    loading,
    uploading,
    selectedAssetIds,
    selectedFolderIds,
    selectedAssetIdsArray,
    selectedFolderIdsArray,
    selectedCount,
    currentPage,
    pageSize,
    total,
    keyword,
    setKeyword,
    createFolderOpen,
    setCreateFolderOpen,
    renameFolderOpen,
    setRenameFolderOpen,
    renamingFolder,
    setRenamingFolder,
    pickerOpen,
    setPickerOpen,
    pickerMode,
    conflictOpen,
    setConflictOpen,
    moveConflicts,
    isRowSelected,
    toggleRow,
    toggleAllRows,
    onUploadFiles,
    onCreateFolder,
    onRenameFolder,
    onDeleteFiles,
    onDeleteFolder,
    onDownloadFile,
    onBatchDownload,
    onBatchDelete,
    openPickerFor,
    submitPicker,
    resolveMoveConflict,
    onOpenRow,
    navigateFolder,
    refresh,
    loadFolder,
    initialize,
    setCurrentPage,
    setPageSize,
    clearSelection,
  };
};
