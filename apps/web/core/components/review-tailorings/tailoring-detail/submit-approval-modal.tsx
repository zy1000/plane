import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IUserLite, TReviewTailoringApprovalType, TSubmitReviewTailoringPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { RequirementApprovalRuleFields } from "@/components/products/requirements/approval/approval-rule-fields";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";

/** 裁剪表必须有人签批，所以规则里没有 none */
const TAILORING_APPROVAL_TYPES: TReviewTailoringApprovalType[] = ["any", "all", "n_of_m"];

/** n_of_m 的合法区间是 1..签批人数；没人时按 1 兜底 */
const clamp = (count: number, total: number) => Math.min(Math.max(count, 1), total || 1);

/**
 * 提交签批：选本轮的签批人与通过规则。
 *
 * 每次打开都从空白开始 —— 规则与名单只对这一轮有效，上一轮选了谁与这一轮无关。
 * 复用需求变更单那套规则控件，只是把 none 去掉、文案换成裁剪表自己的。
 */
export const SubmitApprovalModal = observer(function SubmitApprovalModal({
  isOpen,
  isSubmitting,
  projectId,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  projectId: string;
  onClose: () => void;
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
  const memberOptions = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    for (const memberId of getProjectMemberIds(projectId, false) ?? []) {
      const detail = getProjectMemberDetails(memberId, projectId);
      if (detail?.member) byId.set(detail.member.id, detail.member as unknown as IUserLite);
    }
    if (currentUser) byId.set(currentUser.id, currentUser);
    return Array.from(byId.values());
  }, [projectId, getProjectMemberIds, getProjectMemberDetails, currentUser]);

  const canSubmit = approverIds.length > 0;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">{t("review_tailoring.approval.submit_title")}</h2>

        <RequirementApprovalRuleFields
          className="mt-4"
          memberOptions={memberOptions}
          approverIds={approverIds}
          approvalType={approvalType as never}
          requiredCount={requiredCount}
          approvalTypes={TAILORING_APPROVAL_TYPES as never}
          labelI18nPrefix="review_tailoring.approval"
          approversLabel={t("review_tailoring.approval.approvers")}
          approversPlaceholder={t("review_tailoring.approval.select_approvers")}
          ruleLabel={t("review_tailoring.approval.rule")}
          radioGroupName="review-tailoring-approval-type"
          approversHelp={
            canSubmit
              ? t("review_tailoring.approval.approvers_help")
              : t("review_tailoring.approval.approvers_required")
          }
          onApproverIdsChange={(ids) => {
            setApproverIds(ids);
            setRequiredCount((current) => clamp(current, ids.length));
          }}
          onApprovalTypeChange={(type) => setApprovalType(type as TReviewTailoringApprovalType)}
          onRequiredCountChange={setRequiredCount}
        />

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
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
            {t("review_tailoring.approval.submit")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
