import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ClipboardCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCreateStageReviewPayload, TStageReview } from "@plane/types";
import { EStageReviewStatus } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { getStageReviewError, useStageReviews } from "@/hooks/store/use-stage-reviews";
import { useUser } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { CreateStageReviewModal } from "./create-stage-review-modal";
import { StageReviewDrawer } from "./detail/stage-review-drawer";
import { useStageReviewPermissions } from "./permissions";
import { StageReviewRail } from "./stage-rail";
import { StageReviewFilters } from "./stage-review-filters";
import {
  EMPTY_STAGE_REVIEW_FILTERS,
  buildStageReviewGroups,
  countByStatus,
  type TStageReviewFilters,
} from "./stage-review-rows";
import { StageReviewTable } from "./stage-review-table";

const I18N = "stage_review";

/** 四张统计卡的左边框颜色，顺序与状态一致 */
const STAT_ACCENT: Record<EStageReviewStatus, string> = {
  [EStageReviewStatus.NOT_STARTED]: "border-l-tertiary",
  [EStageReviewStatus.IN_REVIEW]: "border-l-warning-primary",
  [EStageReviewStatus.IN_APPROVAL]: "border-l-accent-primary",
  [EStageReviewStatus.COMPLETED]: "border-l-success-primary",
};

/**
 * 阶段评审执行台：左栏选阶段，主区按产品分组，评审活动缩进挂在所属评审下。
 *
 * 这一屏回答两个问题 —— 这个阶段还剩什么没评完（左栏进度 + 四张卡），以及轮到我的
 * 那条现在该做什么（点开右侧抽屉）。**被裁剪掉的评审不会出现在这里**，它们在裁剪表
 * 里带着原因存档。
 */
export const StageReviewList = observer(function StageReviewList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { getWorkspaceBySlug } = useWorkspace();
  const { canManage } = useStageReviewPermissions(workspaceSlug, projectId);
  const {
    stages,
    activeStage,
    activeStageId,
    setActiveStageId,
    reviews,
    isStagesLoading,
    isReviewsLoading,
    error,
    applyReview,
    createReview,
    deleteReview,
  } = useStageReviews(workspaceSlug, projectId);

  const [filters, setFilters] = useState<TStageReviewFilters>(EMPTY_STAGE_REVIEW_FILTERS);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [toDelete, setToDelete] = useState<TStageReview | null>(null);

  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const counts = useMemo(() => countByStatus(reviews), [reviews]);
  const groups = useMemo(
    () => buildStageReviewGroups(reviews, filters, currentUser?.id),
    [reviews, filters, currentUser?.id]
  );

  const translateError = (requestError: unknown) => {
    const { message, code } = getStageReviewError(requestError);
    return code ? t(`${I18N}.errors.${code}`, { defaultValue: message }) : message;
  };

  const handleCreate = async (payload: TCreateStageReviewPayload) => {
    setIsMutating(true);
    try {
      const created = await createReview(payload);
      setIsCreateOpen(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.created`) });
      // 建完直接开抽屉：负责人、日期、描述都还要在里面补
      if (created) setOpenReviewId(created.id);
    } catch (requestError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${I18N}.toast.failed`),
        message: translateError(requestError),
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsMutating(true);
    try {
      await deleteReview(toDelete.id);
      if (openReviewId === toDelete.id) setOpenReviewId(null);
      setToDelete(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.deleted`) });
    } catch (requestError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${I18N}.toast.failed`),
        message: translateError(requestError),
      });
    } finally {
      setIsMutating(false);
    }
  };

  if (isStagesLoading) {
    return (
      <Loader className="space-y-3 p-5">
        <Loader.Item height="64px" />
        <Loader.Item height="320px" />
      </Loader>
    );
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-14 font-medium text-primary">{t(`${I18N}.error_title`)}</p>
          <p className="mt-1 text-12 text-tertiary">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <StageReviewRail stages={stages} activeStageId={activeStageId} onSelect={setActiveStageId} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-2.5 px-5 pt-4">
          {[
            EStageReviewStatus.NOT_STARTED,
            EStageReviewStatus.IN_REVIEW,
            EStageReviewStatus.IN_APPROVAL,
            EStageReviewStatus.COMPLETED,
          ].map((status) => (
            <div
              key={status}
              className={cn(
                "flex flex-1 flex-col gap-0.5 rounded-lg border border-subtle border-l-[3px] px-3.5 py-2.5",
                STAT_ACCENT[status]
              )}
            >
              <span className="text-12 text-tertiary">{t(`${I18N}.status.${status}`)}</span>
              <span className="text-22 font-semibold tabular-nums text-primary">{counts[status]}</span>
            </div>
          ))}
        </div>

        <StageReviewFilters
          reviews={reviews}
          filters={filters}
          canManage={canManage}
          onChange={setFilters}
          onCreate={() => setIsCreateOpen(true)}
        />

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
          {isReviewsLoading ? (
            <Loader className="space-y-2">
              <Loader.Item height="36px" />
              <Loader.Item height="36px" />
              <Loader.Item height="36px" />
            </Loader>
          ) : groups.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <ClipboardCheck className="size-8 text-tertiary" />
                <p className="text-14 font-medium text-primary">{t(`${I18N}.empty.title`)}</p>
                <p className="max-w-80 text-12 leading-relaxed text-tertiary">{t(`${I18N}.empty.description`)}</p>
              </div>
            </div>
          ) : (
            <StageReviewTable
              groups={groups}
              activeReviewId={openReviewId}
              canManage={canManage}
              onOpen={setOpenReviewId}
              onDelete={setToDelete}
            />
          )}
        </div>
      </div>

      <StageReviewDrawer
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        reviewId={openReviewId}
        canManage={canManage}
        onClose={() => setOpenReviewId(null)}
        onUpdated={applyReview}
      />

      <CreateStageReviewModal
        isOpen={isCreateOpen}
        stageId={activeStageId}
        stageLabel={activeStage?.label ?? ""}
        reviews={reviews}
        isSubmitting={isMutating}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <AlertModalCore
        isOpen={Boolean(toDelete)}
        handleClose={() => setToDelete(null)}
        handleSubmit={handleDelete}
        isSubmitting={isMutating}
        title={t(`${I18N}.delete.title`)}
        content={t(`${I18N}.delete.content`, { title: toDelete?.title ?? "" })}
      />
    </div>
  );
});
