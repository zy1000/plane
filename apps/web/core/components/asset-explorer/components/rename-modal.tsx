import { useEffect, useState } from "react";
import { Modal } from "antd";
import { Pencil } from "lucide-react";

type TRenameModalProps = {
  open: boolean;
  name: string;
  title: string;
  placeholder?: string;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void> | void;
};

export const RenameModal = ({
  open,
  name,
  title,
  placeholder = "请输入名称",
  loading,
  onCancel,
  onSubmit,
}: TRenameModalProps) => {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(name ?? "");
  }, [name, open]);

  const handleOk = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
  };

  const trimmedValue = value.trim();
  const unchanged = trimmedValue === (name ?? "").trim();

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
      okButtonProps={{ disabled: !trimmedValue || unchanged }}
      width={420}
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <Pencil className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-tight text-primary">{title}</span>
            <span className="truncate text-[12px] text-tertiary" title={name}>
              原名称：{name || "—"}
            </span>
          </div>
        </div>

        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
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
