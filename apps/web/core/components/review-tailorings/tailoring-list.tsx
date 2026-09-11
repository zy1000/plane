import { useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCreateReviewTailoringPayload, TReviewTailoring } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import { CountChip } from "@/components/common/count-chip";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { useAppRouter } from "@/hooks/use-app-router";
import { getTailoringError, useReviewTailorings } from "@/hooks/store/use-review-tailorings";
import { CreateTailoringModal } from "./create-tailoring-modal";
import { TailoringAppliedFilters } from "./list/applied-filters";
import { TailoringEmptyState } from "./list/empty-state";
import {
  EMPTY_TAILORING_FILTERS,
  REVIEW_TAILORINGS_HEADER_ACTIONS_ID,
  REVIEW_TAILORINGS_HEADER_COUNT_ID,
  filterTailorings,
  hasTailoringFilters,
} from "./list/filters";
import { TailoringFiltersDropdown } from "./list/filters-dropdown";
import { TailoringRow } from "./list/tailoring-row";
import { useReviewTailoringPermissions } from "./permissions";

const I18N = "review_tailoring";

const COLUMNS = [
  { key: "tailoring", className: "w-[36%] pl-6" },
  { key: "status", className: "w-[18%]" },
  { key: "selected", className: "w-[18%]" },
  { key: "created_by", className: "w-[14%]" },
  { key: "updated_at", className: "w-[10%]" },
] as const;

/**
 * 裁剪表列表。搜索 / 过滤 / 新建 portal 进页头右侧的挂点，状态全留在这里；
 * 行点击进详情，删除只对从未生效过的草稿开放。
 */
export const ReviewTailoringList = observer(function ReviewTailoringList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const router = useAppRouter();
  const { canManage } = useReviewTailoringPermissions(workspaceSlug, projectId);
  const { tailorings, isLoading, isMutating, error, createTailoring, deleteTailoring } = useReviewTailorings(
    workspaceSlug,
    projectId
  );

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_TAILORING_FILTERS);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<TReviewTailoring | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  const [countHost, setCountHost] = useState<HTMLElement | null>(null);

  // 挂点在同一次提交里由页头渲染出来，layout effect 时 DOM 已就绪
  useLayoutEffect(() => {
    setActionsHost(document.getElementById(REVIEW_TAILORINGS_HEADER_ACTIONS_ID));
    setCountHost(document.getElementById(REVIEW_TAILORINGS_HEADER_COUNT_ID));
  }, []);

  const visible = useMemo(() => filterTailorings(tailorings, search, filters), [tailorings, search, filters]);

  const detailPath = (id: string) => `/${workspaceSlug}/projects/${projectId}/review-tailorings/${id}`;

  const translateError = (requestError: unknown) => {
    const { message, code } = getTailoringError(requestError);
    // 领域错误码有中文文案，其余回落到服务端原文
    return code ? t(`${I18N}.errors.${code}`, { defaultValue: message }) : message;
  };

  const handleCreate = async (payload: TCreateReviewTailoringPayload) => {
    try {
      const created = await createTailoring(payload);
      setIsCreateOpen(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.created`) });
      if (created) router.push(detailPath(created.id));
    } catch (requestError) {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast.failed`), message: translateError(requestError) });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      await deleteTailoring(toDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.deleted`) });
      setToDelete(null);
    } catch (requestError) {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast.failed`), message: translateError(requestError) });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyLink = (item: TReviewTailoring) => {
    void copyUrlToClipboard(detailPath(item.id).slice(1)).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.list.link_copied`) })
    );
  };

  const headerActions = (
    <>
      <PageSearchInput
        searchQuery={search}
        updateSearchQuery={setSearch}
        placeholder={t(`${I18N}.search_placeholder`)}
      />
      <TailoringFiltersDropdown tailorings={tailorings} filters={filters} onChange={setFilters} />
      {canManage && (
        <Button variant="primary" size="lg" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-3.5" />
          {t(`${I18N}.create`)}
        </Button>
      )}
    </>
  );

  const renderBody = () => {
    if (isLoading) {
      return (
        <Loader className="space-y-3 p-6">
          <Loader.Item height="32px" />
          <Loader.Item height="180px" />
        </Loader>
      );
    }
    if (tailorings.length === 0) {
      return <TailoringEmptyState canCreate={canManage} onCreate={() => setIsCreateOpen(true)} />;
    }
    if (visible.length === 0) {
      return <p className="py-16 text-center text-13 text-tertiary">{t(`${I18N}.empty.filtered`)}</p>;
    }
    return (
      <table className="w-full min-w-[880px] border-collapse">
        <thead className="sticky top-0 z-[2] bg-surface-1">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "border-b border-subtle px-3 py-2 text-left text-12 font-medium whitespace-nowrap text-tertiary",
                  column.className
                )}
              >
                {t(`${I18N}.list.${column.key}`)}
              </th>
            ))}
            <th className="w-12 border-b border-subtle" />
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <TailoringRow
              key={item.id}
              item={item}
              canDelete={canManage && item.status === EReviewTailoringStatus.DRAFT && item.revision === 0}
              onOpen={() => router.push(detailPath(item.id))}
              onCopyLink={() => handleCopyLink(item)}
              onDelete={() => setToDelete(item)}
            />
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {actionsHost && createPortal(headerActions, actionsHost)}
      {countHost && tailorings.length > 0 && createPortal(<CountChip count={tailorings.length} />, countHost)}

      {hasTailoringFilters(filters) && (
        <TailoringAppliedFilters tailorings={tailorings} filters={filters} onChange={setFilters} />
      )}

      {error && <p className="px-6 py-3 text-12 text-danger-primary">{error}</p>}

      <div className="min-h-0 flex-1 overflow-auto">{renderBody()}</div>

      <CreateTailoringModal
        isOpen={isCreateOpen}
        isSubmitting={isMutating}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <AlertModalCore
        isOpen={Boolean(toDelete)}
        handleClose={() => setToDelete(null)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t(`${I18N}.actions.delete_title`)}
        content={t(`${I18N}.actions.delete_content`)}
      />
    </div>
  );
});
