import { useTranslation } from "@plane/i18n";
import type { EProjectStageStatus } from "@plane/types";
import { PROJECT_STAGE_STATUSES } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "project_stage";

/** 配色跟着「越靠后越接近完成」走：灰 → 蓝 → 黄 → 绿 */
export const PROJECT_STAGE_STATUS_STYLE: Record<EProjectStageStatus, { pill: string; dot: string }> = {
  not_started: { pill: "bg-layer-3 text-secondary", dot: "bg-tertiary" },
  in_progress: { pill: "bg-accent-subtle text-accent-primary", dot: "bg-accent-primary" },
  paused: { pill: "bg-warning-subtle text-warning-primary", dot: "bg-warning-primary" },
  completed: { pill: "bg-success-subtle text-success-primary", dot: "bg-success-primary" },
};

/** 切换状态会带的副作用，写在选项右侧的小字里，不另弹确认 */
const STATUS_HINT: Partial<Record<EProjectStageStatus, string>> = {
  not_started: "not_started",
  in_progress: "in_progress",
  completed: "completed",
};

/**
 * 状态胶囊 + 下拉。有 onChange 才是下拉，不传恒只读（无权限的行）。
 * 状态直接改，实际日期的填 / 清由后端按切换处理。
 */
export const ProjectStageStatusCell = ({
  status,
  onChange,
  disabled = false,
  className,
}: {
  status: EProjectStageStatus;
  onChange?: (status: EProjectStageStatus) => void;
  disabled?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  const style = PROJECT_STAGE_STATUS_STYLE[status] ?? PROJECT_STAGE_STATUS_STYLE.not_started;
  const pill = (
    <span
      className={cn(
        "inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-12 font-medium",
        style.pill,
        onChange && !disabled && "cursor-pointer",
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
      <span className="truncate">{t(`${I18N}.status.${status}`)}</span>
    </span>
  );

  if (!onChange || disabled) return pill;

  return (
    <CustomSelect
      customButton={pill}
      value={status}
      onChange={(next: EProjectStageStatus) => {
        if (next !== status) onChange(next);
      }}
      maxHeight="lg"
      optionsClassName="w-52"
    >
      {PROJECT_STAGE_STATUSES.map((option) => {
        const optionStyle = PROJECT_STAGE_STATUS_STYLE[option];
        const hint = STATUS_HINT[option];
        return (
          <CustomSelect.Option key={option} value={option}>
            <div className="flex w-full items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", optionStyle.dot)} aria-hidden />
              <span className="flex-1">{t(`${I18N}.status.${option}`)}</span>
              {hint && <span className="text-11 text-tertiary">{t(`${I18N}.status_hint.${hint}`)}</span>}
            </div>
          </CustomSelect.Option>
        );
      })}
    </CustomSelect>
  );
};
