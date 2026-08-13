/**
 * 「基线」Tab：列表 / 快照详情 / 两基线对比三个视图共用一个 Tab，靠 URL 上的参数切换。
 *
 * 走 URL 而不是内存态 —— 一份基线和一次对比都是要贴给别人看的东西。
 */
import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementBaseline, TRequirementBaselinePayload, TRequirementTypeSchema, TRequirementField } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import {
  useRequirementBaselineCompare,
  useRequirementBaselineDetail,
  useRequirementBaselines,
} from "@/hooks/store/use-requirement-baselines";
import { BaselineCompare } from "./baseline-compare";
import { BaselineDetail } from "./baseline-detail";
import { BaselineList } from "./baseline-list";
import { CreateBaselineModal } from "./create-baseline-modal";

type TProps = {
  workspaceSlug: string;
  productId: string;
  fields: TRequirementField[];
  requirementTypes: TRequirementTypeSchema[];
  canManage: boolean;
  store: ReturnType<typeof useRequirementBaselines>;
  isCreateOpen: boolean;
  onCreateOpenChange: (isOpen: boolean) => void;
  /** 打开的基线；`compareToId` 非空时进对比视图 */
  openedBaselineId: string | null;
  compareToId: string | null;
  onOpenBaseline: (baselineId: string | null, compareToId?: string | null) => void;
};

export function RequirementBaselinesTab(props: TProps) {
  const {
    workspaceSlug,
    productId,
    fields,
    requirementTypes,
    canManage,
    store,
    isCreateOpen,
    onCreateOpenChange,
    openedBaselineId,
    compareToId,
    onOpenBaseline,
  } = props;
  const { t } = useTranslation();
  const [baselineToDelete, setBaselineToDelete] = useState<TRequirementBaseline | null>(null);
  const [requirementTypeId, setRequirementTypeId] = useState<string | undefined>();

  const detail = useRequirementBaselineDetail({
    workspaceSlug,
    productId,
    baselineId: compareToId ? undefined : (openedBaselineId ?? undefined),
    requirementTypeId,
  });
  const comparison = useRequirementBaselineCompare({
    workspaceSlug,
    productId,
    baselineId: compareToId ? (openedBaselineId ?? undefined) : undefined,
    toBaselineId: compareToId ?? undefined,
  });

  const createBaseline = async (payload: TRequirementBaselinePayload) => {
    try {
      const created = await store.createBaseline(payload);
      onCreateOpenChange(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.baseline.toast.created", {
          name: created.name,
          count: created.entry_count,
        }),
      });
      onOpenBaseline(created.id);
    } catch (error) {
      const payloadError = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payloadError?.error ?? t("workspace_products.requirements.baseline.toast.failed"),
      });
    }
  };

  const confirmDelete = async () => {
    if (!baselineToDelete) return;
    try {
      await store.deleteBaseline(baselineToDelete.id);
      if (openedBaselineId === baselineToDelete.id) onOpenBaseline(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.baseline.toast.deleted"),
      });
    } catch (error) {
      const payloadError = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payloadError?.error ?? t("workspace_products.requirements.baseline.toast.failed"),
      });
    } finally {
      setBaselineToDelete(null);
    }
  };

  const view =
    openedBaselineId && compareToId ? (
      <BaselineCompare
        workspaceSlug={workspaceSlug}
        comparison={comparison.comparison}
        fields={fields}
        isLoading={comparison.isLoading}
        error={comparison.error}
        perPage={comparison.perPage}
        onPerPageChange={comparison.setPerPage}
        onCursorChange={comparison.setCursor}
        onBack={() => onOpenBaseline(null)}
      />
    ) : openedBaselineId ? (
      <BaselineDetail
        workspaceSlug={workspaceSlug}
        baseline={detail.baseline}
        entries={detail.entriesPage.results}
        totalCount={detail.entriesPage.total_count ?? 0}
        isLoading={detail.isLoading}
        isEntriesLoading={detail.isEntriesLoading}
        error={detail.error}
        perPage={detail.perPage}
        nextCursor={detail.entriesPage.next_cursor}
        prevCursor={detail.entriesPage.prev_cursor}
        nextPageResults={detail.entriesPage.next_page_results}
        prevPageResults={detail.entriesPage.prev_page_results}
        requirementTypes={requirementTypes}
        activeRequirementTypeId={requirementTypeId}
        onRequirementTypeChange={setRequirementTypeId}
        onPerPageChange={detail.setPerPage}
        onCursorChange={detail.setCursor}
        onBack={() => onOpenBaseline(null)}
      />
    ) : (
      <BaselineList
        baselines={store.baselinesPage.results}
        totalCount={store.baselinesPage.total_count ?? 0}
        isLoading={store.isLoading}
        error={store.error}
        perPage={store.perPage}
        nextCursor={store.baselinesPage.next_cursor}
        prevCursor={store.baselinesPage.prev_cursor}
        nextPageResults={store.baselinesPage.next_page_results}
        prevPageResults={store.baselinesPage.prev_page_results}
        canManage={canManage}
        onPerPageChange={store.setPerPage}
        onCursorChange={store.setCursor}
        onRetry={() => void store.fetchBaselines().catch(() => undefined)}
        onOpen={(baseline) => onOpenBaseline(baseline.id)}
        onCompare={(fromId, toId) => onOpenBaseline(fromId, toId)}
        onDelete={setBaselineToDelete}
        onCreate={() => onCreateOpenChange(true)}
      />
    );

  return (
    <>
      {view}

      <CreateBaselineModal
        isOpen={isCreateOpen}
        isSubmitting={store.isMutating}
        requirementTypes={requirementTypes}
        onPreview={store.previewBaseline}
        onClose={() => onCreateOpenChange(false)}
        onSubmit={(payload) => void createBaseline(payload)}
      />

      <AlertModalCore
        isOpen={Boolean(baselineToDelete)}
        isSubmitting={store.isMutating}
        handleClose={() => setBaselineToDelete(null)}
        handleSubmit={() => void confirmDelete()}
        title={t("workspace_products.requirements.baseline.delete_title")}
        content={t("workspace_products.requirements.baseline.delete_description", {
          name: baselineToDelete?.name ?? "",
        })}
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
}
