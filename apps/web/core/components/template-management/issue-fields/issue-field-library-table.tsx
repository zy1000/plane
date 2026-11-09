import { useId } from "react";
import { Eye, GitBranch, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueFieldLibraryItem } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { getFieldKindIcon, getFieldKindLabel } from "@/components/project-issue-types/field-display";
import { getSelectionMode, getTextMode } from "@/components/project-issue-types/field-form";
import { linkageChoices } from "@/utils/field-linkage";
import { AnchoredPopover } from "./anchored-popover";
import { IssueFieldUsedBy } from "./issue-field-used-by";

const CHIP = "max-w-28 truncate rounded border border-subtle bg-layer-1 px-2 py-0.5 text-12 text-secondary";
const ICON_BUTTON =
  "grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-1-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-accent-strong";
const RULE_BADGE =
  "inline-flex items-center gap-1.5 rounded border border-accent-subtle bg-accent-subtle px-2 py-0.5 text-12 text-accent-primary focus-visible:outline-2 focus-visible:outline-accent-strong";

function FieldOptions({ field }: { field: TIssueFieldLibraryItem }) {
  const choices = linkageChoices(field);
  const inputHint =
    field.field_type === "text"
      ? getTextMode(field.options) === "paragraph"
        ? "多行输入"
        : "单行输入"
      : field.field_type === "user"
        ? getSelectionMode(field.options) === "multiple"
          ? "多人选择"
          : "单人选择"
        : null;

  if (field.field_type !== "select") {
    return <span className="text-13 text-secondary">{inputHint ?? "—"}</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {choices.slice(0, 2).map((choice) => (
        <span key={choice.key} className={CHIP} title={choice.label}>
          {choice.label}
        </span>
      ))}
      {choices.length > 2 && (
        <AnchoredPopover
          ariaLabel={`查看${field.name}的全部 ${choices.length} 个选项`}
          buttonContent={`+${choices.length - 2}`}
          buttonClassName={`${CHIP} shrink-0 hover:bg-layer-1-hover`}
          panelClassName="max-h-64 w-56 overflow-y-auto"
        >
          {() =>
            choices.map((choice) => (
              <div key={choice.key} className="px-2 py-1.5 text-13 break-words text-primary">
                {choice.label}
              </div>
            ))
          }
        </AnchoredPopover>
      )}
      {choices.length === 0 && <span className="text-13 text-secondary">暂无选项</span>}
    </div>
  );
}

function FieldRules({ field, fields }: { field: TIssueFieldLibraryItem; fields: TIssueFieldLibraryItem[] }) {
  const id = useId();
  const visibility = field.linkage?.visibility;
  const options = field.linkage?.options;
  if (!visibility && !options) return <span className="text-secondary">—</span>;
  const visibilitySource = fields.find((source) => source.id === visibility?.field_id);
  const optionsSource = fields.find((source) => source.id === options?.field_id);
  const labelsFor = (source?: TIssueFieldLibraryItem) =>
    new Map(source ? linkageChoices(source).map((c) => [c.key, c.label]) : []);
  const visibilityLabels = labelsFor(visibilitySource);
  const sourceLabels = labelsFor(optionsSource);
  const targetLabels = labelsFor(field);

  return (
    <div className="flex flex-col items-start gap-1.5">
      {visibility && (
        <Tooltip
          position="top"
          tooltipHeading="条件显示"
          tooltipContent={
            <span id={`${id}-visibility`} role="tooltip">
              {visibilitySource
                ? `当「${visibilitySource.name}」选中「${visibility.values.map((value) => visibilityLabels.get(value) ?? value).join("、")}」中的任一值时显示，否则隐藏并清空已填值。`
                : "来源字段已失效，请编辑规则。"}
            </span>
          }
        >
          <span
            tabIndex={0}
            aria-label={`${field.name}的条件显示规则`}
            aria-describedby={`${id}-visibility`}
            className={RULE_BADGE}
          >
            <Eye className="size-3.5" />
            条件显示
          </span>
        </Tooltip>
      )}
      {options && (
        <Tooltip
          position="top"
          tooltipHeading="选项联动"
          tooltipContent={
            <span id={`${id}-options`} role="tooltip" className="block max-h-60 space-y-1 overflow-y-auto">
              <span className="block">
                {optionsSource ? `根据「${optionsSource.name}」限制可选范围：` : "来源字段已失效，请编辑规则。"}
              </span>
              {Object.entries(options.mappings).map(([source, targets]) => (
                <span key={source} className="block">
                  {sourceLabels.get(source) ?? source} →{" "}
                  {targets.length ? targets.map((target) => targetLabels.get(target) ?? target).join("、") : "无可选项"}
                </span>
              ))}
              <span className="block">未匹配时无可选项，失效值自动清空。</span>
            </span>
          }
        >
          <span
            tabIndex={0}
            aria-label={`${field.name}的选项联动规则`}
            aria-describedby={`${id}-options`}
            className={RULE_BADGE}
          >
            <GitBranch className="size-3.5" />
            选项联动
          </span>
        </Tooltip>
      )}
    </div>
  );
}

type Props = {
  fields: TIssueFieldLibraryItem[];
  visibleFields: TIssueFieldLibraryItem[];
  canManage: boolean;
  onEdit: (field: TIssueFieldLibraryItem) => void;
  onDelete: (field: TIssueFieldLibraryItem) => void;
  onResetFilters: () => void;
};

export function IssueFieldLibraryTable({ fields, visibleFields, canManage, onEdit, onDelete, onResetFilters }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle">
      <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-13" aria-label="通用字段库">
        <colgroup>
          <col style={{ width: "23%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: canManage ? "18%" : "25%" }} />
          {canManage && <col style={{ width: "7%" }} />}
        </colgroup>
        <thead className="bg-layer-1 text-secondary">
          <tr className="h-11">
            {["字段名称", "类型", "选项", "联动规则", "使用的类型"].map((label) => (
              <th key={label} scope="col" className="px-4 font-medium first:pl-5">
                {label}
              </th>
            ))}
            {canManage && (
              <th scope="col">
                <span className="sr-only">操作</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleFields.map((field) => {
            const Icon = getFieldKindIcon(field);
            const kindLabel =
              field.field_type === "select"
                ? getSelectionMode(field.options) === "multiple"
                  ? "多选"
                  : "单选"
                : getFieldKindLabel(field);
            return (
              <tr
                key={field.id}
                className="h-[72px] border-t border-subtle focus-within:bg-accent-subtle/40 hover:bg-accent-subtle/40"
              >
                <th scope="row" className="px-4 py-3 pl-5 text-left font-medium">
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className="size-[18px] shrink-0 text-secondary" />
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => onEdit(field)}
                        title={field.name}
                        className="truncate rounded text-14 text-primary hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-accent-strong"
                      >
                        {field.name}
                      </button>
                    ) : (
                      <span className="truncate text-14 text-primary" title={field.name}>
                        {field.name}
                      </span>
                    )}
                    {field.is_required && (
                      <span className="-ml-1 shrink-0 text-danger-primary" aria-label="必填">
                        *
                      </span>
                    )}
                  </div>
                </th>
                <td className="px-4 py-3 text-secondary">{kindLabel}</td>
                <td className="px-4 py-3">
                  <FieldOptions field={field} />
                </td>
                <td className="px-4 py-3">
                  <FieldRules field={field} fields={fields} />
                </td>
                <td className="px-4 py-3">
                  <IssueFieldUsedBy field={field} maxVisible={2} />
                </td>
                {canManage && (
                  <td className="py-3 pr-3">
                    <div className="flex justify-end gap-0.5">
                      <button
                        type="button"
                        aria-label={`编辑${field.name}`}
                        className={ICON_BUTTON}
                        onClick={() => onEdit(field)}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <CustomMenu
                        ariaLabel={`${field.name}的更多操作`}
                        placement="bottom-end"
                        customButton={<MoreHorizontal className="size-4" />}
                        customButtonClassName={ICON_BUTTON}
                        optionsClassName="rounded-lg border-subtle p-1.5 shadow-overlay-200"
                        portalElement={typeof document === "undefined" ? undefined : document.body}
                        closeOnSelect
                      >
                        <CustomMenu.MenuItem
                          onClick={() => onDelete(field)}
                          className="flex items-center gap-2 px-2 py-1.5 text-13 text-danger-primary"
                        >
                          <Trash2 className="size-4" />
                          删除字段
                        </CustomMenu.MenuItem>
                      </CustomMenu>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {visibleFields.length === 0 && (
            <tr>
              <td colSpan={canManage ? 6 : 5} className="h-48 border-t border-subtle text-center">
                <p className="text-14 font-medium text-primary">没有匹配的字段</p>
                <p className="mt-1 text-13 text-secondary">试试其他关键词，或调整筛选条件。</p>
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="mt-3 rounded text-13 text-accent-primary hover:underline"
                >
                  清除筛选
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
