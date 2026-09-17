import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TStageReview, TStageReviewBulkChanges } from "@plane/types";
import { getStageReviewError } from "@/hooks/store/use-stage-reviews";
import { StageReviewService } from "@/services/stage-review.service";
import type { TStageReviewColumn } from "../display/display-settings";

const service = new StageReviewService();
const I18N = "stage_review.bulk";
const FLASH_MS = 1600;

export type TStageReviewFlashedCells = { ids: Set<string>; columns: Set<TStageReviewColumn> };

/** 改了哪个字段就闪哪一列：两个日期同在「计划日期」一列 */
const FIELD_COLUMN: Record<keyof TStageReviewBulkChanges, TStageReviewColumn> = {
  leader: "leader",
  auditor: "auditor",
  start_date: "dates",
  end_date: "dates",
};

/** 序列化器的 400 是 `{字段: ["原因"]}`，领域错误是 `{error, code}`，两种都归成一句话 */
const errorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const first = Object.values(error as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined;
    if (first && typeof first[0] === "string") return first[0];
    if ("error" in error || "detail" in error) return getStageReviewError(error).message;
  }
  return fallback;
};

type TParams = {
  workspaceSlug: string;
  projectId: string;
  selectedIds: string[];
  /** 提交后把选择换成这些 id（只留没改成的） */
  replaceSelection: (ids: string[]) => void;
  applyReviews: (reviews: TStageReview[]) => void;
};

/** 阶段评审列表「修改属性」：面板开关、提交、部分成功提示与格子高亮 */
export const useStageReviewBulkEdit = ({
  workspaceSlug,
  projectId,
  selectedIds,
  replaceSelection,
  applyReviews,
}: TParams) => {
  const { t } = useTranslation();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flashedCells, setFlashedCells] = useState<TStageReviewFlashedCells | null>(null);

  useEffect(() => {
    if (selectedIds.length === 0) setIsPanelOpen(false);
  }, [selectedIds.length]);

  useEffect(() => {
    if (!flashedCells) return;
    const timer = window.setTimeout(() => setFlashedCells(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashedCells]);

  const apply = async (changes: TStageReviewBulkChanges) => {
    const ids = [...selectedIds];
    setSubmitting(true);
    try {
      const result = await service.bulkUpdate(workspaceSlug, projectId, { review_ids: ids, ...changes });
      applyReviews(result.reviews);

      const skipped = result.skipped_locked.length;
      if (result.failed.length === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t(`${I18N}.toast_success`, { count: result.updated }),
          message: skipped > 0 ? t(`${I18N}.toast_skipped`, { count: skipped }) : undefined,
        });
      } else {
        const first = result.failed[0];
        setToast({
          type: result.updated > 0 ? TOAST_TYPE.WARNING : TOAST_TYPE.ERROR,
          title: t(`${I18N}.toast_partial`, { updated: result.updated, failed: result.failed.length }),
          message: t(`${I18N}.toast_partial_detail`, { title: first.title, error: first.error }),
        });
      }

      const failedIds = result.failed.map((item) => item.id);
      replaceSelection(failedIds);
      if (failedIds.length === 0) setIsPanelOpen(false);

      const columns = new Set(
        (Object.keys(changes) as (keyof TStageReviewBulkChanges)[]).map((field) => FIELD_COLUMN[field])
      );
      setFlashedCells({ ids: new Set(result.reviews.map((review) => review.id)), columns });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${I18N}.toast_error`),
        message: errorMessage(error, ""),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return {
    isPanelOpen,
    togglePanel: () => setIsPanelOpen((open) => !open),
    closePanel: () => setIsPanelOpen(false),
    submitting,
    flashedCells,
    apply,
  };
};
