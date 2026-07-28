import { useMemo } from "react";
import { FileText, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalType, TRequirementStatus, IUserLite } from "@plane/types";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { RequirementApprovalSettings } from "./requirement-approval-settings";
import { RequirementSettingsCard, RequirementStatusSummary } from "./requirement-settings-layout";

export type TRequirementConfigurationSection = "settings" | "fields";

export type TRequirementSettingsDraft = {
  title: string;
  description_html: string | null;
  owner_id: string;
  status: TRequirementStatus;
  approver_ids: string[];
  approval_type: TRequirementApprovalType;
  required_count: number | null;
};

type TRequirementConfigurationNavigationProps = {
  activeSection: TRequirementConfigurationSection;
  onSectionChange: (section: TRequirementConfigurationSection) => void;
  orientation?: "horizontal" | "vertical";
};

export function RequirementConfigurationNavigation({
  activeSection,
  onSectionChange,
  orientation = "vertical",
}: TRequirementConfigurationNavigationProps) {
  const { t } = useTranslation();
  const items = [
    {
      key: "settings" as const,
      icon: Settings2,
      label: t("workspace_products.requirements.configuration.settings"),
    },
    {
      key: "fields" as const,
      icon: SlidersHorizontal,
      label: t("workspace_products.requirements.configuration.custom_fields"),
    },
  ];

  return (
    <nav
      className={cn(orientation === "vertical" ? "px-3 py-4" : "flex items-center gap-1 overflow-x-auto px-3 py-2")}
      aria-label={t("workspace_products.requirements.configuration.items")}
    >
      {orientation === "vertical" && (
        <p className="mb-2 px-3 text-11 font-semibold text-secondary">
          {t("workspace_products.requirements.configuration.items")}
        </p>
      )}
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSectionChange(item.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-md px-3 text-12 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong",
              orientation === "vertical" ? "mb-1 w-full" : "shrink-0",
              isActive
                ? "bg-accent-subtle font-medium text-accent-primary"
                : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

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
        <p className="mt-1 max-w-[65ch] text-12 leading-5 text-secondary">
          {t("workspace_products.requirements.configuration.settings_description")}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 md:px-8 md:pb-10">
        <div className="w-full max-w-[1480px]">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <RequirementSettingsCard
              icon={FileText}
              title={t("workspace_products.requirements.configuration.basic")}
              description={t("workspace_products.requirements.configuration.basic_description")}
            >
              <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-12 font-medium text-primary">
                    {t("workspace_products.requirements.fields.title")}
                    <span className="ml-0.5 text-danger-primary">*</span>
                  </span>
                  <input
                    value={draft.title}
                    onChange={(event) => updateDraft({ title: event.target.value })}
                    maxLength={255}
                    className="h-10 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong focus:ring-2 focus:ring-accent-subtle"
                    placeholder={t("workspace_products.requirements.fields.title_placeholder")}
                  />
                </label>

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

                <label className="block lg:col-span-2">
                  <span className="mb-2 block text-12 font-medium text-primary">
                    {t("workspace_products.requirements.fields.description")}
                  </span>
                  <textarea
                    value={draft.description_html ?? ""}
                    onChange={(event) => updateDraft({ description_html: event.target.value })}
                    rows={3}
                    maxLength={1000}
                    className="min-h-20 w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2.5 text-13 leading-5 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong focus:ring-2 focus:ring-accent-subtle"
                    placeholder={t("workspace_products.requirements.fields.description_placeholder")}
                  />
                </label>
              </div>
            </RequirementSettingsCard>

            <RequirementStatusSummary status={draft.status} currentVersion={currentVersion} />
          </div>

          <RequirementSettingsCard
            className="mt-4"
            icon={ShieldCheck}
            title={t("workspace_products.requirements.configuration.approval")}
            description={t("workspace_products.requirements.configuration.approval_description")}
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
