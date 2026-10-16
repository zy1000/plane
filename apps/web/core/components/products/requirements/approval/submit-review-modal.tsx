/**
 * 提交评审：列出这次一起提交的需求，选本次的审批人与通过规则，填提交说明。单条与批量共用。
 *
 * 审批人与规则只对这一张变更单有效，产品级不再持有 —— 所以每次打开都从空白开始。
 */
import { useMemo } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IUserLite, TRequirement, TRequirementApprovalSpec, TRequirementChangeType } from "@plane/types";
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
  requirementIds = [],
  requirements = [],
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  workspaceSlug: string | undefined;
  productId: string | undefined;
  /** "delete" 时这张单是删除评审：标题要说清楚，通过即删行 */
  changeType?: TRequirementChangeType;
  /** 这次提交的需求 id —— 决定副标题里的条数 */
  requirementIds?: string[];
  /** 调用方手里的行数据，按 id 匹配出编号 / 标题 / 版本；匹配不到的行不列出 */
  requirements?: TRequirement[];
  onClose: () => void;
  onSubmit: (payload: TRequirementApprovalSpec & { reason: string }) => void;
}) {
  const { t } = useTranslation();
  const { members } = useProductMembers(workspaceSlug, productId);
  const { data: currentUser } = useUser();
  const form = useSubmitReviewForm({ isOpen });
  const isDelete = changeType === "delete";

  /** 候选池 = 产品成员 ∪ 当前用户：提交人可以把自己选为审批人 */
  const memberOptions = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    members.forEach((membership) => byId.set(membership.member, membership.member_detail));
    if (currentUser) byId.set(currentUser.id, currentUser);
    return Array.from(byId.values());
  }, [currentUser, members]);

  const rows = useMemo(() => {
    const byId = new Map(requirements.map((row) => [row.id, row]));
    return requirementIds.map((id) => byId.get(id)).filter((row): row is TRequirement => Boolean(row));
  }, [requirementIds, requirements]);
  const count = requirementIds.length || rows.length;

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
      className="sm:max-w-[640px]"
    >
      <div className="flex max-h-[90vh] min-h-0 flex-col">
        <div className="flex shrink-0 items-start gap-3 rounded-t-lg border-b border-subtle px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-16 leading-6 font-semibold text-primary">
              {t(
                isDelete
                  ? "workspace_products.requirements.approval.submit.delete_title"
                  : "workspace_products.requirements.approval.submit.title"
              )}
            </h2>
            {count > 0 && (
              <p className="mt-0.5 text-13 text-tertiary">
                {t(
                  isDelete
                    ? "workspace_products.requirements.approval.submit.subtitle_delete"
                    : "workspace_products.requirements.approval.submit.subtitle",
                  { count }
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          data-modal-wheel-scroll
          className="scrollbar-sm vertical-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5"
        >
          {rows.length > 0 && <SubmitReviewRequirementList rows={rows} isDelete={isDelete} />}

          <RequirementApprovalRuleFields
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

          <div>
            <label htmlFor="submit-review-reason" className="mb-2 flex items-center text-13 leading-5 font-medium text-primary">
              {t("workspace_products.requirements.approval.submit.note_label")}
              <span className="ml-1.5 font-normal text-tertiary">{t("requirement_grid.data.optional")}</span>
            </label>
            <textarea
              id="submit-review-reason"
              value={form.reason}
              onChange={(event) => form.setReason(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={t("workspace_products.requirements.approval.submit.note_placeholder")}
              className="block w-full resize-none rounded-lg border border-subtle-1 bg-layer-2 px-3 py-2 text-14 leading-[22px] text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-lg border-t border-subtle px-6 py-3.5">
          <Button variant="secondary" size="xl" disabled={isSubmitting} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="xl"
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

/** 这次一起提交的需求：编号 + 标题，右侧是版本走向（草稿 → v1 / v1 → v2 / v1 → 删除） */
function SubmitReviewRequirementList({ rows, isDelete }: { rows: TRequirement[]; isDelete: boolean }) {
  const { t } = useTranslation();
  return (
    <ul className="scrollbar-sm vertical-scrollbar max-h-50 shrink-0 divide-y divide-subtle overflow-y-auto rounded-[10px] border border-subtle bg-layer-1">
      {rows.map((row) => {
        const base = row.approved_version;
        return (
          <li key={row.id} className="flex h-10 min-w-0 items-center gap-2.5 px-3.5 text-14">
            {row.display_id && (
              <span className="w-24 shrink-0 truncate font-mono text-12 font-medium text-tertiary">{row.display_id}</span>
            )}
            <span className="min-w-0 flex-1 truncate font-medium text-primary" title={row.title}>
              {row.title || t("requirement_grid.data.untitled")}
            </span>
            <span className="shrink-0 text-12 text-tertiary">
              {base === null ? t("workspace_products.requirements.approval.submit.draft") : <Version value={base} />}
              {" → "}
              {isDelete ? (
                <span className="text-danger-primary">{t("workspace_products.requirements.approval.submit.deleted")}</span>
              ) : (
                <Version value={(base ?? 0) + 1} accent />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const Version = ({ value, accent = false }: { value: number; accent?: boolean }) => (
  <span className={accent ? "font-mono font-medium text-accent-primary" : "font-mono font-medium"}>v{value}</span>
);
