import { useEffect, useState } from "react";
import { Modal } from "antd";
import { Pencil } from "lucide-react";
import type { TAssetFolder } from "@/services/asset-explorer.service";

type TRenameModalProps = {
  open: boolean;
  folder: TAssetFolder | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (folderName: string) => Promise<void> | void;
};

export const RenameModal = ({ open, folder, loading, onCancel, onSubmit }: TRenameModalProps) => {
  const [folderName, setFolderName] = useState("");

  useEffect(() => {
    setFolderName(folder?.name ?? "");
  }, [folder?.name, open]);

  const handleOk = async () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
  };

  return (
    <Modal
      open={open}
      title={null}
      closable={false}
      onCancel={onCancel}
      onOk={() => void handleOk()}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ disabled: !folderName.trim() || folderName === folder?.name }}
      width={420}
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <Pencil className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-tight text-primary">重命名文件夹</span>
            <span className="truncate text-[12px] text-tertiary" title={folder?.name}>
              原名称：{folder?.name ?? "—"}
            </span>
          </div>
        </div>

        <input
          autoFocus
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          maxLength={255}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleOk();
          }}
          className="h-9 w-full rounded-md border border-subtle bg-layer-1 px-3 text-[13px] text-primary placeholder:text-placeholder transition focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent-subtle"
        />
      </div>
    </Modal>
  );
};
