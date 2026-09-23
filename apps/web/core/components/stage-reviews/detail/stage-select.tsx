import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TStageReviewStageSummary } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { StageReviewService } from "@/services/stage-review.service";
import { INLINE_FIELD_CLASS } from "./stage-review-content";

const service = new StageReviewService();
const I18N = "stage_review.detail";

/** 为什么阶段改不了：裁剪表生成的评审由裁剪表决定；汇总评审一挪，它下面的活动就没了归属 */
export type TStageLockReason = "tailoring" | "summary";

/**
 * 侧栏「阶段」一格。
 *
 * 只有**手工评审的评审活动**能在这里改（批次 5）：选完即保存，走和负责人一样的字段保存通道，
 * 挪过去就脱离父评审。候选是本项目研发模式的全部阶段，不限阶段类型，随抽屉预拉。
 * 改不了的两种情况画成「值 + 锁」，悬停说明原因与出口；已评审的整条侧栏本来就只读，不带锁。
 */
export const StageSelect = ({
  workspaceSlug,
  projectId,
  value,
  label,
  editable,
  lockReason,
  onChange,
}: {
  workspaceSlug: string;
  projectId: string;
  value: string;
  label: string;
  editable: boolean;
  lockReason: TStageLockReason | null;
  onChange: (stageId: string) => void;
}) => {
  const { t } = useTranslation();
  const [stages, setStages] = useState<TStageReviewStageSummary[] | null>(null);
  const canEdit = editable && !lockReason;

  const fetchStages = useCallback(() => {
    if (stages) return;
    void service
      .listStages(workspaceSlug, projectId)
      .then(setStages)
      .catch(() => undefined);
  }, [stages, workspaceSlug, projectId]);

  useEffect(() => {
    setStages(null);
    if (!canEdit) return;
    let cancelled = false;
    void service
      .listStages(workspaceSlug, projectId)
      .then((next) => {
        if (!cancelled) setStages(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, canEdit]);

  if (!canEdit) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{label || "—"}</span>
        {editable && lockReason && (
          <Tooltip tooltipContent={t(`${I18N}.stage_locked_${lockReason}_hint`)}>
            <span className="inline-flex shrink-0 items-center gap-1 text-11 text-placeholder">
              <Lock className="size-3" />
              {t(`${I18N}.stage_locked_${lockReason}`)}
            </span>
          </Tooltip>
        )}
      </span>
    );
  }

  const options = (stages ?? []).map((stage) => ({
    value: stage.stage_id,
    query: `${stage.code ?? ""} ${stage.label}`,
    content: (
      <span className="flex min-w-0 items-center gap-2 text-14">
        {stage.code && <span className="w-9 shrink-0 font-mono text-11 text-placeholder">{stage.code}</span>}
        <span className="truncate">{stage.label}</span>
      </span>
    ),
  }));

  return (
    <CustomSearchSelect
      value={value}
      onChange={(next: string) => {
        if (next && next !== value) onChange(next);
      }}
      onOpen={fetchStages}
      options={options}
      maxHeight="lg"
      buttonClassName={cn(INLINE_FIELD_CLASS, "justify-between")}
      label={<span className="truncate text-14 text-primary">{label}</span>}
    />
  );
};
