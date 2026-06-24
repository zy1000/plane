import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import { Pencil } from "lucide-react";
import type { TAssetFileVersion } from "@/services/asset-explorer.service";

type TVersionAliasModalProps = {
  open: boolean;
  version: TAssetFileVersion | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (alias: string) => Promise<void> | void;
};

const getVersionLabel = (version: TAssetFileVersion | null) =>
  version?.alias || version?.filename || version?.version_id || "—";

export const VersionAliasModal = ({ open, version, loading, onCancel, onSubmit }: TVersionAliasModalProps) => {
  const [alias, setAlias] = useState("");

  useEffect(() => {
    setAlias(version?.alias ?? "");
  }, [open, version?.alias]);

  const trimmedAlias = alias.trim();
  const currentAlias = useMemo(() => (version?.alias ?? "").trim(), [version?.alias]);
  const isUnchanged = trimmedAlias === currentAlias;

  const handleOk = async () => {
    if (!version || isUnchanged) return;
    await onSubmit(trimmedAlias);
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
      okButtonProps={{ disabled: isUnchanged }}
      width={420}
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <Pencil className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold tracking-tight text-primary">修改版本别名</span>
            <span className="truncate text-[12px] text-tertiary" title={getVersionLabel(version)}>
              当前名称：{getVersionLabel(version)}
            </span>
          </div>
        </div>

        <input
          autoFocus
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
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
