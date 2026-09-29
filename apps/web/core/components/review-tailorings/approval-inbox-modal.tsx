import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoring } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useReviewTailoringDetail } from "@/hooks/store/use-review-tailoring-detail";
import { formatUpdatedAt } from "./list/tailoring-row";
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
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VIIXL}>
      <div className="flex h-[min(88vh,720px)]">
        <aside className="flex w-66 shrink-0 flex-col border-r border-subtle bg-layer-1 px-3 pt-5 pb-3">
          <h2 className="px-2.5 text-16 font-semibold text-primary">{t(`${I18N}.inbox_title`)}</h2>
          <div role="tablist" className="mt-4 flex gap-5 border-b border-subtle px-2.5">
            {(["pending", "done"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-13 transition-colors",
                  tab === key
                    ? "border-accent-strong font-semibold text-primary"
                    : "border-transparent text-tertiary hover:text-secondary"
                )}
                onClick={() => setTab(key)}
              >
                {t(key === "pending" ? `${I18N}.tab_pending` : `${I18N}.tab_done`)}
                {key === "pending" && pending.length > 0 && (
                  <span className="font-semibold text-accent-primary tabular-nums">{pending.length}</span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-2.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {list.length === 0 && (
              <p className="px-2 py-8 text-center text-13 text-tertiary">
                {t(tab === "pending" ? `${I18N}.empty_pending` : `${I18N}.empty_done`)}
              </p>
            )}
            {list.map((item) => {
              const isActive = item.id === selectedId;
              const submitter = item.submitted_by_detail;
              const meta = [
                t(`${I18N}.inbox_item_meta`, { name: submitter?.display_name ?? "", round: item.round }),
                // 我已签批里的表可能已经生效或被驳回，把当前状态带上
                ...(tab === "done" ? [t(`review_tailoring.status.${item.status}`)] : []),
              ].join(" · ");
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-md px-2.5 py-2.5 text-left transition-colors",
                    isActive ? "bg-accent-subtle" : "hover:bg-layer-transparent-hover"
                  )}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-14 font-medium text-primary">{item.title}</span>
                    {tab === "pending" ? (
                      <span className="shrink-0 text-12 text-secondary tabular-nums">
                        {t(`${I18N}.inbox_progress`, { approved: item.approval_approved, total: item.approval_total })}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "shrink-0 text-12",
                          item.my_approval_action === "approved" ? "text-success-primary" : "text-danger-primary"
                        )}
                      >
                        {t(item.my_approval_action === "approved" ? `${I18N}.acted_approved` : `${I18N}.acted_rejected`)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-12 text-tertiary">
                    <span className="min-w-0 flex-1 truncate">{meta}</span>
                    <span className="shrink-0">
                      {item.submitted_at ? formatUpdatedAt(item.submitted_at, currentLocale, t) : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {selectedId ? (
          <ReviewTailoringApprovalPane
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            store={store}
            onOpenTailoring={() => onOpenTailoring(selectedId)}
            onClose={onClose}
            onDone={handleDone}
          />
        ) : (
          <section className="relative flex flex-1">
            <button
              type="button"
              aria-label={t("cancel")}
              className="absolute top-3.5 right-4 grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
            <p className="m-auto text-13 text-tertiary">{t(`${I18N}.select_hint`)}</p>
          </section>
        )}
      </div>
    </ModalCore>
  );
});
