import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserLite, TCreateReviewTailoringPayload, TReviewTailoring } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { CountChip } from "@/components/common/count-chip";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { reviewTailoringDetailPath } from "@/components/reviews/routes";
import { useAppRouter } from "@/hooks/use-app-router";
import { getTailoringError, useReviewTailorings } from "@/hooks/store/use-review-tailorings";
import { useUser } from "@/hooks/store/user";
import { ReviewTailoringApprovalInbox } from "./approval-inbox-modal";
import { CreateTailoringModal } from "./create-tailoring-modal";
import type { TEditTailoringTarget } from "./edit-tailoring-modal";
import { EditTailoringModal } from "./edit-tailoring-modal";
import { TailoringEmptyState } from "./list/empty-state";
import { REVIEW_TAILORINGS_HEADER_ACTIONS_ID, REVIEW_TAILORINGS_HEADER_COUNT_ID } from "./list/filters";
import { tailoringMatchesConditions } from "./list/rich-filters/match-tailoring";
import { useTailoringFilter } from "./list/rich-filters/use-tailoring-filter";
import { useTailoringFiltersConfig } from "./list/rich-filters/use-tailoring-filters-config";
import { TailoringRow } from "./list/tailoring-row";
import { useReviewTailoringPermissions } from "./permissions";
import { PLAIN_TABLE, PLAIN_TH } from "./plain-table";

const I18N = "review_tailoring";

/** 标题列不给宽度，吃掉剩余宽度；其余定宽 */
const COLUMNS: { key: string; width?: number; className?: string }[] = [
  { key: "tailoring", className: "pl-6" },
  { key: "kind", width: 150 },
  { key: "stage", width: 110 },
  { key: "status", width: 130 },
  { key: "reviews", width: 72, className: "text-right" },
  { key: "products", width: 72, className: "text-right" },
  { key: "selected", width: 112, className: "text-right" },
  { key: "created_by", width: 120 },
  { key: "updated_at", width: 152 },
  { key: "actions", width: 152 },
];

/**
 * 裁剪表列表：一张普通表格，一行一张表。搜索 / 过滤 / 新建 portal 进页头右侧的挂点，
 * 状态全留在这里；行点击进详情，行尾是编辑 / 删除 / 签批。删除只对从未生效过的草稿开放。
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
  const { data: currentUser } = useUser();
  const { canManage } = useReviewTailoringPermissions(workspaceSlug, projectId);
  const {
    tailorings,
    isLoading,
    isMutating,
    error,
    fetchTailorings,
    createTailoring,
    retrieveTailoring,
    updateTailoring,
    deleteTailoring,
  } = useReviewTailorings(workspaceSlug, projectId);

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<TReviewTailoring | null>(null);
  /** 正在编辑的那张表；描述要等详情回来才有 */
  const [editing, setEditing] = useState<(TEditTailoringTarget & { id: string }) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [inbox, setInbox] = useState<{ isOpen: boolean; initialId?: string }>({ isOpen: false });
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  const [countHost, setCountHost] = useState<HTMLElement | null>(null);

  // 挂点在同一次提交里由页头渲染出来，layout effect 时 DOM 已就绪
  useLayoutEffect(() => {
    setActionsHost(document.getElementById(REVIEW_TAILORINGS_HEADER_ACTIONS_ID));
    setCountHost(document.getElementById(REVIEW_TAILORINGS_HEADER_COUNT_ID));
  }, []);

  const filterConfigs = useTailoringFiltersConfig({
    tailorings,
    workspaceSlug,
    currentUser: currentUser as IUserLite | undefined,
  });
  const filter = useTailoringFilter({ configs: filterConfigs, projectId });
  const conditions = filter.allConditionsForDisplay;

  const keyword = search.trim().toLowerCase();
  const visible = tailorings.filter(
    (item) =>
      (!keyword || item.title.toLowerCase().includes(keyword)) &&
      tailoringMatchesConditions(item, conditions, currentUser?.id)
  );
  const pendingMineCount = tailorings.filter((item) => item.my_approval_pending).length;
  /** 本项目里等我签或我签过的表，有才出页头的「待签批」 */
  const hasMySigning = tailorings.some((item) => item.my_approval_pending || item.my_approval_action);

  const detailPath = (id: string) => reviewTailoringDetailPath(workspaceSlug, projectId, id);

  const translateError = (requestError: unknown) => {
    const { message, code } = getTailoringError(requestError);
    // 领域错误码有中文文案，其余回落到服务端原文
    return code ? t(`${I18N}.errors.${code}`, { defaultValue: message }) : message;
  };

  const handleCreate = async (payload: TCreateReviewTailoringPayload) => {
    try {
      // 建完留在列表：新表已经乐观插到最前面，要进去自己点
      await createTailoring(payload);
      setIsCreateOpen(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.created`) });
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

  /** 先用列表行把弹窗打开，描述随后补上；取不到详情就关掉，免得存出一份空描述 */
  const handleOpenEdit = (item: TReviewTailoring) => {
    setEditing({
      id: item.id,
      title: item.title,
      tailoring_kind: item.tailoring_kind,
      stage_label: item.stage_label,
      description_html: undefined,
    });
    retrieveTailoring(item.id)
      .then((detail) =>
        setEditing((current) =>
          current?.id === item.id ? { ...current, description_html: detail?.description_html ?? null } : current
        )
      )
      .catch((requestError) => {
        setEditing(null);
        setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast.failed`), message: translateError(requestError) });
      });
  };

  const handleEdit = async (payload: Parameters<typeof updateTailoring>[1]) => {
    if (!editing) return;
    try {
      await updateTailoring(editing.id, payload);
      setEditing(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast.updated`) });
    } catch (requestError) {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast.failed`), message: translateError(requestError) });
    }
  };

  const headerActions = (
    <>
      <PageSearchInput
        searchQuery={search}
        updateSearchQuery={setSearch}
        placeholder={t(`${I18N}.search_placeholder`)}
      />
      <FiltersToggle filter={filter} enableQuickAddFilter={false} />
      {hasMySigning && (
        <Button variant="secondary" size="lg" onClick={() => setInbox({ isOpen: true })}>
          {t(`${I18N}.approval.inbox_button`)}
          {pendingMineCount > 0 && (
            <span className="font-semibold text-danger-primary tabular-nums">{pendingMineCount}</span>
          )}
        </Button>
      )}
      {canManage && (
        <Button variant="primary" size="lg" onClick={() => setIsCreateOpen(true)}>
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
      <table className={cn(PLAIN_TABLE, "min-w-[1180px] table-fixed")}>
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} className={cn(PLAIN_TH, "sticky top-0 z-[2]", column.className)}>
                {t(`${I18N}.list.${column.key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <TailoringRow
              key={item.id}
              item={item}
              canEdit={canManage}
              canDelete={canManage && item.status === EReviewTailoringStatus.DRAFT && item.revision === 0}
              onOpen={() => router.push(detailPath(item.id))}
              onEdit={() => handleOpenEdit(item)}
              onDelete={() => setToDelete(item)}
              onSign={item.my_approval_pending ? () => setInbox({ isOpen: true, initialId: item.id }) : undefined}
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

      <FiltersRow filter={filter} />

      {error && <p className="px-6 py-3 text-12 text-danger-primary">{error}</p>}

      <div className="min-h-0 flex-1 overflow-auto">{renderBody()}</div>

      <CreateTailoringModal
        isOpen={isCreateOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isSubmitting={isMutating}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <EditTailoringModal
        isOpen={Boolean(editing)}
        target={editing}
        isSubmitting={isMutating}
        onClose={() => setEditing(null)}
        onSubmit={(payload) => void handleEdit(payload)}
      />

      <ReviewTailoringApprovalInbox
        isOpen={inbox.isOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        tailorings={tailorings}
        initialId={inbox.initialId}
        onClose={() => setInbox({ isOpen: false })}
        onChanged={() => void fetchTailorings().catch(() => undefined)}
        onOpenTailoring={(tailoringId) => {
          setInbox({ isOpen: false });
          router.push(detailPath(tailoringId));
        }}
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
