import type { ReactNode } from "react";
import { Clock3, GitBranch, Send, type LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementStatus } from "@plane/types";
import { cn } from "@plane/utils";
import { PILL_BASE, REQUIREMENT_STATUS_PILL } from "./change/styles";

type TRequirementSettingsCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function RequirementSettingsCard({
  icon: Icon,
  title,
  description,
  children,
  className,
  bodyClassName,
}: TRequirementSettingsCardProps) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-subtle bg-surface-1", className)}>
      <header className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-15 font-semibold text-primary">{title}</h2>
          <p className="mt-1 max-w-[65ch] text-12 leading-5 text-secondary">{description}</p>
        </div>
      </header>
      <div className={cn("px-4 pt-5 pb-4 sm:px-5 sm:pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}

function StatusFact({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-1 text-secondary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="text-12 leading-5 text-primary">{children}</p>
    </div>
  );
}

export function RequirementStatusSummary({
  status,
  currentVersion,
}: {
  status: TRequirementStatus;
  currentVersion: number | null;
}) {
  const { t } = useTranslation();
  const stateMessage =
    status === "draft"
      ? t(
          currentVersion === null
            ? "workspace_products.requirements.configuration.status_first_draft"
            : "workspace_products.requirements.state.draft_notice"
        )
      : status === "in_review"
        ? t("workspace_products.requirements.state.in_review_banner")
        : t("workspace_products.requirements.configuration.status_published");
  const nextStepMessage = t(
    status === "published"
      ? "workspace_products.requirements.configuration.status_next_edit"
      : currentVersion === null
        ? "workspace_products.requirements.configuration.status_next_first_publish"
        : "workspace_products.requirements.configuration.status_next_publish"
  );

  return (
    <section className="overflow-hidden rounded-xl border border-subtle bg-surface-1">
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="text-15 font-semibold text-primary">
            {t("workspace_products.requirements.configuration.current_status")}
          </h2>
          <p className="mt-1 text-12 leading-5 text-secondary">
            {t("workspace_products.requirements.configuration.status_overview_description")}
          </p>
        </div>
        <span className={cn(PILL_BASE, REQUIREMENT_STATUS_PILL[status])}>
          {t(`workspace_products.requirements.status.${status}`)}
        </span>
      </header>

      <div className="divide-y divide-subtle px-4 pt-3 sm:px-5">
        <StatusFact icon={GitBranch}>
          {currentVersion === null
            ? t("workspace_products.requirements.configuration.not_published")
            : t(
                status === "published"
                  ? "workspace_products.requirements.configuration.current_version"
                  : "workspace_products.requirements.state.based_on",
                { version: currentVersion }
              )}
        </StatusFact>
        <StatusFact icon={Clock3}>{stateMessage}</StatusFact>
        <StatusFact icon={Send}>{nextStepMessage}</StatusFact>
      </div>
    </section>
  );
}
