"use client";

/**
 * 「查看这一版」：某个已通过版本当时的完整内容。
 *
 * 字段树用**那一版当时**的 fields_snapshot —— 字段结构立即生效不走审批，拿今天的表头去
 * 渲染当年的值会张冠李戴。内置行顺序按今天的类型布局（布局与图标同规则不冻结）。
 * 描述在这里要完整看，所以走只读富文本，不截断。
 */
import { Fragment, useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementTypeSchema, TRequirementVersion } from "@plane/types";
import { BuiltinCellValue } from "@/components/requirements/requirement-builtin-fields";
import {
  REQUIREMENT_BUILTIN_TITLE_COLUMN,
  resolveBuiltinLayout,
} from "@/components/requirements/requirement-builtin-layout";
import { LeafValue, RequirementAttachmentChips } from "@/components/requirements/requirement-grid-shared";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { RequirementRichTextValue } from "@/components/requirements/requirement-rich-text";

export const RequirementHistorySnapshot = ({
  version,
  requirementType,
  workspaceSlug,
}: {
  version: TRequirementVersion;
  requirementType: TRequirementTypeSchema | null;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation();
  const fields = useMemo(
    () => (version.fields_snapshot ?? []).filter((field) => field.field_type !== "form"),
    [version.fields_snapshot]
  );
  const builtinColumns = useMemo(
    () => [REQUIREMENT_BUILTIN_TITLE_COLUMN, ...resolveBuiltinLayout(requirementType?.builtin_fields).map((entry) => entry.column)],
    [requirementType?.builtin_fields]
  );
  const attachments = version.snapshot.attachments ?? [];

  return (
    <div className="rounded-lg border border-subtle bg-surface-2 px-3 py-2">
      <dl className="m-0 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-body-xs-regular">
        {version.display_id && (
          <>
            <dt className="text-tertiary">{t("requirements.identifier.column")}</dt>
            <dd className="m-0 min-w-0">
              <RequirementIdentifier displayId={version.display_id} />
            </dd>
          </>
        )}
        {builtinColumns.map((column) => (
          <Fragment key={column.key}>
            <dt className="text-tertiary">{t(column.labelKey)}</dt>
            <dd className="m-0 min-w-0 text-primary">
              {column.key === "description_html" ? (
                version.snapshot.description_html ? (
                  <RequirementRichTextValue
                    workspaceSlug={workspaceSlug}
                    editorId={`requirement-version-${version.id}-description`}
                    value={version.snapshot.description_html}
                    containerClassName="!pl-0 border-none"
                  />
                ) : (
                  <span className="text-placeholder">{t("workspace_products.requirements.change.empty_value")}</span>
                )
              ) : (
                <BuiltinCellValue columnKey={column.key} values={version.snapshot} />
              )}
            </dd>
          </Fragment>
        ))}
        {attachments.length > 0 && (
          <>
            <dt className="text-tertiary">{t("requirement_detail.attachments.title")}</dt>
            <dd className="m-0 min-w-0">
              <RequirementAttachmentChips assets={attachments} workspaceSlug={workspaceSlug} className="text-13" />
            </dd>
          </>
        )}
        {fields.map((field) => (
          <Fragment key={field.id}>
            <dt className="text-tertiary">{field.name}</dt>
            <dd className="m-0 min-w-0 text-primary">
              <LeafValue field={field} value={version.snapshot.data?.[field.id]} workspaceSlug={workspaceSlug} />
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
};
