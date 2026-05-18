import { useEffect, useMemo, useState } from "react";
import { Modal, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import { Folder, FolderInput, Loader2 } from "lucide-react";
import { AssetExplorerService, type TFolderTreeNode } from "@/services/asset-explorer.service";

type TFolderPickerModalProps = {
  open: boolean;
  title: string;
  workspaceSlug: string;
  projectId: string;
  service: AssetExplorerService;
  onCancel: () => void;
  onConfirm: (targetFolderId: number) => void | Promise<void>;
};

const toTreeData = (node: TFolderTreeNode | null): DataNode[] => {
  if (!node) return [];
  const buildNode = (current: TFolderTreeNode): DataNode => ({
    key: String(current.id),
    title: (
      <span className="inline-flex items-center gap-1.5 py-0.5 text-[13px] text-secondary">
        <Folder className="size-3.5 text-accent-primary" strokeWidth={1.75} />
        <span className="truncate text-primary">{current.name}</span>
      </span>
    ),
    children: Array.isArray(current.children) ? current.children.map(buildNode) : [],
  });
  return [buildNode(node)];
};

export const FolderPickerModal = ({
  open,
  title,
  workspaceSlug,
  projectId,
  service,
  onCancel,
  onConfirm,
}: TFolderPickerModalProps) => {
  const [loading, setLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [tree, setTree] = useState<TFolderTreeNode | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const result = await service.getFolderTree(workspaceSlug, projectId);
        if (!active) return;
        setTree(result?.tree ?? null);
        setSelectedFolderId(result?.tree?.id ?? null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, projectId, service, workspaceSlug]);

  const treeData = useMemo(() => toTreeData(tree), [tree]);

  return (
    <Modal
      open={open}
      title={null}
      closable={false}
      onCancel={onCancel}
      onOk={() => {
        if (!selectedFolderId) return;
        void onConfirm(selectedFolderId);
      }}
      okText="确定"
      cancelText="取消"
      okButtonProps={{ disabled: !selectedFolderId }}
      width={460}
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <FolderInput className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-tight text-primary">{title}</span>
            <span className="text-[12px] text-tertiary">从下方目录树中选择一个目标位置</span>
          </div>
        </div>

        <div className="max-h-80 overflow-auto rounded-lg border border-subtle bg-layer-1 p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-tertiary">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : (
            <Tree
              treeData={treeData}
              defaultExpandAll
              blockNode
              selectedKeys={selectedFolderId ? [String(selectedFolderId)] : []}
              onSelect={(keys) => {
                const first = keys?.[0];
                if (!first) return;
                setSelectedFolderId(Number(first));
              }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};
