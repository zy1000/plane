import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle, Minus, Plus, Send, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IUserLite, TReviewTailoringApprovalType, TSubmitReviewTailoringPayload } from "@plane/types";
import { Avatar, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { TailoringModalHeader } from "./modal-header";
import type { TTailoringStats } from "./tailoring-matrix-model";

const I18N = "review_tailoring.approval";

/** 裁剪表必须有人签批，所以规则里没有 none */
const TAILORING_APPROVAL_TYPES: TReviewTailoringApprovalType[] = ["any", "all", "n_of_m"];

/** n_of_m 的合法区间是 1..签批人数；没人时按 1 兜底 */
const clamp = (count: number, total: number) => Math.min(Math.max(count, 1), total || 1);

/**
 * 提交签批：先给一张「你在提交什么」的摘要，再选本轮的签批人与通过规则。
 *
 * 缺原因的格子在这里就拦住（主按钮不可点 + 「去补齐」跳回矩阵并打开「只看缺原因」），
 * 不再等服务端 400 回来才知道。每次打开都从空白开始 —— 名单与规则只对这一轮有效。
 */
export const SubmitApprovalModal = observer(function SubmitApprovalModal({
  isOpen,
  isSubmitting,
  projectId,
  stats,
  onClose,
  onFixMissing,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  projectId: string;
  stats: TTailoringStats;
  onClose: () => void;
  onFixMissing: () => void;
  onSubmit: (payload: TSubmitReviewTailoringPayload) => void;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const {
    project: { getProjectMemberIds, getProjectMemberDetails },
  } = useMember();

  const [approvalType, setApprovalType] = useState<TReviewTailoringApprovalType>("any");
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [requiredCount, setRequiredCount] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    setApprovalType("any");
    setApproverIds([]);
    setRequiredCount(1);
  }, [isOpen]);

  /** 候选池 = 项目成员 ∪ 当前用户：提交人可以把自己列为签批人 */
  const memberById = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    for (const memberId of getProjectMemberIds(projectId, false) ?? []) {
      const detail = getProjectMemberDetails(memberId, projectId);
      if (detail?.member) byId.set(detail.member.id, detail.member as unknown as IUserLite);
    }
    if (currentUser) byId.set(currentUser.id, currentUser);
    return byId;
  }, [projectId, getProjectMemberIds, getProjectMemberDetails, currentUser]);

  const changeApprovers = (ids: string[]) => {
    setApproverIds(ids);
    setRequiredCount((current) => clamp(current, ids.length));
  };

  const hasMissing = stats.missing > 0;
  const canSubmit = approverIds.length > 0 && !hasMissing;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <TailoringModalHeader icon={<Send className="size-5" />} title={t(`${I18N}.submit_title`)} onClose={onClose} />

      <div className="flex flex-col gap-4.5 px-6 pb-1.5">
        <div className="grid grid-cols-3 divide-x divide-subtle overflow-hidden rounded-lg border border-subtle">
          <div className="flex flex-col gap-0.5 px-3.5 py-3">
            <span className="text-12 text-tertiary">{t(`${I18N}.summary_selected`)}</span>
            <span className="flex items-baseline gap-1 text-18 font-semibold text-primary tabular-nums">
              {stats.selected}
              <small className="text-12 font-normal text-placeholder">/ {stats.total}</small>
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-3.5 py-3">
            <span className="text-12 text-tertiary">{t(`${I18N}.summary_after`)}</span>
            <span className="flex items-baseline gap-1 text-18 font-semibold text-primary tabular-nums">
              {stats.toCreate}
              <small className="text-12 font-normal text-placeholder">{t(`${I18N}.summary_after_unit`)}</small>
            </span>
          </div>
          <div className={cn("flex flex-col gap-0.5 px-3.5 py-3", hasMissing && "bg-warning-subtle text-warning-primary")}>
            <span className={cn("text-12", !hasMissing && "text-tertiary")}>{t(`${I18N}.summary_missing`)}</span>
            <span className={cn("text-18 font-semibold tabular-nums", !hasMissing && "text-primary")}>
              {stats.missing}
            </span>
            {hasMissing && (
              <button
                type="button"
                className="w-fit text-12 font-medium text-accent-primary hover:underline"
                onClick={onFixMissing}
              >
                {t(`${I18N}.summary_fix`)}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-13 font-medium text-secondary">
            {t(`${I18N}.approvers`)}
            <span className="ml-1 text-danger-primary">*</span>
          </span>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-subtle bg-surface-1 px-2 py-1.5">
            {approverIds.map((id) => {
              const user = memberById.get(id);
              return (
                <span key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-layer-3 pr-1.5 pl-0.5 text-13 text-primary">
                  <Avatar size="md" name={user?.display_name ?? ""} src={getFileURL(user?.avatar_url ?? "")} />
                  {user?.display_name}
                  <button
                    type="button"
                    aria-label={t(`${I18N}.remove_approver`)}
                    className="grid size-4 place-items-center rounded-full text-placeholder hover:text-secondary"
                    onClick={() => changeApprovers(approverIds.filter((entry) => entry !== id))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <MemberDropdown
              multiple
              value={approverIds}
              onChange={changeApprovers}
              memberIds={[...memberById.keys()]}
              buttonVariant="transparent-with-text"
              buttonContainerClassName="min-w-0 flex-1 text-left"
              button={
                <span className="block px-1.5 py-1 text-13 text-placeholder">{t(`${I18N}.add_approver`)}</span>
              }
              placement="bottom-start"
            />
          </div>
          <span className="text-12 text-tertiary">{t(`${I18N}.approvers_help`)}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-13 font-medium text-secondary">{t(`${I18N}.rule`)}</span>
          <div className="flex h-10 divide-x divide-subtle overflow-hidden rounded-lg border border-subtle">
            {TAILORING_APPROVAL_TYPES.map((type) => {
              const isActive = approvalType === type;
              return (
                <div
                  key={type}
                  role="radio"
                  aria-checked={isActive}
                  tabIndex={0}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 text-13 transition-colors",
                    isActive
                      ? "bg-accent-subtle font-medium text-accent-primary"
                      : "text-secondary hover:bg-layer-transparent-hover"
                  )}
                  onClick={() => setApprovalType(type)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setApprovalType(type);
                  }}
                >
                  {type === "n_of_m" ? t(`${I18N}.n_of_m_short`) : t(`${I18N}.${type}`)}
                  {type === "n_of_m" && (
                    <span className="flex items-center gap-1 font-normal text-secondary tabular-nums">
                      <span className="inline-flex h-6.5 items-center rounded-md border border-subtle bg-surface-1">
                        <button
                          type="button"
                          aria-label="-"
                          className="grid h-full w-5.5 place-items-center text-placeholder hover:text-secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            setApprovalType("n_of_m");
                            setRequiredCount((current) => clamp(current - 1, approverIds.length));
                          }}
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="w-5 text-center text-12 font-semibold text-primary">{requiredCount}</span>
                        <button
                          type="button"
                          aria-label="+"
                          className="grid h-full w-5.5 place-items-center text-placeholder hover:text-secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            setApprovalType("n_of_m");
                            setRequiredCount((current) => clamp(current + 1, approverIds.length));
                          }}
                        >
                          <Plus className="size-3" />
                        </button>
                      </span>
                      <span className="text-12">/ {approverIds.length}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
        {hasMissing ? (
          <span className="flex flex-1 items-center gap-1.5 text-12 text-warning-primary">
            <AlertTriangle className="size-3.5" />
            {t(`${I18N}.missing_block`, { count: stats.missing })}
          </span>
        ) : (
          approverIds.length === 0 && (
            <span className="flex-1 text-12 text-tertiary">{t(`${I18N}.approvers_required`)}</span>
          )
        )}
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          loading={isSubmitting}
          disabled={!canSubmit || isSubmitting}
          onClick={() =>
            onSubmit({
              approval_type: approvalType,
              required_count: approvalType === "n_of_m" ? requiredCount : null,
              approver_ids: approverIds,
            })
          }
        >
          {t(`${I18N}.submit`)}
        </Button>
      </div>
    </ModalCore>
  );
});
