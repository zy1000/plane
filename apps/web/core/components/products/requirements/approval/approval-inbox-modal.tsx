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
import { Check, ExternalLink, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementApprovalInboxItem } from "@plane/types";
import { Avatar, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate } from "@plane/utils";
import { useRequirementApprovalInbox } from "@/hooks/store/use-requirement-changes";
import { CHANGE_TYPE_PILL, PILL_BASE } from "../change/styles";

const TABS = ["pending", "processed"] as const;

type TProps = {
  isOpen: boolean;
  inbox: ReturnType<typeof useRequirementApprovalInbox>;
  onClose: () => void;
  onOpenChangeRequest: (item: TRequirementApprovalInboxItem) => void;
};

export function ApprovalInboxModal({ isOpen, inbox, onClose, onOpenChangeRequest }: TProps) {
  const { t } = useTranslation();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const act = async (item: TRequirementApprovalInboxItem, action: "approved" | "rejected") => {
    try {
      await inbox.act(item, action, action === "rejected" ? comment.trim() : undefined);
      setRejectingId(null);
      setComment("");
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

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="flex max-h-[70vh] flex-col">
        <header className="shrink-0 border-b border-subtle px-5 pt-4">
          <h2 className="text-15 font-semibold text-primary">{t("workspace_products.requirements.inbox.title")}</h2>
          <div className="mt-3 flex items-end gap-1">
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => inbox.setTab(value)}
                className={cn(
                  "relative flex h-9 items-center gap-1.5 px-3 text-12 transition-colors",
                  inbox.tab === value
                    ? "font-medium text-accent-primary after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:bg-accent-primary"
                    : "text-secondary hover:text-primary"
                )}
              >
                {t(`workspace_products.requirements.inbox.tabs.${value}`)}
                {value === "pending" && inbox.inbox.pending_count > 0 && (
                  <span className="grid size-4 place-items-center rounded-full bg-warning-primary text-10 text-on-color">
                    {inbox.inbox.pending_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {inbox.isLoading ? (
            <Loader className="space-y-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Loader.Item key={index} height="72px" />
              ))}
            </Loader>
          ) : inbox.error ? (
            <p className="py-10 text-center text-12 text-secondary">{inbox.error}</p>
          ) : !inbox.inbox.results.length ? (
            <p className="py-10 text-center text-13 text-tertiary">
              {t(`workspace_products.requirements.inbox.empty.${inbox.tab}`)}
            </p>
          ) : (
            <ul className="space-y-2">
              {inbox.inbox.results.map((item) => (
                <li key={item.id} className="rounded-md border border-subtle p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-layer-2 px-1.5 py-0.5 text-10 text-secondary">
                      {item.product_name}
                    </span>
                    <span className="shrink-0 text-12 font-medium text-accent-primary">CR-{item.sequence_id}</span>
                    <span className="min-w-0 flex-1 truncate text-12 text-primary">
                      {item.reason || t("workspace_products.requirements.change.untitled")}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenChangeRequest(item)}
                      className="flex shrink-0 items-center gap-1 text-11 text-secondary hover:text-accent-primary"
                    >
                      <ExternalLink className="size-3" />
                      {t("workspace_products.requirements.inbox.open")}
                    </button>
                  </div>

                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                    {item.requirement_previews.map((preview) => (
                      <span key={preview.id} className="flex max-w-56 items-center gap-1 text-11 text-secondary">
                        <span className={cn(PILL_BASE, CHANGE_TYPE_PILL[preview.change_type])}>
                          {t(`workspace_products.requirements.change.filters.${preview.change_type}`)}
                        </span>
                        <span className="truncate">{preview.title}</span>
                      </span>
                    ))}
                    {item.requirement_count > item.requirement_previews.length && (
                      <span className="text-11 text-tertiary">
                        {t("workspace_products.requirements.inbox.more", {
                          count: item.requirement_count - item.requirement_previews.length,
                        })}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <Avatar
                      size="sm"
                      name={item.created_by_detail?.display_name ?? ""}
                      src={getFileURL(item.created_by_detail?.avatar_url ?? "")}
                    />
                    <span className="min-w-0 flex-1 truncate text-11 text-tertiary">
                      {t("workspace_products.requirements.inbox.submitted_by", {
                        name: item.created_by_detail?.display_name ?? "",
                        date: renderFormattedDate(item.created_at),
                      })}
                    </span>
                    {inbox.tab === "processed" ? (
                      <span className="shrink-0 text-11 text-tertiary">
                        {item.my_action
                          ? t(`workspace_products.requirements.inbox.my_action.${item.my_action}`)
                          : ""}
                      </span>
                    ) : (
                      item.can_approve && (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={inbox.isMutating}
                            onClick={() => {
                              setRejectingId(rejectingId === item.id ? null : item.id);
                              setComment("");
                            }}
                          >
                            <X className="size-3" />
                            {t("workspace_products.requirements.change.bar.reject")}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={inbox.isMutating}
                            onClick={() => void act(item, "approved")}
                          >
                            <Check className="size-3" />
                            {t("workspace_products.requirements.change.bar.approve")}
                          </Button>
                        </span>
                      )
                    )}
                  </div>

                  {rejectingId === item.id && (
                    <div className="mt-2 border-t border-subtle pt-2">
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        rows={2}
                        maxLength={2000}
                        autoFocus
                        className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 leading-5 text-primary outline-none placeholder:text-placeholder"
                        placeholder={t("workspace_products.requirements.inbox.reject_placeholder")}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setRejectingId(null)}>
                          {t("cancel")}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={inbox.isMutating}
                          disabled={!comment.trim()}
                          onClick={() => void act(item, "rejected")}
                        >
                          {t("workspace_products.requirements.change.bar.reject")}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalCore>
  );
}
