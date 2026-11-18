import { useId } from "react";
import { Eye, GitBranch } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueFieldLibraryItem } from "@plane/types";
import { getFieldKindLabel } from "@/components/project-issue-types/field-display";
import { getSelectionMode, getTextMode } from "@/components/project-issue-types/field-form";
import { describeLinkageConditions, linkageChoices } from "@/utils/field-linkage";
import type { TLinkageIssueType } from "@/utils/field-linkage";
import { AnchoredPopover } from "./anchored-popover";
import { IssueFieldUsedBy } from "./issue-field-used-by";

const CHIP = "max-w-28 truncate rounded border border-subtle bg-layer-1 px-2 py-0.5 text-12 text-secondary";
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

function FieldRules({
  field,
  fields,
  issueTypes,
}: {
  field: TIssueFieldLibraryItem;
  fields: TIssueFieldLibraryItem[];
  issueTypes: TLinkageIssueType[];
}) {
  const id = useId();
  const visibility = field.linkage?.visibility;
  const options = field.linkage?.options;
  if (!visibility && !options) return <span className="text-secondary">—</span>;
  const targetLabels = new Map(linkageChoices(field).map((c) => [c.key, c.label]));
  const hasTypes = issueTypes.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibility && (
        <Tooltip
          position="top"
          tooltipHeading="条件显示"
          tooltipContent={
            <span id={`${id}-visibility`} role="tooltip" className="block max-h-60 space-y-1 overflow-y-auto">
              <span className="block">满足任一规则时显示：</span>
              {visibility.rules.map((rule, index) => (
                <span key={index} className="block">
                  规则 {index + 1}：{describeLinkageConditions(rule.conditions, fields, issueTypes)}
                </span>
              ))}
              <span className="block">
                未满足任何规则时隐藏，并清空已填值。{hasTypes && "规则未涉及的工作项类型始终显示。"}
              </span>
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
              <span className="block">按规则限制可选范围：</span>
              {options.rules.map((rule, index) => (
                <span key={index} className="block">
                  规则 {index + 1}：{describeLinkageConditions(rule.conditions, fields, issueTypes)} →{" "}
                  {rule.options.length
                    ? rule.options.map((target) => targetLabels.get(target) ?? target).join("、")
                    : "无可选项"}
                </span>
              ))}
              <span className="block">
                均不满足时无可选项，失效值自动清空。{hasTypes && "规则未涉及的工作项类型不受限制。"}
              </span>
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
  issueTypes: TLinkageIssueType[];
  visibleFields: TIssueFieldLibraryItem[];
  canManage: boolean;
  onEdit: (field: TIssueFieldLibraryItem) => void;
  onDelete: (field: TIssueFieldLibraryItem) => void;
  onResetFilters: () => void;
};

export function IssueFieldLibraryTable({
  fields,
  issueTypes,
  visibleFields,
  canManage,
  onEdit,
  onDelete,
  onResetFilters,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle">
      <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-13" aria-label="工作项通用字段库">
        <colgroup>
          <col style={{ width: "24%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "26%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: canManage ? "14%" : "24%" }} />
          {canManage && <col style={{ width: "10%" }} />}
        </colgroup>
        <thead className="bg-surface-2 text-secondary">
          <tr className="h-10">
            {["字段名称", "类型", "选项", "联动规则", "使用的类型"].map((label) => (
              <th key={label} scope="col" className="px-4 font-medium first:pl-5">
                {label}
              </th>
            ))}
            {canManage && (
              <th scope="col" className="px-4 font-medium">
                操作
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleFields.map((field) => {
            const kindLabel =
              field.field_type === "select"
                ? getSelectionMode(field.options) === "multiple"
                  ? "多选"
                  : "单选"
                : getFieldKindLabel(field);
            // 与内容区「未使用」页签同口径：类型库或自定义项目里还有绑定就不能删
            const isUsed = field.binding_count > 0 || Boolean(field.used_by?.length);
            return (
              <tr
                key={field.id}
                className="h-[52px] border-t border-subtle focus-within:bg-accent-subtle/40 hover:bg-accent-subtle/40"
              >
                <th scope="row" className="px-4 py-2 pl-5 text-left font-medium">
                  <div className="flex min-w-0 items-center gap-1">
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
                      <span className="shrink-0 text-danger-primary" aria-label="必填">
                        *
                      </span>
                    )}
                  </div>
                </th>
                <td className="px-4 py-2 text-secondary">{kindLabel}</td>
                <td className="px-4 py-2">
                  <FieldOptions field={field} />
                </td>
                <td className="px-4 py-2">
                  <FieldRules field={field} fields={fields} issueTypes={issueTypes} />
                </td>
                <td className="px-4 py-2">
                  <IssueFieldUsedBy field={field} maxVisible={2} />
                </td>
                {canManage && (
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        className="text-13 font-medium text-accent-primary hover:underline"
                        onClick={() => onEdit(field)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="text-13 font-medium text-danger-primary hover:underline disabled:cursor-not-allowed disabled:text-disabled disabled:no-underline"
                        disabled={isUsed}
                        title={isUsed ? "仍被工作项类型使用，请先从这些类型里移除" : undefined}
                        onClick={() => onDelete(field)}
                      >
                        删除
                      </button>
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
