import { type ReactNode } from "react";
import { FileText, Lock, ShieldCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirement } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, sanitizeHTML } from "@plane/utils";
import { RequirementSettingsCard, RequirementStatusSummary } from "./requirement-settings-layout";

function ReadOnlyNotice({ hint, fullWidth = false }: { hint: string; fullWidth?: boolean }) {
  return (
    <p
      className={cn(
        "mt-3 flex items-start gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 leading-5 text-secondary",
        !fullWidth && "max-w-[65ch]"
      )}
    >
      <Lock className="mt-0.5 size-3.5 shrink-0 text-tertiary" />
      {hint}
    </p>
  );
}

function ReadOnlySection({
  title,
  description,
  hint,
  children,
  layered = false,
}: {
  title: string;
  description?: string;
  hint: string;
  children: ReactNode;
  layered?: boolean;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-1">
      <header
        className={cn("shrink-0 px-5 md:px-8", layered ? "pt-5 pb-4 md:pt-6" : "border-b border-subtle py-4 md:py-5")}
      >
        <div className="w-full max-w-[1480px]">
          <h1 className="text-20 font-semibold text-primary">{title}</h1>
          {description && <p className="mt-1 max-w-[65ch] text-12 leading-5 text-secondary">{description}</p>}
          <ReadOnlyNotice hint={hint} fullWidth={!layered} />
        </div>
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 md:px-8", layered ? "pb-8 md:pb-10" : "py-6 md:py-7")}>
        <div className="w-full max-w-[1480px]">{children}</div>
      </div>
    </div>
  );
}

function DefinitionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-4 sm:px-5">
      <dt className="text-12 text-secondary">{label}</dt>
      <dd className="min-w-0 text-13 text-primary">{children}</dd>
    </div>
  );
}

function MemberTag({ name, avatarUrl }: { name: string; avatarUrl: string | null | undefined }) {
  return (
    <span className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded bg-layer-1 px-1.5 text-11 text-primary">
      <Avatar name={name} src={getFileURL(avatarUrl ?? "")} size="sm" className="shrink-0" />
      <span className="max-w-40 truncate">{name}</span>
    </span>
  );
}

export function ReadOnlyRequirementSettings({ requirement, hint }: { requirement: TRequirement; hint: string }) {
  const { t } = useTranslation();
  const emptyValue = t("workspace_products.requirements.change.empty_value");
  // description_html 由富文本模态框写入，直接渲染会把 `<p></p>` 之类的标签当正文显示
  const description = sanitizeHTML(requirement.description_html ?? "").trim();
  const approvalRule = !requirement.approver_ids.length
    ? t("workspace_products.requirements.approval.unconfigured")
    : requirement.approval_type === "n_of_m"
      ? t("workspace_products.requirements.approval.n_summary", {
          required: requirement.required_count ?? 1,
          total: requirement.approver_ids.length,
        })
      : t(`workspace_products.requirements.approval.${requirement.approval_type}`);

  return (
    <ReadOnlySection
      title={t("workspace_products.requirements.configuration.settings")}
      hint={hint}
      layered
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <RequirementSettingsCard
          icon={FileText}
          title={t("workspace_products.requirements.configuration.basic")}
          bodyClassName="px-0 pt-3 pb-0 sm:px-0 sm:pb-0"
        >
          <dl className="divide-y divide-subtle">
            <DefinitionRow label={t("workspace_products.requirements.fields.title")}>{requirement.title}</DefinitionRow>
            <DefinitionRow label={t("workspace_products.requirements.fields.owner")}>
              <MemberTag name={requirement.owner_detail.display_name} avatarUrl={requirement.owner_detail.avatar_url} />
            </DefinitionRow>
            <DefinitionRow label={t("workspace_products.requirements.fields.description")}>
              {description ? (
                <span className="whitespace-pre-line">{description}</span>
              ) : (
                <span className="text-tertiary">{t("workspace_products.requirements.fields.no_description")}</span>
              )}
            </DefinitionRow>
          </dl>
        </RequirementSettingsCard>

        <RequirementStatusSummary status={requirement.status} currentVersion={requirement.current_version} />
      </div>

      <RequirementSettingsCard
        className="mt-4"
        icon={ShieldCheck}
        title={t("workspace_products.requirements.configuration.approval")}
        bodyClassName="px-0 pt-3 pb-0 sm:px-0 sm:pb-0"
      >
        <dl className="divide-y divide-subtle">
          <DefinitionRow label={t("workspace_products.requirements.fields.approvers")}>
            {requirement.approver_details.length ? (
              <span className="flex flex-wrap items-center gap-1.5">
                {requirement.approver_details.map((approver) => (
                  <MemberTag key={approver.id} name={approver.display_name} avatarUrl={approver.avatar_url} />
                ))}
              </span>
            ) : (
              <span className="text-tertiary">{emptyValue}</span>
            )}
          </DefinitionRow>
          <DefinitionRow label={t("workspace_products.requirements.fields.approval_rule")}>
            {approvalRule}
          </DefinitionRow>
        </dl>
      </RequirementSettingsCard>
    </ReadOnlySection>
  );
}
