import { useTranslation } from "@plane/i18n";
import type { TRequirementFieldType } from "@plane/types";

/**
 * 预览只需要这几个属性。写成结构类型而不是 TRequirementField | TRequirementFieldDraft
 * 的联合：联合数组上调用 filter/reduce 在严格模式下不可用。
 */
export type TPreviewField = {
  id?: string;
  client_id?: string;
  name: string;
  field_type: TRequirementFieldType;
  is_active: boolean;
  children: TPreviewField[];
};

const previewFieldKey = (field: TPreviewField) => field.id ?? field.client_id ?? field.name;

/**
 * 启用字段展开成明细表后的列数。
 *
 * 可重复表单按它启用的子字段数计；没有子字段时仍占 1 列（表头要有东西可画）。
 */
export const countRequirementColumns = (fields: TPreviewField[]) =>
  fields
    .filter((field) => field.is_active)
    .reduce((count, field) => {
      if (field.field_type !== "form") return count + 1;
      return count + Math.max(field.children.filter((child) => child.is_active).length, 1);
    }, 0);

/**
 * 字段结构的只读表头预览，含子表单的两行表头。
 *
 * 类型编辑器与类型详情页共用：两处展示的是同一份结构，没有理由渲染出两种样子。
 */
export function RequirementFieldsPreview({ fields }: { fields: TPreviewField[] }) {
  const { t } = useTranslation();
  const visibleFields = fields.filter((field) => field.is_active);
  const formFields = visibleFields.filter((field) => field.field_type === "form");
  const hasForms = formFields.length > 0;
  const columnCount = countRequirementColumns(fields);

  return (
    <div className="overflow-x-auto rounded-lg border border-subtle bg-surface-1">
      <table className="min-w-full border-collapse text-left">
        <thead className="bg-layer-1 text-11 text-secondary">
          <tr className="border-b border-subtle">
            {visibleFields.map((field) =>
              field.field_type === "form" ? (
                <th
                  key={previewFieldKey(field)}
                  colSpan={Math.max(field.children.filter((child) => child.is_active).length, 1)}
                  className="min-w-40 border-r border-subtle px-3 py-2 text-center text-primary"
                >
                  {field.name || t("requirement_fields.fields.untitled")}
                </th>
              ) : (
                <th
                  key={previewFieldKey(field)}
                  rowSpan={hasForms ? 2 : 1}
                  className="min-w-40 border-r border-subtle px-3 py-2"
                >
                  {field.name || t("requirement_fields.fields.untitled")}
                </th>
              )
            )}
          </tr>
          {hasForms && (
            <tr className="border-b border-subtle">
              {formFields.flatMap((field) => {
                const children = field.children.filter((child) => child.is_active);
                return children.length ? (
                  children.map((child) => (
                    <th key={previewFieldKey(child)} className="min-w-40 border-r border-subtle px-3 py-2">
                      {child.name || t("requirement_fields.fields.untitled")}
                    </th>
                  ))
                ) : (
                  <th key={`${previewFieldKey(field)}-empty`} className="min-w-40 border-r border-subtle px-3 py-2">
                    {t("requirement_fields.fields.no_children")}
                  </th>
                );
              })}
            </tr>
          )}
        </thead>
        <tbody>
          <tr>
            <td colSpan={Math.max(1, columnCount)} className="h-24 px-4 text-center text-11 text-placeholder">
              {t("requirement_fields.preview.empty")}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
