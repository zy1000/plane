import { Checkbox, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { Check, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { TAssetExplorerFile, TAssetFolder } from "@/services/asset-explorer.service";
import type { TAssetExplorerPermissions, TExplorerRow } from "../types";
import { formatBytes, formatMinIODate } from "../utils/format";
import { confirmDeleteFolder } from "./confirm-delete";
import { FileTypeIcon, FolderTypeIcon } from "./file-icon";

type TFolderTableProps = {
  rows: TExplorerRow[];
  loading: boolean;
  permissions: TAssetExplorerPermissions;
  activeFileId: string | null;
  isRowSelected: (row: TExplorerRow) => boolean;
  onToggleRow: (row: TExplorerRow) => void;
  onToggleAll: (rows: TExplorerRow[]) => void;
  onActivateFile: (file: TAssetExplorerFile) => void;
  onOpenFolder: (folderId: number) => void;
  onRenameFolder: (folder: TAssetFolder) => void;
  onDeleteFolder: (folderId: number) => void | Promise<void>;
};

const COLS = "32px minmax(0,1fr) 260px 120px 36px";

export const FolderTable = ({
  rows,
  loading,
  permissions,
  activeFileId,
  isRowSelected,
  onToggleRow,
  onToggleAll,
  onActivateFile,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
}: TFolderTableProps) => {
  const allChecked = useMemo(() => rows.length > 0 && rows.every(isRowSelected), [rows, isRowSelected]);
  const partialChecked = useMemo(
    () => !allChecked && rows.some(isRowSelected),
    [allChecked, rows, isRowSelected]
  );

  const buildFolderMenu = (folder: TAssetFolder): MenuProps["items"] => {
    const items: NonNullable<MenuProps["items"]> = [];
    if (permissions.canCreateFolder) {
      items.push({
        key: "rename",
        label: "重命名",
        icon: <Pencil className="size-3.5" />,
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          onRenameFolder(folder);
        },
      });
    }
    if (permissions.canDelete) {
      items.push({
        key: "delete",
        danger: true,
        label: "删除",
        icon: <Trash2 className="size-3.5" />,
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          confirmDeleteFolder(folder.name, () => {
            void onDeleteFolder(folder.id);
          });
        },
      });
    }
    return items;
  };

  return (
    <div className="flex h-full flex-col text-[13px]">
      {/* Header */}
      <div
        className="grid items-center gap-3 border-b border-subtle bg-layer-2/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-tertiary"
        style={{ gridTemplateColumns: COLS }}
      >
        <div className="flex items-center justify-center">
          <Checkbox
            checked={allChecked}
            indeterminate={partialChecked}
            disabled={rows.length === 0}
            onChange={() => onToggleAll(rows)}
          />
        </div>
        <div>Name</div>
        <div>Last Modified</div>
        <div className="text-right">Size</div>
        <div />
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-y-auto">
        {loading && (
          <div className="px-5 py-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="mb-1 grid items-center gap-3 rounded-md px-2 py-3"
                style={{ gridTemplateColumns: COLS }}
              >
                <div className="h-3 w-3" />
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 animate-pulse rounded-md bg-layer-2" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-layer-2" />
                </div>
                <div className="h-3 w-44 animate-pulse rounded bg-layer-2" />
                <div className="ml-auto h-3 w-16 animate-pulse rounded bg-layer-2" />
                <div />
              </div>
            ))}
          </div>
        )}

        {!loading &&
          rows.map((row) => {
            const selected = isRowSelected(row);
            const isFile = row.kind === "file";
            const active = isFile && activeFileId === row.file.id;
            const folderMenu = !isFile ? buildFolderMenu(row.folder) : undefined;
            const hasFolderMenu = Boolean(folderMenu && folderMenu.length > 0);

            const handleRowClick = () => {
              if (row.kind === "folder") onOpenFolder(row.folder.id);
              else onActivateFile(row.file);
            };

            return (
              <div
                key={row.key}
                onClick={handleRowClick}
                className={`group relative grid cursor-pointer items-center gap-3 border-b border-subtle/50 px-5 py-2.5 transition-colors ${
                  active
                    ? "bg-accent-primary/[0.10] hover:bg-accent-primary/[0.12]"
                    : selected
                    ? "bg-accent-primary/[0.05] hover:bg-accent-primary/[0.08]"
                    : "hover:bg-layer-1-hover"
                }`}
                style={{ gridTemplateColumns: COLS }}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[2px] bg-accent-primary"
                  />
                )}

                {/* Checkbox cell — independent from row click */}
                <div
                  className="flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleRow(row);
                  }}
                >
                  <span
                    className={`relative flex h-4 w-4 items-center justify-center rounded border transition-all ${
                      selected
                        ? "border-accent-primary bg-accent-primary text-on-color"
                        : "border-subtle-1 bg-transparent text-transparent group-hover:border-strong"
                    }`}
                  >
                    {selected && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </div>

                {/* Name */}
                <div className="flex min-w-0 items-center gap-2.5">
                  {row.kind === "folder" ? (
                    <FolderTypeIcon size="sm" />
                  ) : (
                    <FileTypeIcon filename={row.file.name || row.file.filename} size="sm" />
                  )}
                  <div className="flex min-w-0 flex-col">
                    <span
                      className={`truncate font-medium ${
                        active ? "text-accent-primary" : "text-primary"
                      }`}
                      title={
                        row.kind === "folder"
                          ? row.folder.name
                          : row.file.name || row.file.filename || ""
                      }
                    >
                      {row.kind === "folder"
                        ? row.folder.name
                        : row.file.name || row.file.filename || "未命名"}
                    </span>
                    {/* 搜索模式下后端返回了相对 filestore 的父级路径，给一行 muted 副标题展示 */}
                    {(() => {
                      const path = row.kind === "folder" ? row.folder.path : row.file.path;
                      if (path === undefined) return null;
                      const display = path ? `filestore/${path}` : "filestore";
                      return (
                        <span
                          className="truncate text-[11px] text-tertiary"
                          title={display}
                        >
                          {display}
                        </span>
                      );
                    })()}
                  </div>
                  {row.kind === "folder" && (
                    <ChevronRight className="size-3 shrink-0 text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </div>

                {/* Updated — MinIO absolute format */}
                <div className="truncate font-mono text-[12px] tabular-nums text-secondary">
                  {row.kind === "file"
                    ? formatMinIODate(row.file.created_at)
                    : formatMinIODate(row.folder.updated_at)}
                </div>

                {/* Size */}
                <div className="text-right font-mono text-[12px] tabular-nums text-secondary">
                  {row.kind === "folder" ? "—" : formatBytes(row.file.size)}
                </div>

                {/* Folder context menu (hidden until hover) */}
                <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                  {!isFile && hasFolderMenu && (
                    <Dropdown
                      menu={{ items: folderMenu }}
                      trigger={["click"]}
                      placement="bottomRight"
                    >
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-tertiary opacity-0 transition hover:bg-layer-2 hover:text-primary group-hover:opacity-100"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </Dropdown>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
