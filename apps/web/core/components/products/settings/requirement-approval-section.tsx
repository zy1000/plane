import { Lock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalType, IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import {
  RequirementApprovalSettings,
  SettingsField,
} from "@/components/products/requirements/requirement-approval-settings";

/** 产品通用设置里的需求审批草稿 —— 不含 policy owner */
export type TProductRequirementApprovalDraft = {
  approver_ids: string[];
  approval_type: TRequirementApprovalType;
  required_count: number | null;
};

type TProductRequirementApprovalSectionProps = {
  draft: TProductRequirementApprovalDraft;
  readOnly?: boolean;
  memberOptions: IUserLite[];
  onChange: (draft: TProductRequirementApprovalDraft) => void;
};

function ReadOnlyValues({
  draft,
  memberOptions,
}: {
  draft: TProductRequirementApprovalDraft;
  memberOptions: IUserLite[];
}) {
  const { t } = useTranslation();
  const approvers = draft.approver_ids
    .map((id) => memberOptions.find((member) => member.id === id))
    .filter((member): member is IUserLite => Boolean(member));

  return (
    <div className="space-y-6">
      <SettingsField label={t("workspace_products.requirements.fields.approvers")}>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {approvers.length ? (
            approvers.map((member) => (
              <span
                key={member.id}
                className="flex h-6 items-center gap-1.5 rounded bg-layer-2 px-1.5 text-11 text-primary"
              >
                <Avatar
                  name={member.display_name}
                  src={getFileURL(member.avatar_url ?? "")}
                  size="sm"
                  className="shrink-0"
                />
                <span className="max-w-32 truncate">{member.display_name}</span>
              </span>
            ))
          ) : (
            <span className="text-12 text-placeholder">
              {t("workspace_products.requirements.approval.unconfigured")}
            </span>
          )}
        </div>
      </SettingsField>
      <SettingsField label={t("workspace_products.requirements.fields.approval_rule")}>
        <p className="pt-1 text-12 text-primary">
          {t(`workspace_products.requirements.configuration.rule_short.${draft.approval_type}`, {
            count: draft.required_count ?? 1,
          })}
        </p>
      </SettingsField>
      <div className="flex items-start gap-2 rounded-md bg-layer-1 px-3 py-2.5 text-12 text-secondary">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-tertiary" />
        {t("workspace_products.requirements.configuration.read_only_hint")}
      </div>
    </div>
  );
}

/**
 * 产品通用设置中的需求审批：审批人 + 通过规则。
 */
export function ProductRequirementApprovalSection({
  draft,
  readOnly = false,
  memberOptions,
  onChange,
}: TProductRequirementApprovalSectionProps) {
  const updateDraft = (patch: Partial<TProductRequirementApprovalDraft>) => {
    if (readOnly) return;
    onChange({ ...draft, ...patch });
  };

  const handleApproverIdsChange = (nextApproverIds: string[]) => {
    if (draft.approval_type !== "n_of_m") {
      updateDraft({ approver_ids: nextApproverIds });
      return;
    }
    if (nextApproverIds.length === 0) {
      updateDraft({ approver_ids: [], approval_type: "any", required_count: null });
      return;
    }
    updateDraft({
      approver_ids: nextApproverIds,
      required_count: Math.min(Math.max(draft.required_count ?? 1, 1), nextApproverIds.length),
    });
  };

  const handleApprovalTypeChange = (approvalType: TRequirementApprovalType) =>
    updateDraft({
      approval_type: approvalType,
      required_count:
        approvalType === "n_of_m" ? Math.min(Math.max(draft.required_count ?? 1, 1), draft.approver_ids.length) : null,
    });

  if (readOnly) {
    return <ReadOnlyValues draft={draft} memberOptions={memberOptions} />;
  }

  return (
    <RequirementApprovalSettings
      radioGroupName="product-settings-requirement-approval-type"
      memberOptions={memberOptions}
      approverIds={draft.approver_ids}
      approvalType={draft.approval_type}
      requiredCount={draft.required_count}
      onApproverIdsChange={handleApproverIdsChange}
      onApprovalTypeChange={handleApprovalTypeChange}
      onRequiredCountChange={(requiredCount) => updateDraft({ required_count: requiredCount })}
    />
  );
}
