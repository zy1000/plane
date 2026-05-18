import { useEffect, useState } from "react";
import { Modal } from "antd";
import { FolderPlus } from "lucide-react";

type TCreateFolderModalProps = {
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (folderName: string) => Promise<void> | void;
};

export const CreateFolderModal = ({ open, loading, onCancel, onSubmit }: TCreateFolderModalProps) => {
  const [folderName, setFolderName] = useState("");

  useEffect(() => {
    if (!open) setFolderName("");
  }, [open]);

  const handleOk = async () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
    setFolderName("");
  };

  const handleCancel = () => {
    setFolderName("");
    onCancel();
  };

  return (
    <Modal
      open={open}
      title={null}
      closable={false}
      onCancel={handleCancel}
      onOk={() => void handleOk()}
      okText="创建"
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ disabled: !folderName.trim() }}
      width={420}
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <FolderPlus className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-tight text-primary">新建文件夹</span>
            <span className="text-[12px] text-tertiary">将在当前目录下创建</span>
          </div>
        </div>

        <input
          autoFocus
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          maxLength={255}
          placeholder="文件夹名称"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleOk();
          }}
          className="h-9 w-full rounded-md border border-subtle bg-transparent px-3 text-[13px] text-primary placeholder:text-placeholder transition focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent-subtle"
        />
      </div>
    </Modal>
  );
};
