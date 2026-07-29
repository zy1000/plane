import { Check, FileText, Rows3, ShieldCheck, UsersRound } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type {
  IUserLite,
  TRequirementDetailChangeSnapshot,
  TRequirementField,
  TRequirementVersionDetail,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, sanitizeHTML } from "@plane/utils";
import { PILL_BASE } from "./styles";
import { VersionSnapshotPreview } from "./version-snapshot-preview";

type TProps = {
  workspaceSlug: string;
  versionDetail: TRequirementVersionDetail;
  members: IUserLite[];
  rows: TRequirementDetailChangeSnapshot[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
};

type TSnapshotFieldRow = {
  field: TRequirementField;
  parentName: string | null;
};

type TRequirementSnapshot = {
  title: string;
  description_html: string | null;
  owner_id: string;
  approval_type: "any" | "all" | "n_of_m";
  required_count: number | null;
  approver_ids: string[];
};

const flattenFields = (fields: TRequirementField[]): TSnapshotFieldRow[] =>
  fields.flatMap((field) => [
    { field, parentName: null },
    ...field.children.map((child) => ({ field: child, parentName: field.name })),
  ]);

const memberName = (member: IUserLite | undefined, fallback: string) => member?.display_name || fallback;

function MemberValue({ member, fallback }: { member: IUserLite | undefined; fallback: string }) {
  const name = memberName(member, fallback);

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={name} src={getFileURL(member?.avatar_url ?? "")} size="sm" className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

function SnapshotDefinition({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-11 text-tertiary">{label}</dt>
      <dd className="mt-1 min-w-0 text-13 font-medium text-primary">{children}</dd>
    </div>
  );
}

function SectionHeader({
  id,
  title,
  meta,
  icon: Icon,
}: {
  id: string;
  title: string;
  meta?: string;
  icon: typeof FileText;
}) {
  return (
    <header id={id} className="flex scroll-mt-4 items-center gap-2 border-b border-subtle px-4 py-3">
      <span className="grid size-7 place-items-center rounded-md bg-layer-2 text-secondary">
        <Icon className="size-3.5" />
      </span>
      <h3 className="text-13 font-semibold text-primary">{title}</h3>
      {meta && <span className="text-11 text-tertiary">{meta}</span>}
    </header>
  );
}

function formatDefaultValue(field: TRequirementField, emptyValue: string, yes: string, no: string) {
  const value = field.default_value;
  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return emptyValue;
  if (typeof value === "boolean") return value ? yes : no;

  if (field.field_type === "select") {
    const selectedValues = Array.isArray(value) ? value.map(String) : [String(value)];
    const optionLabels = selectedValues.map(
      (selectedValue) => field.config.options?.find((option) => option.id === selectedValue)?.label ?? selectedValue
    );
    return optionLabels.join(", ");
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item !== "object" || item === null) return String(item);
        if ("name" in item && typeof item.name === "string") return item.name;
        return JSON.stringify(item);
      })
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function VersionSnapshotOverview(props: TProps) {
  const {
    workspaceSlug,
    versionDetail,
    members,
    rows,
    totalCount,
    isLoading,
    error,
    perPage,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    onPerPageChange,
    onCursorChange,
  } = props;
  const { t } = useTranslation();
  const snapshot = versionDetail.requirement_snapshot as TRequirementSnapshot;
  const fieldRows = flattenFields(versionDetail.fields_snapshot);
  const membersById = new Map(members.map((member) => [member.id, member]));
  const owner = membersById.get(snapshot.owner_id);
  const approvers = snapshot.approver_ids.map((id) => ({ id, member: membersById.get(id) }));
  const description = sanitizeHTML(snapshot.description_html ?? "").trim();
  const emptyValue = t("workspace_products.requirements.change.empty_value");
  const yes = t("workspace_products.requirements.change.yes");
  const no = t("workspace_products.requirements.change.no");
  const approvalRule = !snapshot.approver_ids.length
    ? t("workspace_products.requirements.approval.unconfigured")
    : snapshot.approval_type === "n_of_m"
      ? t("workspace_products.requirements.approval.n_summary", {
          required: snapshot.required_count ?? 1,
          total: snapshot.approver_ids.length,
        })
      : t(`workspace_products.requirements.approval.${snapshot.approval_type}`);

  return (
    <div className="space-y-3 p-3 lg:p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <section className="min-w-0 rounded-lg border border-subtle bg-surface-1">
          <SectionHeader
            id="version-basic"
            icon={FileText}
            title={t("workspace_products.requirements.version.sections.basic")}
          />
          <dl className="grid divide-y divide-subtle sm:grid-cols-2 xl:grid-cols-3 sm:[&>*]:border-subtle xl:[&>*:not(:nth-child(3n))]:border-r sm:[&>*:nth-child(odd)]:border-r xl:[&>*:nth-child(odd)]:border-r-0">
            <SnapshotDefinition label={t("workspace_products.requirements.fields.title")}>
              <span className="block truncate" title={snapshot.title}>
                {snapshot.title || emptyValue}
              </span>
            </SnapshotDefinition>
            <SnapshotDefinition label={t("workspace_products.requirements.fields.owner")}>
              <MemberValue member={owner} fallback={snapshot.owner_id || emptyValue} />
            </SnapshotDefinition>
            <SnapshotDefinition label={t("workspace_products.requirements.fields.approval_rule")}>
              {approvalRule}
            </SnapshotDefinition>
            <div className="min-w-0 px-4 py-3 sm:col-span-2 xl:col-span-3">
              <dt className="text-11 text-tertiary">{t("workspace_products.requirements.fields.description")}</dt>
              <dd className="mt-1 max-w-[75ch] text-13 whitespace-pre-line text-primary">
                {description || (
                  <span className="text-tertiary">{t("workspace_products.requirements.fields.no_description")}</span>
                )}
              </dd>
            </div>
            <div className="min-w-0 px-4 py-3 sm:col-span-2 xl:col-span-3">
              <dt className="text-11 text-tertiary">{t("workspace_products.requirements.fields.approvers")}</dt>
              <dd className="mt-1.5 flex min-w-0 flex-wrap gap-1.5 text-13 text-primary">
                {approvers.length ? (
                  approvers.map(({ id, member }) => (
                    <span
                      key={id}
                      className="inline-flex h-7 max-w-full min-w-0 items-center rounded-md bg-layer-2 px-2"
                    >
                      <MemberValue member={member} fallback={id} />
                    </span>
                  ))
                ) : (
                  <span className="text-tertiary">{emptyValue}</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-subtle bg-surface-1">
          <SectionHeader
            id="version-summary"
            icon={ShieldCheck}
            title={t("workspace_products.requirements.version.content_summary")}
          />
          <div className="grid grid-cols-3 divide-x divide-subtle border-b border-subtle">
            {[
              {
                icon: FileText,
                value: fieldRows.length,
                label: t("workspace_products.requirements.version.summary.fields"),
              },
              {
                icon: Rows3,
                value: versionDetail.detail_count,
                label: t("workspace_products.requirements.version.summary.details"),
              },
              {
                icon: UsersRound,
                value: snapshot.approver_ids.length,
                label: t("workspace_products.requirements.version.summary.approvers"),
              },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="px-3 py-3">
                <span className="flex items-center gap-1.5 text-11 text-tertiary">
                  <Icon className="size-3.5" />
                  {label}
                </span>
                <strong className="text-14 mt-1 block font-semibold text-primary tabular-nums">{value}</strong>
              </div>
            ))}
          </div>
          <div className="px-4 py-3">
            <p className="text-11 text-tertiary">{t("workspace_products.requirements.version.reason")}</p>
            <p className="mt-1 text-13 leading-5 text-primary">
              {versionDetail.change_request_reason || t("workspace_products.requirements.version.no_reason")}
            </p>
          </div>
        </section>
      </div>

      <section className="min-w-0 overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <SectionHeader
          id="version-fields"
          icon={FileText}
          title={t("workspace_products.requirements.version.sections.fields")}
          meta={t("workspace_products.requirements.version.item_count", { count: fieldRows.length })}
        />
        {fieldRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead className="bg-layer-1 text-11 font-medium text-secondary">
                <tr>
                  <th className="w-[28%] border-b border-subtle px-4 py-2.5">
                    {t("workspace_products.requirements.version.field_columns.name")}
                  </th>
                  <th className="w-[17%] border-b border-subtle px-4 py-2.5">
                    {t("workspace_products.requirements.version.field_columns.type")}
                  </th>
                  <th className="w-[12%] border-b border-subtle px-4 py-2.5">
                    {t("workspace_products.requirements.version.field_columns.required")}
                  </th>
                  <th className="w-[18%] border-b border-subtle px-4 py-2.5">
                    {t("workspace_products.requirements.version.field_columns.default_value")}
                  </th>
                  <th className="border-b border-subtle px-4 py-2.5">
                    {t("workspace_products.requirements.version.field_columns.description")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {fieldRows.map(({ field, parentName }) => (
                  <tr key={field.id} className="transition-colors hover:bg-layer-transparent-hover">
                    <td className="px-4 py-2.5 text-12 text-primary">
                      <div className={cn("flex min-w-0 items-center gap-2", parentName && "pl-4")}>
                        {parentName && <span aria-hidden className="bg-subtle h-px w-3 shrink-0" />}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{field.name || emptyValue}</p>
                          {parentName && (
                            <p className="mt-0.5 truncate text-10 text-tertiary">
                              {t("workspace_products.requirements.version.child_of", { name: parentName })}
                            </p>
                          )}
                        </div>
                        {!field.is_active && (
                          <span className={cn(PILL_BASE, "shrink-0 bg-layer-2 text-tertiary")}>
                            {t("workspace_templates.requirements.inactive")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-12">
                      <span className={cn(PILL_BASE, "rounded-md bg-layer-2 text-secondary")}>
                        {t(`workspace_templates.requirements.field_types.${field.field_type}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-12 text-secondary">
                      {field.is_required ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Check className="size-3.5 text-success-primary" />
                          {yes}
                        </span>
                      ) : (
                        no
                      )}
                    </td>
                    <td className="max-w-56 truncate px-4 py-2.5 text-12 text-secondary">
                      {formatDefaultValue(field, emptyValue, yes, no)}
                    </td>
                    <td className="max-w-72 truncate px-4 py-2.5 text-12 text-secondary">
                      {typeof field.config.description === "string" && field.config.description
                        ? field.config.description
                        : emptyValue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-12 text-tertiary">
            {t("workspace_templates.requirements.fields.empty")}
          </p>
        )}
      </section>

      <section className="min-w-0 overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <SectionHeader
          id="version-details"
          icon={Rows3}
          title={t("workspace_products.requirements.version.sections.details")}
          meta={t("workspace_products.requirements.version.row_count", {
            count: versionDetail.detail_count,
          })}
        />
        <VersionSnapshotPreview
          workspaceSlug={workspaceSlug}
          fields={versionDetail.fields_snapshot}
          rows={rows}
          totalCount={totalCount}
          isLoading={isLoading}
          error={error}
          perPage={perPage}
          nextCursor={nextCursor}
          prevCursor={prevCursor}
          nextPageResults={nextPageResults}
          prevPageResults={prevPageResults}
          onPerPageChange={onPerPageChange}
          onCursorChange={onCursorChange}
        />
      </section>
    </div>
  );
}
