import { useState, type ReactNode } from "react";
import { ChevronRight, FileText, Lock, ShieldCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirement, TRequirementField } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, sanitizeHTML } from "@plane/utils";
import { FIELD_ICONS } from "@/components/template-management/requirements/requirement-field-builder";
import {
  getRequirementSelectLabel,
  getRequirementSelectMode,
  getRequirementSelectOptions,
} from "@/components/template-management/requirements/requirement-select";
import { RequirementSettingsCard, RequirementStatusSummary } from "./requirement-settings-layout";

type TTranslate = (key: string, values?: Record<string, unknown>) => string;

const FIELD_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 md:grid-cols-[minmax(0,46fr)_minmax(0,39fr)_minmax(6rem,15fr)]";

/**
 * 只读态是需求的常态视图（published 才是常态，draft 是例外），所以这里展示的元数据
 * 要比可编辑态更全：必填、选择器模式与选项数、默认值都直接摊开，避免用户为了「看一眼」
 * 去点「编辑」——那会生成草稿并触发一条审批流。
 */
function formatDefaultValue(field: TRequirementField, t: TTranslate): string | null {
  const value = field.default_value;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") {
    return t(value ? "workspace_products.requirements.change.yes" : "workspace_products.requirements.change.no");
  }
  if (typeof value === "string") {
    return field.field_type === "select" ? (getRequirementSelectLabel(field, value) ?? value) : value;
  }
  if (Array.isArray(value) && field.field_type === "select") {
    const labels = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => getRequirementSelectLabel(field, item) ?? item);
    return labels.length ? labels.join("、") : null;
  }
  return null;
}

function fieldSummary(field: TRequirementField, t: TTranslate): string {
  const parts = [t(`workspace_templates.requirements.field_types.${field.field_type}`)];
  if (field.field_type === "select") {
    parts.push(
      t("workspace_templates.requirements.editor.builder.selector_summary", {
        mode: t(
          `workspace_templates.requirements.editor.builder.${
            getRequirementSelectMode(field) === "multiple" ? "multiple_select" : "single_select"
          }`
        ),
        count: getRequirementSelectOptions(field).length,
      })
    );
  }
  if (field.field_type === "form") {
    parts.push(t("workspace_products.requirements.configuration.sub_field_count", { count: field.children.length }));
  }
  const defaultValue = formatDefaultValue(field, t);
  if (defaultValue) {
    parts.push(t("workspace_products.requirements.configuration.default_value_summary", { value: defaultValue }));
  }
  return parts.join(" · ");
}

function ReadOnlyFieldCells({
  field,
  isChild = false,
  leadingControl,
}: {
  field: TRequirementField;
  isChild?: boolean;
  leadingControl?: ReactNode;
}) {
  const { t } = useTranslation();
  const Icon = FIELD_ICONS[field.field_type];
  const description = typeof field.config.description === "string" ? field.config.description.trim() : "";
  const summary = fieldSummary(field, t);

  return (
    <>
      <div
        className={cn(
          "flex min-w-0 items-center gap-2.5",
          isChild && "ml-2.5 border-l border-subtle pl-5"
        )}
      >
        {leadingControl}
        <Icon className={cn("size-4 shrink-0", isChild ? "text-tertiary" : "text-secondary")} />
        <div className="min-w-0">
          <p className={cn("truncate font-medium text-primary", isChild ? "text-12" : "text-13")}>
            {field.name.trim() || t("workspace_templates.requirements.fields.untitled")}
          </p>
          {description && <p className="mt-0.5 truncate text-11 text-tertiary">{description}</p>}
          <p className="mt-0.5 truncate text-11 text-secondary md:hidden">{summary}</p>
        </div>
        {field.is_required && (
          <span className="shrink-0 rounded bg-danger-subtle px-1.5 py-0.5 text-10 font-medium text-danger-primary">
            {t("workspace_templates.requirements.fields.required")}
          </span>
        )}
      </div>
      <p className="hidden min-w-0 truncate text-12 text-secondary md:block">{summary}</p>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-11 text-secondary">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            field.is_active ? "bg-success-primary" : "border border-strong bg-transparent"
          )}
        />
        {t(
          field.is_active
            ? "workspace_templates.requirements.editor.builder.enabled_badge"
            : "workspace_templates.requirements.inactive"
        )}
      </span>
    </>
  );
}

function ReadOnlyFieldRow({ field, isChild = false }: { field: TRequirementField; isChild?: boolean }) {
  return (
    <li className={cn(FIELD_GRID, "min-h-11 px-4 py-2")}>
      <ReadOnlyFieldCells field={field} isChild={isChild} />
    </li>
  );
}

function ReadOnlyFormGroup({ field }: { field: TRequirementField }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = field.children.length > 0;
  const childrenId = `requirement-field-children-${field.id}`;
  const rowContent = (
    <ReadOnlyFieldCells
      field={field}
      leadingControl={
        hasChildren ? (
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 text-tertiary transition-transform duration-150 motion-reduce:transition-none",
              isOpen && "rotate-90"
            )}
          />
        ) : undefined
      }
    />
  );

  return (
    <li>
      {hasChildren ? (
        <button
          type="button"
          className={cn(
            FIELD_GRID,
            "min-h-11 w-full bg-layer-1 px-4 py-2 text-left transition-colors duration-150 hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-strong focus-visible:outline-none motion-reduce:transition-none"
          )}
          aria-controls={childrenId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((currentValue) => !currentValue)}
        >
          {rowContent}
        </button>
      ) : (
        <div className={cn(FIELD_GRID, "min-h-11 bg-layer-1 px-4 py-2")}>{rowContent}</div>
      )}
      {hasChildren && isOpen ? (
        <ul id={childrenId} className="divide-y divide-subtle border-t border-subtle bg-layer-2">
          {field.children.map((child) => (
            <ReadOnlyFieldRow key={child.id} field={child} isChild />
          ))}
        </ul>
      ) : (
        !hasChildren && (
          <p className="border-t border-subtle py-2.5 pr-4 pl-11 text-11 text-tertiary">
            {t("workspace_templates.requirements.fields.no_children")}
          </p>
        )
      )}
    </li>
  );
}

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

export function ReadOnlyFieldStructure({ fields, hint }: { fields: TRequirementField[]; hint: string }) {
  const { t } = useTranslation();

  return (
    <ReadOnlySection
      title={t("workspace_products.requirements.configuration.custom_fields")}
      hint={hint}
    >
      {fields.length ? (
        <div className="overflow-hidden rounded-lg border border-subtle bg-layer-1">
          <div className={cn(FIELD_GRID, "min-h-9 px-4 py-2 text-11 font-medium text-secondary")}>
            <span>{t("workspace_products.requirements.change.field_props.name")}</span>
            <span className="hidden md:block">
              {t("workspace_products.requirements.change.field_props.field_type")}
            </span>
            <span>{t("workspace_products.requirements.fields.status")}</span>
          </div>
          <ul className="divide-y divide-subtle border-t border-subtle bg-layer-2">
            {fields.map((field) =>
              field.field_type === "form" ? (
                <ReadOnlyFormGroup key={field.id} field={field} />
              ) : (
                <ReadOnlyFieldRow key={field.id} field={field} />
              )
            )}
          </ul>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-subtle px-6 py-12 text-center text-12 text-tertiary">
          {t("workspace_products.requirements.configuration.fields_empty")}
        </div>
      )}
    </ReadOnlySection>
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
