import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Inbox, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoring } from "@plane/types";
import { Avatar, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { useReviewTailoringDetail } from "@/hooks/store/use-review-tailoring-detail";
import { formatUpdatedAt } from "./list/tailoring-row";
import { TailoringCountBadge } from "./pending-approval-badge";
import { ReviewTailoringApprovalPane } from "./tailoring-detail/approval-pane";

const I18N = "review_tailoring.approval";

type TInboxTab = "pending" | "done";

/**
 * 签批收件箱：左边「待我签批 / 我已签批」两个列表，右边签当前选中的这张。
 *
 * 列表页头「待我签批」与行尾「签批」都打开它（后者定位到那一行）。左侧数据直接用列表页
 * 已有的行（`my_approval_pending` / `my_approval_action`），右侧按选中的表拉详情。
 * 签完刷新列表并自动切到下一张待签的。
 */
export const ReviewTailoringApprovalInbox = observer(function ReviewTailoringApprovalInbox({
  isOpen,
  workspaceSlug,
  projectId,
  tailorings,
  initialId,
  onClose,
  onChanged,
  onOpenTailoring,
}: {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  tailorings: TReviewTailoring[];
  initialId?: string;
  onClose: () => void;
  /** 签完之后让列表重拉，左侧两个列表跟着变 */
  onChanged: () => void;
  onOpenTailoring: (tailoringId: string) => void;
}) {
  const { t, currentLocale } = useTranslation();
  const pending = useMemo(() => tailorings.filter((item) => item.my_approval_pending), [tailorings]);
  const done = useMemo(
    () => tailorings.filter((item) => !item.my_approval_pending && item.my_approval_action),
    [tailorings]
  );
  const [tab, setTab] = useState<TInboxTab>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const startId = initialId ?? pending[0]?.id ?? done[0]?.id ?? null;
    setSelectedId(startId);
    setTab(startId && !pending.some((item) => item.id === startId) && done.some((item) => item.id === startId) ? "done" : "pending");
  }, [isOpen, initialId]); // 只在打开时定位；之后列表刷新不打断当前选择

  const store = useReviewTailoringDetail(workspaceSlug, projectId, isOpen && selectedId ? selectedId : undefined);

  const handleDone = () => {
    const rest = pending.filter((item) => item.id !== selectedId);
    onChanged();
    if (rest.length > 0) setSelectedId(rest[0].id);
  };

  const list = tab === "pending" ? pending : done;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VIXL}>
      <div className="flex h-[min(88vh,760px)] flex-col">
        <div className="flex items-center gap-3 border-b border-subtle px-6 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent-primary">
            <Inbox className="size-4" />
          </span>
          <h2 className="flex-1 text-16 font-semibold text-primary">{t(`${I18N}.inbox_title`)}</h2>
          <button
            type="button"
            aria-label={t("cancel")}
            className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr]">
          <aside className="flex min-h-0 flex-col border-r border-subtle bg-layer-1">
            <div role="tablist" className="m-3 flex gap-0.5 rounded-lg bg-layer-3 p-0.5">
              {(["pending", "done"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  className={cn(
                    "flex h-7.5 flex-1 items-center justify-center gap-1.5 rounded-md text-13 transition-colors",
                    tab === key ? "bg-surface-1 font-medium text-primary shadow-raised-100" : "text-tertiary hover:text-secondary"
                  )}
                  onClick={() => setTab(key)}
                >
                  {t(key === "pending" ? `${I18N}.tab_pending` : `${I18N}.tab_done`)}
                  {key === "pending" && <TailoringCountBadge count={pending.length} />}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-3">
              {list.length === 0 && (
                <p className="px-2 py-8 text-center text-13 text-tertiary">
                  {t(tab === "pending" ? `${I18N}.empty_pending` : `${I18N}.empty_done`)}
                </p>
              )}
              {list.map((item) => {
                const isActive = item.id === selectedId;
                const submitter = item.submitted_by_detail;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      isActive
                        ? "border-subtle bg-surface-1 shadow-[inset_3px_0_0_var(--background-color-accent-primary)]"
                        : "border-transparent hover:bg-layer-transparent-hover"
                    )}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-14 font-medium text-primary">{item.title}</span>
                      <span className="shrink-0 text-12 text-placeholder">
                        {item.submitted_at ? formatUpdatedAt(item.submitted_at, currentLocale, t) : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-12 text-tertiary">
                      {submitter && (
                        <Avatar size="sm" name={submitter.display_name} src={getFileURL(submitter.avatar_url ?? "")} />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {t(`${I18N}.inbox_item_meta`, { name: submitter?.display_name ?? "", round: item.round })}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {item.approval_approved}/{item.approval_total}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            {selectedId ? (
              <ReviewTailoringApprovalPane
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                store={store}
                footerHint={pending.length > 1 ? t(`${I18N}.auto_next`) : undefined}
                onOpenTailoring={() => onOpenTailoring(selectedId)}
                onDone={handleDone}
              />
            ) : (
              <p className="m-auto text-13 text-tertiary">{t(`${I18N}.select_hint`)}</p>
            )}
          </section>
        </div>
      </div>
    </ModalCore>
  );
});
