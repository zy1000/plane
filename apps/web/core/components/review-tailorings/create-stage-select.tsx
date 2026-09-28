import { ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringStageOption } from "@plane/types";
import { EProjectStageStatus } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "review_tailoring.form";

const STATUS_DOT: Record<string, string> = {
  [EProjectStageStatus.IN_PROGRESS]: "bg-accent-primary",
  [EProjectStageStatus.COMPLETED]: "bg-success-primary",
};

/** 「10-08 → 10-24」；两头都没有就是未排期 */
const dateRange = (stage: TReviewTailoringStageOption, emptyText: string) => {
  if (!stage.start_date && !stage.end_date) return emptyText;
  const short = (value: string | null) => (value ? value.slice(5) : "…");
  return `${short(stage.start_date)} → ${short(stage.end_date)}`;
};

/**
 * 新建 O阶段评审裁剪的「阶段」单选。候选由后端给（阶段类型为 O阶段 的项目阶段，树先序），
 * 这里只管画：状态点 + 阶段名 + 计划日期 + 状态，父也在候选里的子阶段缩进。
 */
export const CreateTailoringStageSelect = ({
  options,
  value,
  hasError,
  onChange,
}: {
  options: TReviewTailoringStageOption[];
  value: string | null;
  hasError: boolean;
  onChange: (stageId: string) => void;
}) => {
  const { t } = useTranslation();
  const selected = options.find((option) => option.id === value);
  const noDate = t(`${I18N}.stage_no_date`);

  const dot = (stage: TReviewTailoringStageOption) => (
    <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[stage.status] ?? "bg-current text-placeholder")} />
  );

  return (
    <CustomSearchSelect
      value={value}
      onChange={(next: string) => {
        if (next) onChange(next);
      }}
      options={options.map((stage) => ({
        value: stage.id,
        query: stage.name,
        content: (
          <span
            className="flex min-w-0 flex-1 items-center gap-3 py-1 text-14"
            style={stage.parent_id ? { paddingLeft: 20 } : undefined}
          >
            {dot(stage)}
            <span className="min-w-0 flex-1 truncate font-medium">{stage.name}</span>
            <span className="shrink-0 text-12 text-tertiary tabular-nums">{dateRange(stage, noDate)}</span>
            <span className="w-12 shrink-0 text-right text-12 text-tertiary">
              {t(`project_stage.status.${stage.status}`)}
            </span>
          </span>
        ),
      }))}
      maxHeight="lg"
      className="w-full"
      optionsClassName="w-[33rem] max-w-[calc(100vw-4rem)]"
      customButtonClassName={cn(
        "h-10 rounded-lg border bg-surface-1 px-3 text-14 transition-shadow hover:bg-surface-1 focus:ring-3",
        hasError
          ? "border-danger-strong focus:ring-danger-primary/10"
          : "border-subtle focus:border-accent-strong focus:ring-accent-primary/15"
      )}
      customButton={
        <>
          {selected ? (
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              {dot(selected)}
              <span className="truncate font-medium text-primary">{selected.name}</span>
              <span className="shrink-0 text-12 text-tertiary tabular-nums">
                {dateRange(selected, noDate)} · {t(`project_stage.status.${selected.status}`)}
              </span>
            </span>
          ) : (
            <span className="flex-1 truncate text-left text-placeholder">{t(`${I18N}.stage_placeholder`)}</span>
          )}
          <ChevronDown className="size-4 shrink-0 text-tertiary" />
        </>
      }
    />
  );
};
