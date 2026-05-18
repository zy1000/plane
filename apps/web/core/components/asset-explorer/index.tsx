import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, message } from "antd";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TAssetExplorerFile } from "@/services/asset-explorer.service";
import { BreadcrumbBar } from "./components/breadcrumb-bar";
import { BucketHeader } from "./components/bucket-header";
import { ConflictModal } from "./components/conflict-modal";
import { CreateFolderModal } from "./components/create-folder-modal";
import { DetailsPanel } from "./components/details-panel";
import { DropOverlay } from "./components/drop-overlay";
import { EmptyState } from "./components/empty-state";
import { FolderPickerModal } from "./components/folder-picker-modal";
import { FolderTable } from "./components/folder-table";
import { RenameModal } from "./components/rename-modal";
import { SelectionBar } from "./components/selection-bar";
import { Toolbar } from "./components/toolbar";
import { useAssetExplorer } from "./use-asset-explorer";
import type { TAssetExplorerProps } from "./types";

export const AssetExplorer = (props: TAssetExplorerProps) => {
  const explorer = useAssetExplorer(props);
  const { onEdit, onPreview } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [activeFile, setActiveFile] = useState<TAssetExplorerFile | null>(null);

  useEffect(() => {
    if (!activeFile) return;
    const stillExists = explorer.files.some((f) => f.id === activeFile.id);
    if (!stillExists) setActiveFile(null);
  }, [explorer.files, activeFile]);

  const handleSearch = useCallback(async () => {
    const folderId = explorer.currentFolder?.id ?? explorer.rootFolder?.id;
    if (!folderId) return;
    await explorer.loadFolder({
      folderId,
      page: 1,
      size: explorer.pageSize,
      search: explorer.keyword.trim(),
    });
  }, [explorer]);

  const handlePageChange = useCallback(
    (page: number, size?: number) => {
      const folderId = explorer.currentFolder?.id ?? explorer.rootFolder?.id;
      if (!folderId) return;
      void explorer.loadFolder({
        folderId,
        page,
        size: size || explorer.pageSize,
        search: explorer.keyword.trim(),
      });
    },
    [explorer]
  );

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length > 0) {
      void explorer.onUploadFiles(Array.from(list));
    }
    e.target.value = "";
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!props.permissions.canUpload) return;
    if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
    e.preventDefault();
    dragCounter.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!props.permissions.canUpload) return;
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!props.permissions.canUpload) return;
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!props.permissions.canUpload) return;
    e.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    const list = e.dataTransfer?.files;
    if (list && list.length > 0) {
      void explorer.onUploadFiles(Array.from(list));
    }
  };

  const handlePreviewFile = useCallback(
    async (file: TAssetExplorerFile) => {
      try {
        if (onPreview) await onPreview(file);
      } catch (error: any) {
        message.error(error?.message || "预览失败");
      }
    },
    [onPreview]
  );

  const handleEditFile = useCallback(
    async (file: TAssetExplorerFile) => {
      try {
        if (onEdit) {
          await onEdit(file);
          return;
        }
        if (onPreview) await onPreview(file);
      } catch (error: any) {
        message.error(error?.message || "打开编辑器失败");
      }
    },
    [onEdit, onPreview]
  );

  const handleDeleteFile = useCallback(
    async (assetId: string) => {
      await explorer.onDeleteFiles([assetId]);
      setActiveFile(null);
    },
    [explorer]
  );

  const handleOpenFolder = useCallback(
    (folderId: number) => {
      setActiveFile(null);
      void explorer.navigateFolder(folderId);
    },
    [explorer]
  );

  const totalPages = Math.max(1, Math.ceil(explorer.total / explorer.pageSize));
  const isEmpty = !explorer.loading && explorer.rows.length === 0;
  const searching = explorer.keyword.trim().length > 0;

  /**
   * Header title prefers the current folder name. Falls back to the last
   * breadcrumb (for the brief moment between navigation and folder data
   * arriving), then to a generic placeholder.
   */
  const headerTitle = useMemo(() => {
    const fromCurrent = explorer.currentFolder?.name?.trim();
    if (fromCurrent) return fromCurrent;
    const fromBreadcrumb = explorer.breadcrumbs[explorer.breadcrumbs.length - 1]?.name?.trim();
    if (fromBreadcrumb) return fromBreadcrumb;
    return "filestore";
  }, [explorer.breadcrumbs, explorer.currentFolder?.name]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col overflow-hidden rounded-xl border border-subtle shadow-raised-100"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {props.permissions.canUpload && (
        <input ref={fileInputRef} type="file" multiple hidden onChange={handleInputChange} />
      )}

      {/* Row 1: header = current folder name + recursive size + direct child count */}
      <BucketHeader
        title={headerTitle}
        directFolderCount={explorer.folderStats?.direct_folder_count ?? explorer.folders.length}
        directFileCount={explorer.folderStats?.direct_file_count ?? explorer.total}
        recursiveSize={explorer.folderStats?.recursive_size ?? 0}
        statsLoading={explorer.folderStatsLoading}
        canUpload={props.permissions.canUpload}
        uploading={explorer.uploading}
        onRefresh={() => void explorer.refresh()}
        onUpload={triggerUpload}
      />

      {/* Row 2: Path bar — slash-separated MinIO path + search + create-folder */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-5 py-2.5">
        <BreadcrumbBar
          breadcrumbs={explorer.breadcrumbs}
          onNavigate={(folderId) => {
            setActiveFile(null);
            void explorer.navigateFolder(folderId);
          }}
        />
        <Toolbar
          permissions={props.permissions}
          keyword={explorer.keyword}
          onKeywordChange={explorer.setKeyword}
          onSearch={() => void handleSearch()}
          onCreateFolder={() => explorer.setCreateFolderOpen(true)}
        />
      </div>

      {/* Body: list (flexible) + details panel (animated width) */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {isEmpty ? (
            <EmptyState
              variant={searching ? "no-results" : "empty"}
              keyword={explorer.keyword.trim()}
              canUpload={props.permissions.canUpload}
              canCreateFolder={props.permissions.canCreateFolder}
              onUpload={triggerUpload}
              onCreateFolder={() => explorer.setCreateFolderOpen(true)}
              onClearSearch={() => {
                explorer.setKeyword("");
                void handleSearch();
              }}
            />
          ) : (
            <FolderTable
              rows={explorer.rows}
              loading={explorer.loading}
              permissions={props.permissions}
              activeFileId={activeFile?.id ?? null}
              isRowSelected={explorer.isRowSelected}
              onToggleRow={explorer.toggleRow}
              onToggleAll={explorer.toggleAllRows}
              onActivateFile={setActiveFile}
              onOpenFolder={handleOpenFolder}
              onRenameFolder={(folder) => {
                explorer.setRenamingFolder(folder);
                explorer.setRenameFolderOpen(true);
              }}
              onDeleteFolder={explorer.onDeleteFolder}
            />
          )}

          <DropOverlay active={dragActive} />

          <SelectionBar
            open={explorer.selectedCount > 0}
            count={explorer.selectedCount}
            canDelete={props.permissions.canDelete}
            onClear={explorer.clearSelection}
            onBatchDownload={explorer.onBatchDownload}
            onBatchCopy={() => explorer.openPickerFor("copy")}
            onBatchMove={() => explorer.openPickerFor("move")}
            onBatchDelete={() => {
              Modal.confirm({
                title: "确认批量删除所选项？",
                content: "该操作不可恢复。",
                okText: "删除",
                cancelText: "取消",
                okButtonProps: { danger: true },
                onOk: () => explorer.onBatchDelete(),
              });
            }}
          />
        </div>

        <DetailsPanel
          file={activeFile}
          permissions={props.permissions}
          hasEditCapability={Boolean(onEdit)}
          onClose={() => setActiveFile(null)}
          onPreviewFile={handlePreviewFile}
          onEditFile={handleEditFile}
          onDownloadFile={explorer.onDownloadFile}
          onDeleteFile={handleDeleteFile}
        />
      </div>

      {/* Footer: pagination only — overall counts now live in BucketHeader */}
      <div className="flex h-10 items-center justify-end gap-1 border-t border-subtle px-5 text-[12px] text-tertiary">
        <button
          type="button"
          disabled={explorer.currentPage <= 1 || explorer.loading}
          onClick={() => handlePageChange(explorer.currentPage - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="px-2 text-[12px] tabular-nums text-secondary">
          <span className="font-medium text-primary">{explorer.currentPage}</span>
          <span className="mx-1 text-tertiary">/</span>
          {totalPages}
        </span>
        <button
          type="button"
          disabled={explorer.currentPage >= totalPages || explorer.loading}
          onClick={() => handlePageChange(explorer.currentPage + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-3.5" />
        </button>
        <select
          value={explorer.pageSize}
          onChange={(e) => handlePageChange(1, Number(e.target.value))}
          className="ml-2 h-7 cursor-pointer rounded-md border border-subtle bg-layer-1 px-1.5 text-[12px] text-secondary transition hover:border-strong focus:outline-none"
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>

      {/* Modals */}
      <CreateFolderModal
        open={explorer.createFolderOpen}
        onCancel={() => explorer.setCreateFolderOpen(false)}
        onSubmit={async (name) => {
          try {
            await explorer.onCreateFolder(name);
            message.success("文件夹创建成功");
          } catch (error: any) {
            message.error(error?.detail || error?.error || error?.message || "创建失败");
          }
        }}
      />

      <RenameModal
        open={explorer.renameFolderOpen}
        folder={explorer.renamingFolder}
        onCancel={() => {
          explorer.setRenameFolderOpen(false);
          explorer.setRenamingFolder(null);
        }}
        onSubmit={async (name) => {
          try {
            await explorer.onRenameFolder(name);
            message.success("重命名成功");
          } catch (error: any) {
            message.error(error?.detail || error?.error || error?.message || "重命名失败");
          }
        }}
      />

      <FolderPickerModal
        open={explorer.pickerOpen}
        title={explorer.pickerMode === "copy" ? "选择复制目标文件夹" : "选择移动目标文件夹"}
        workspaceSlug={props.workspaceSlug}
        projectId={props.projectId}
        service={explorer.service}
        onCancel={() => explorer.setPickerOpen(false)}
        onConfirm={(targetFolderId) => explorer.submitPicker(targetFolderId)}
      />

      <ConflictModal
        open={explorer.conflictOpen}
        conflicts={explorer.moveConflicts}
        onCancel={() => explorer.setConflictOpen(false)}
        onRename={() => void explorer.resolveMoveConflict("rename")}
        onOverwrite={() => void explorer.resolveMoveConflict("overwrite")}
      />
    </div>
  );
};
