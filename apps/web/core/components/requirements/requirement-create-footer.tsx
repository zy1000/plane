import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { RequiredStatus } from "@/components/common/form-modal";

type TProps = {
  /** 必填项总数 / 已填数；碰过又留空的项让左侧转成红字 */
  requiredTotal: number;
  requiredFilled: number;
  hasErrors: boolean;
  /** 提交失败的报错，有它时左侧让位给报错 */
  error: string | null;
  /** 调用方的一句说明（项目页「会关联到本项目」等），跟在必填进度后面 */
  note?: ReactNode;
  /** 不传则不出「创建后继续添加」（复制行、插入到指定位置时没意义） */
  keepAdding?: { checked: boolean; onChange: (checked: boolean) => void };
  isSubmitting: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
};

/** 建行弹窗页脚：左侧必填进度（或报错），右侧「创建后继续添加」+ 取消 / 创建需求 */
export const RequirementCreateFooter = ({
  requiredTotal,
  requiredFilled,
  hasErrors,
  error,
  note,
  keepAdding,
  isSubmitting,
  canSubmit,
  onCancel,
  onSubmit,
}: TProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-shrink-0 items-center gap-3 rounded-b-lg border-t border-subtle bg-surface-1 px-6 py-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {error ? (
          <span className="flex min-w-0 items-center gap-2 text-13 text-danger-primary">
            <AlertCircle className="size-4 shrink-0" />
            <span className="truncate" title={error}>
              {error}
            </span>
          </span>
        ) : (
          <>
            {requiredTotal > 0 && (
              <RequiredStatus filled={requiredFilled} total={requiredTotal} hasErrors={hasErrors} />
            )}
            {note && <div className="min-w-0 border-l border-subtle pl-3">{note}</div>}
          </>
        )}
      </div>
      {keepAdding && (
        <label className="flex shrink-0 cursor-pointer items-center gap-2 pr-2 text-13 text-secondary select-none">
          <input
            type="checkbox"
            checked={keepAdding.checked}
            onChange={(event) => keepAdding.onChange(event.target.checked)}
            className="accent-accent-primary size-3.75"
          />
          {t("requirement_grid.data.create_continue")}
        </label>
      )}
      <Button variant="secondary" size="xl" onClick={onCancel} disabled={isSubmitting}>
        {t("cancel")}
      </Button>
      <Button variant="primary" size="xl" onClick={onSubmit} disabled={!canSubmit} loading={isSubmitting}>
        {t("requirement_grid.data.create_submit")}
      </Button>
    </div>
  );
};
