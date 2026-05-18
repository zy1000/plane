import { Modal } from "antd";
import { AlertTriangle, FileText } from "lucide-react";
import type { TMoveConflictItem } from "../types";

type TConflictModalProps = {
  open: boolean;
  conflicts: TMoveConflictItem[];
  onCancel: () => void;
  onOverwrite: () => void;
  onRename: () => void;
};

export const ConflictModal = ({ open, conflicts, onCancel, onOverwrite, onRename }: TConflictModalProps) => (
  <Modal
    open={open}
    title={null}
    closable={false}
    onCancel={onCancel}
    width={460}
    footer={
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-md border border-subtle bg-layer-1 px-3 text-[13px] font-medium text-secondary transition hover:border-strong hover:text-primary"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onRename}
          className="h-8 rounded-md border border-subtle bg-layer-1 px-3 text-[13px] font-medium text-secondary transition hover:border-strong hover:text-primary"
        >
          自动重命名
        </button>
        <button
          type="button"
          onClick={onOverwrite}
          className="h-8 rounded-md bg-danger-primary px-3 text-[13px] font-medium text-on-color shadow-raised-200 transition hover:bg-danger-primary-hover"
        >
          覆盖
        </button>
      </div>
    }
  >
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-subtle text-warning-primary">
          <AlertTriangle className="size-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold tracking-tight text-primary">检测到重名文件</span>
          <span className="text-[12px] text-tertiary">
            目标目录存在 {conflicts.length} 个同名文件，请选择处理方式
          </span>
        </div>
      </div>

      <div className="max-h-60 overflow-auto rounded-lg border border-subtle bg-layer-1">
        {conflicts.map((item) => (
          <div
            key={item.asset_id}
            className="flex items-center gap-2 border-b border-subtle/60 px-3 py-2 text-[13px] last:border-b-0"
          >
            <FileText className="size-3.5 shrink-0 text-tertiary" />
            <span className="truncate text-secondary" title={item.filename}>
              {item.filename}
            </span>
          </div>
        ))}
      </div>
    </div>
  </Modal>
);
