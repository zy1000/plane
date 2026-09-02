/**
 * 提交评审：选本次的评审人与通过规则，填变更原因。单条与批量共用。
 *
 * 评审人与规则只对这一张变更单有效，产品级不再持有 —— 所以每次打开都从空白开始。
 */
import { useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IUserLite, TRequirementApprovalSpec, TRequirementChangeType } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useProductMembers } from "@/hooks/store/use-product-members";
import { useUser } from "@/hooks/store/user";
import { RequirementApprovalRuleFields } from "./approval-rule-fields";
import { useSubmitReviewForm } from "./use-submit-review-form";

export function SubmitReviewModal({
  isOpen,
  isSubmitting,
  workspaceSlug,
  productId,
  changeType,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  workspaceSlug: string | undefined;
  productId: string | undefined;
  /** "delete" 时这张单是删除评审：标题要说清楚，通过即删行 */
  changeType?: TRequirementChangeType;
  onClose: () => void;
  onSubmit: (payload: TRequirementApprovalSpec & { reason: string }) => void;
}) {
  const { t } = useTranslation();
  const { members } = useProductMembers(workspaceSlug, productId);
  const { data: currentUser } = useUser();
  const form = useSubmitReviewForm({ isOpen });

  /** 候选池 = 产品成员 ∪ 当前用户：提交人可以把自己选为评审人 */
  const memberOptions = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    members.forEach((membership) => byId.set(membership.member, membership.member_detail));
    if (currentUser) byId.set(currentUser.id, currentUser);
    return Array.from(byId.values());
  }, [currentUser, members]);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">
          {t(
            changeType === "delete"
              ? "workspace_products.requirements.approval.submit.delete_title"
              : "workspace_products.requirements.approval.submit.title"
          )}
        </h2>

        <RequirementApprovalRuleFields
          className="mt-4"
          memberOptions={memberOptions}
          approverIds={form.approverIds}
          approvalType={form.approvalType}
          requiredCount={form.requiredCount}
          onApproverIdsChange={form.setApproverIds}
          onApprovalTypeChange={form.setApprovalType}
          onRequiredCountChange={form.setRequiredCount}
          approversHelp={
            form.canSubmit ? undefined : t("workspace_products.requirements.approval.submit.approvers_required")
          }
        />

        <label className="mt-6 block">
          <span className="mb-2 block text-12 font-medium text-primary">
            {t("workspace_products.requirements.approval.submit.reason")}
          </span>
          <textarea
            value={form.reason}
            onChange={(event) => form.setReason(event.target.value)}
            rows={6}
            maxLength={2000}
            className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2.5 text-12 leading-5 text-primary outline-none"
          />
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting}
            disabled={!form.canSubmit}
            onClick={() => onSubmit(form.buildPayload())}
          >
            {t("workspace_products.requirements.approval.submit.confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
