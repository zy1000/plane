import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoring } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, renderFormattedDateTime } from "@plane/utils";
import { useReviewTailoringDetail } from "@/hooks/store/use-review-tailoring-detail";
import { PLAIN_ACTION, PLAIN_TABLE, PLAIN_TD, PLAIN_TH, formatMinute } from "./plain-table";
import { ReviewTailoringStatusText } from "./status-text";
import { ReviewTailoringApprovalPane } from "./tailoring-detail/approval-pane";
import { TailoringModalFooter, TailoringModalHeader } from "./tailoring-detail/modal-frame";

const I18N = "review_tailoring.approval";

type TInboxTab = "pending" | "done";

/**
 * 待签批：一张表列出「待我签批 / 我已签批」的裁剪表，点行尾的「签批」在同一个弹窗里打开那一张，
 * 签完回到列表。
 *
 * 列表页头「待签批」打开的是列表；行尾「签批」带着 `initialId` 进来，直接打开那一张。
 * 数据直接用列表页已有的行（`my_approval_pending` / `my_approval_action`），签的时候再按选中的表拉详情。
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
  /** 签完之后让列表重拉，两个页签跟着变 */
  onChanged: () => void;
  onOpenTailoring: (tailoringId: string) => void;
}) {
  const { t } = useTranslation();
  const pending = useMemo(() => tailorings.filter((item) => item.my_approval_pending), [tailorings]);
  const done = useMemo(
    () => tailorings.filter((item) => !item.my_approval_pending && item.my_approval_action),
    [tailorings]
  );
  const [tab, setTab] = useState<TInboxTab>("pending");
  /** 正在签的那一张；null = 在列表上 */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(initialId ?? null);
    setTab("pending");
  }, [isOpen, initialId]); // 只在打开时定位；之后列表刷新不打断当前选择

  const store = useReviewTailoringDetail(workspaceSlug, projectId, isOpen && selectedId ? selectedId : undefined);

  const handleDone = () => {
    onChanged();
    setSelectedId(null);
  };

  const list = tab === "pending" ? pending : done;
  const columnCount = tab === "done" ? 8 : 7;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VXL}>
      {selectedId ? (
        <ReviewTailoringApprovalPane
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          store={store}
          onOpenTailoring={() => onOpenTailoring(selectedId)}
          onBack={() => setSelectedId(null)}
          onClose={onClose}
          onDone={handleDone}
        />
      ) : (
        <div className="flex max-h-[min(88vh,780px)] min-h-[26rem] flex-col">
          <TailoringModalHeader title={t(`${I18N}.inbox_title`)} onClose={onClose} />
          <div role="tablist" className="flex shrink-0 items-center gap-x-1 border-b border-subtle px-3">
            {(["pending", "done"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={cn(
                  "-mb-px flex h-10 items-center gap-1.5 border-b-2 px-3 text-13 transition-colors",
                  tab === key
                    ? "border-accent-strong font-semibold text-primary"
                    : "border-transparent font-medium text-secondary hover:text-primary"
                )}
                onClick={() => setTab(key)}
              >
                {t(key === "pending" ? `${I18N}.tab_pending` : `${I18N}.tab_done`)}
                <span className="font-normal text-placeholder tabular-nums">
                  {key === "pending" ? pending.length : done.length}
                </span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className={cn(PLAIN_TABLE, "table-fixed")}>
              <colgroup>
                <col />
                <col style={{ width: 144 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 152 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 96 }} />
                {tab === "done" && <col style={{ width: 176 }} />}
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(PLAIN_TH, "sticky top-0 z-[2] pl-6")}>{t("review_tailoring.title")}</th>
                  <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.prop_kind`)}</th>
                  <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.prop_submitter`)}</th>
                  <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.prop_submitted_at`)}</th>
                  <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.col_round`)}</th>
                  <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.col_progress`)}</th>
                  {tab === "done" && (
                    <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t(`${I18N}.col_my_decision`)}</th>
                  )}
                  <th className={cn(PLAIN_TH, "sticky top-0 z-[2]")}>{t("review_tailoring.list.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className="border-b border-subtle px-6 py-10 text-center text-13 text-tertiary"
                    >
                      {t(tab === "pending" ? `${I18N}.empty_pending` : `${I18N}.empty_done`)}
                    </td>
                  </tr>
                )}
                {list.map((item) => (
                  <tr key={item.id} className="hover:bg-layer-1">
                    <td className={cn(PLAIN_TD, "pl-6")}>
                      <button
                        type="button"
                        className="block max-w-full truncate font-medium text-accent-primary hover:underline"
                        title={item.title}
                        onClick={() => onOpenTailoring(item.id)}
                      >
                        {item.title}
                      </button>
                    </td>
                    <td className={cn(PLAIN_TD, "truncate")}>{t(`review_tailoring.kind.${item.tailoring_kind}`)}</td>
                    <td className={cn(PLAIN_TD, "truncate")}>{item.submitted_by_detail?.display_name ?? "—"}</td>
                    <td className={cn(PLAIN_TD, "whitespace-nowrap text-secondary tabular-nums")}>
                      {item.submitted_at ? formatMinute(renderFormattedDateTime(item.submitted_at)) : "—"}
                    </td>
                    <td className={cn(PLAIN_TD, "whitespace-nowrap")}>
                      {t(`${I18N}.round_label`, { round: item.round })}
                    </td>
                    <td className={cn(PLAIN_TD, "whitespace-nowrap tabular-nums")}>
                      {item.approval_approved} / {item.approval_total}
                    </td>
                    {tab === "done" && (
                      <td className={PLAIN_TD}>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span
                            className={
                              item.my_approval_action === "approved" ? "text-success-primary" : "text-danger-primary"
                            }
                          >
                            {t(
                              item.my_approval_action === "approved"
                                ? `${I18N}.status_approved`
                                : `${I18N}.status_rejected`
                            )}
                          </span>
                          {/* 我签过的表可能已经生效或被驳回，把当前状态带上 */}
                          <ReviewTailoringStatusText status={item.status} className="text-tertiary" />
                        </span>
                      </td>
                    )}
                    <td className={PLAIN_TD}>
                      <button
                        type="button"
                        className={cn(PLAIN_ACTION, tab === "pending" && "font-semibold")}
                        onClick={() => setSelectedId(item.id)}
                      >
                        {t(tab === "pending" ? `${I18N}.sign` : `${I18N}.view_short`)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TailoringModalFooter>
            <Button variant="secondary" size="xl" onClick={onClose}>
              {t("close")}
            </Button>
          </TailoringModalFooter>
        </div>
      )}
    </ModalCore>
  );
});
