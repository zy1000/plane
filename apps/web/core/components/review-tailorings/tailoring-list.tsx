import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Plus, Scissors, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCreateReviewTailoringPayload, TReviewTailoring } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import { useAppRouter } from "@/hooks/use-app-router";
import { getTailoringError, useReviewTailorings } from "@/hooks/store/use-review-tailorings";
import { CreateTailoringModal } from "./create-tailoring-modal";
import { useReviewTailoringPermissions } from "./permissions";
import { ReviewTailoringStatusBadge } from "./status-badge";

const I18N = "review_tailoring";

/** 裁剪表列表。行点击进详情，删除只对从未生效过的草稿开放 */
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<TReviewTailoring | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return tailorings;
    return tailorings.filter(
      (item) =>
        item.title.toLowerCase().includes(keyword) ||
        (item.stage_detail?.label ?? "").toLowerCase().includes(keyword)
    );
  }, [tailorings, search]);

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
      if (created) router.push(`/${workspaceSlug}/projects/${projectId}/review-tailorings/${created.id}`);
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

  if (isLoading) {
    return (
      <Loader className="space-y-3 p-6">
        <Loader.Item height="32px" />
        <Loader.Item height="180px" />
      </Loader>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-6 py-3">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-tertiary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(`${I18N}.search_placeholder`)}
            className="focus:border-accent-primary h-8 w-56 rounded border border-subtle bg-surface-1 pr-2 pl-7 text-12 text-primary outline-none"
          />
        </div>
        {canManage && (
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setIsCreateOpen(true)}>
            <Plus className="size-3.5" />
            {t(`${I18N}.create`)}
          </Button>
        )}
      </div>

      {error && <p className="px-6 py-3 text-12 text-danger-primary">{error}</p>}

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Scissors className="size-8 text-placeholder" />
            <p className="text-14 font-medium text-primary">{t(`${I18N}.empty.title`)}</p>
            <p className="max-w-sm text-12 text-tertiary">{t(`${I18N}.empty.description`)}</p>
          </div>
        ) : (
          <Table className="min-w-full border-separate border-spacing-0 border-t border-l border-subtle">
            <TableHeader className="sticky top-0 z-[2] bg-layer-1">
              <TableRow>
                {["title", "stage", "status", "revision", "products", "selected", "created_by", "created_at", "approved_at"].map(
                  (key) => (
                    <TableHead
                      key={key}
                      className="border-r border-b border-subtle px-3 py-2 text-left whitespace-nowrap"
                    >
                      {t(`${I18N}.list.${key}`)}
                    </TableHead>
                  )
                )}
                <TableHead className="w-16 border-r border-b border-subtle px-3 py-2 text-left">
                  {t(`${I18N}.list.actions`)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const canDelete = canManage && item.status === EReviewTailoringStatus.DRAFT && item.revision === 0;
                return (
                  <TableRow
                    key={item.id}
                    className="group cursor-pointer bg-surface-1 hover:bg-surface-2"
                    onClick={() =>
                      router.push(`/${workspaceSlug}/projects/${projectId}/review-tailorings/${item.id}`)
                    }
                  >
                    <TableCell className="max-w-[280px] border-r border-b border-subtle px-3 py-2">
                      <span className="block truncate text-13 font-medium text-primary">{item.title}</span>
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                      {item.stage_detail ? (
                        <DictionaryValueTag
                          label={item.stage_detail.label}
                          color={resolveDictionaryItemColor(item.stage_detail)}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2">
                      <ReviewTailoringStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                      {item.revision === 0
                        ? t(`${I18N}.list.never_effective`)
                        : t(`${I18N}.list.revision_value`, { count: item.revision })}
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2 tabular-nums">
                      {item.product_count}
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2 tabular-nums whitespace-nowrap">
                      {t(`${I18N}.list.selected_value`, {
                        selected: item.selected_count,
                        total: item.item_count,
                      })}
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                      {item.created_by_detail?.display_name ?? "—"}
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                      {renderFormattedDate(item.created_at) ?? "—"}
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2 whitespace-nowrap">
                      {item.approved_at ? renderFormattedDate(item.approved_at) : "—"}
                    </TableCell>
                    <TableCell className="border-r border-b border-subtle px-3 py-2">
                      {canDelete && (
                        <button
                          type="button"
                          title={t(`${I18N}.actions.delete`)}
                          className={cn(
                            "rounded p-1 text-tertiary opacity-0 transition",
                            "hover:bg-danger-subtle hover:text-danger-primary group-hover:opacity-100"
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            setToDelete(item);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <CreateTailoringModal
        isOpen={isCreateOpen}
        isSubmitting={isMutating}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
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
