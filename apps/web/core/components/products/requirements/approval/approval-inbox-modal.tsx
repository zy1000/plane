/**
 * 待我审批。
 *
 * 审批下沉到按需求之后，一次评审从「一张大单」变成 N 张小单，待办是分散的 —— 通知解决
 * 「发生的那一刻告诉你」，这里解决「过两天回头还找得到」。
 *
 * 就地审批只给「通过」一个快捷路径；驳回必须写理由，写理由的人多半也该先看看改了什么，
 * 所以驳回展开的是理由框而不是二次确认。要细看的走「查看」进对比页。
 */
import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementApprovalInboxItem } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useRequirementApprovalInbox } from "@/hooks/store/use-requirement-changes";
import { ApprovalInboxCard } from "./approval-inbox-card";

const TABS = ["pending", "processed"] as const;

type TProps = {
  isOpen: boolean;
  inbox: ReturnType<typeof useRequirementApprovalInbox>;
  onClose: () => void;
  onOpenChangeRequest: (item: TRequirementApprovalInboxItem) => void;
  onSettled?: () => void;
};

export function ApprovalInboxModal({ isOpen, inbox, onClose, onOpenChangeRequest, onSettled }: TProps) {
  const { t } = useTranslation();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const act = async (item: TRequirementApprovalInboxItem, action: "approved" | "rejected") => {
    try {
      await inbox.act(item, action, action === "rejected" ? comment.trim() : undefined);
      setRejectingId(null);
      setComment("");
      onSettled?.();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t(`workspace_products.requirements.inbox.toast.${action}`),
      });
    } catch (error) {
      const payload = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_products.requirements.inbox.toast.failed"),
      });
    }
  };

  /** 已办没有单独的总数接口：只在正看着已办、且加载完时用当前列表的条数 */
  const tabCount = (value: (typeof TABS)[number]) =>
    value === "pending"
      ? inbox.inbox.pending_count
      : inbox.tab === "processed" && !inbox.isLoading
        ? inbox.inbox.results.length
        : null;

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
      className="sm:max-w-[760px]"
    >
      <div className="flex h-[min(640px,85vh)] flex-col">
        <header className="shrink-0 rounded-t-lg border-b border-subtle px-6 pt-4">
          <div className="flex items-center gap-3">
            <h2 className="text-16 leading-6 font-semibold text-primary">
              {t("workspace_products.requirements.inbox.title")}
            </h2>
            <span className="text-13 text-tertiary">{t("workspace_products.requirements.inbox.caption")}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
            >
              <X className="size-4" />
            </button>
          </div>
          <div role="tablist" className="mt-1.5 flex items-end gap-6">
            {TABS.map((value) => {
              const isActive = inbox.tab === value;
              const count = tabCount(value);
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setRejectingId(null);
                    inbox.setTab(value);
                  }}
                  className={cn(
                    "relative -mb-px flex h-10.5 items-center gap-1.75 px-0.5 text-14 transition-colors",
                    isActive
                      ? "font-semibold text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent-primary"
                      : "font-medium text-tertiary hover:text-primary"
                  )}
                >
                  {t(`workspace_products.requirements.inbox.tabs.${value}`)}
                  {value === "pending"
                    ? count !== null &&
                      count > 0 && (
                        <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-warning-primary px-1.25 text-11 font-semibold text-on-color tabular-nums">
                          {count}
                        </span>
                      )
                    : count !== null && <span className="text-12 font-normal text-placeholder tabular-nums">{count}</span>}
                </button>
              );
            })}
          </div>
        </header>

        <div
          data-modal-wheel-scroll
          className="scrollbar-sm vertical-scrollbar min-h-0 flex-1 overflow-y-auto rounded-b-lg bg-surface-2 px-6 pt-4 pb-6"
        >
          {inbox.isLoading ? (
            <Loader className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Loader.Item key={index} height="148px" />
              ))}
            </Loader>
          ) : inbox.error ? (
            <p className="py-16 text-center text-13 text-secondary">{inbox.error}</p>
          ) : !inbox.inbox.results.length ? (
            <p className="py-16 text-center text-14 text-tertiary">
              {t(`workspace_products.requirements.inbox.empty.${inbox.tab}`)}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {inbox.inbox.results.map((item) => (
                <ApprovalInboxCard
                  key={item.id}
                  item={item}
                  tab={inbox.tab}
                  isMutating={inbox.isMutating}
                  isRejecting={rejectingId === item.id}
                  comment={comment}
                  onCommentChange={setComment}
                  onToggleReject={() => {
                    setRejectingId(rejectingId === item.id ? null : item.id);
                    setComment("");
                  }}
                  onApprove={() => void act(item, "approved")}
                  onReject={() => void act(item, "rejected")}
                  onOpen={() => onOpenChangeRequest(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalCore>
  );
}
