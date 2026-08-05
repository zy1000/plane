import { useMemo } from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalType, TRequirementStatus, IUserLite } from "@plane/types";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { RequirementApprovalSettings } from "./requirement-approval-settings";
import { RequirementSettingsCard, RequirementStatusSummary } from "./requirement-settings-layout";

/**
 * 基线配置的草稿。标题与描述不在这里 —— 它们是每条需求自己的字段，在网格里编辑。
 */
export type TRequirementSettingsDraft = {
  owner_id: string;
  status: TRequirementStatus;
  approver_ids: string[];
  approval_type: TRequirementApprovalType;
  required_count: number | null;
};

type TRequirementSettingsPanelProps = {
  draft: TRequirementSettingsDraft;
  currentVersion: number | null;
  memberOptions: IUserLite[];
  onChange: (draft: TRequirementSettingsDraft) => void;
};

export function RequirementSettingsPanel({
  draft,
  currentVersion,
  memberOptions,
  onChange,
}: TRequirementSettingsPanelProps) {
  const { t } = useTranslation();
  const memberIds = useMemo(() => memberOptions.map((member) => member.id), [memberOptions]);

  const updateDraft = (patch: Partial<TRequirementSettingsDraft>) => onChange({ ...draft, ...patch });

  const handleApproverIdsChange = (nextApproverIds: string[]) => {
    if (draft.approval_type !== "n_of_m") {
      updateDraft({ approver_ids: nextApproverIds });
      return;
    }
    if (nextApproverIds.length === 0) {
      updateDraft({
        approver_ids: [],
        approval_type: "any",
        required_count: null,
      });
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

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface-1">
      <header className="shrink-0 px-5 pt-5 pb-4 md:px-8 md:pt-6">
        <h1 className="text-20 font-semibold text-primary">
          {t("workspace_products.requirements.configuration.settings")}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 md:px-8 md:pb-10">
        <div className="w-full max-w-[1480px]">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <RequirementSettingsCard
              icon={FileText}
              title={t("workspace_products.requirements.configuration.basic")}
            >
              <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
                <div>
                  <span className="mb-2 block text-12 font-medium text-primary">
                    {t("workspace_products.requirements.fields.owner")}
                    <span className="ml-0.5 text-danger-primary">*</span>
                  </span>
                  <div className="h-10 w-full">
                    <MemberDropdown
                      multiple={false}
                      value={draft.owner_id || null}
                      onChange={(value) => updateDraft({ owner_id: value ?? "" })}
                      memberIds={memberIds}
                      buttonVariant="border-with-text"
                      className="h-full w-full"
                      buttonClassName="h-full w-full border !border-subtle bg-surface-1"
                      buttonContainerClassName="h-full w-full"
                      placeholder={t("workspace_products.requirements.fields.select_owner")}
                      showUserDetails
                    />
                  </div>
                </div>
              </div>
            </RequirementSettingsCard>

            <RequirementStatusSummary status={draft.status} currentVersion={currentVersion} />
          </div>

          <RequirementSettingsCard
            className="mt-4"
            icon={ShieldCheck}
            title={t("workspace_products.requirements.configuration.approval")}
          >
            <RequirementApprovalSettings
              layout="cards"
              radioGroupName="product-requirement-inline-approval-type"
              memberOptions={memberOptions}
              approverIds={draft.approver_ids}
              approvalType={draft.approval_type}
              requiredCount={draft.required_count}
              onApproverIdsChange={handleApproverIdsChange}
              onApprovalTypeChange={handleApprovalTypeChange}
              onRequiredCountChange={(requiredCount) => updateDraft({ required_count: requiredCount })}
            />
          </RequirementSettingsCard>
        </div>
      </div>
    </main>
  );
}
