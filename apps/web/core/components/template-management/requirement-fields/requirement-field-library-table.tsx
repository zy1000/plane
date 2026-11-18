import { useTranslation } from "@plane/i18n";
import type { TRequirementFieldDefinition } from "@plane/types";
import { IssueTypeTag } from "@/components/project-issue-types/field-display";
import { getRequirementSelectMode, getRequirementSelectOptions } from "@/components/requirements/requirement-select";
import { AnchoredPopover } from "../issue-fields/anchored-popover";

const CHIP = "max-w-28 truncate rounded border border-subtle bg-layer-1 px-2 py-0.5 text-12 text-secondary";
/** 「选项 / 子字段」「使用的类型」两列各自最多直接摆几个，其余折成「+N」 */
const MAX_VISIBLE_CHIPS = 3;
const MAX_VISIBLE_TYPES = 2;

/** 选项或子字段的名字：前几个直接摆，其余点「+N」看全 */
function NameChips({ fieldName, names }: { fieldName: string; names: string[] }) {
  if (names.length === 0) return <span className="text-13 text-secondary">—</span>;
  const rest = names.length - MAX_VISIBLE_CHIPS;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {names.slice(0, MAX_VISIBLE_CHIPS).map((name) => (
        <span key={name} className={CHIP} title={name}>
          {name}
        </span>
      ))}
      {rest > 0 && (
        <AnchoredPopover
          ariaLabel={`查看${fieldName}的全部 ${names.length} 项`}
          buttonContent={`+${rest}`}
          buttonClassName={`${CHIP} shrink-0 hover:bg-layer-1-hover`}
          panelClassName="max-h-64 w-56 overflow-y-auto"
        >
          {() =>
            names.map((name) => (
              <div key={name} className="px-2 py-1.5 text-13 break-words text-primary">
                {name}
              </div>
            ))
          }
        </AnchoredPopover>
      )}
    </div>
  );
}

function UsedBy({ field }: { field: TRequirementFieldDefinition }) {
  if (field.used_by.length === 0) return <span className="text-13 text-placeholder">未使用</span>;
  const rest = field.used_by.length - MAX_VISIBLE_TYPES;
  return (
    <span className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      {field.used_by.slice(0, MAX_VISIBLE_TYPES).map((type) => (
        <IssueTypeTag
          key={type.requirement_type_id}
          name={type.name}
          icon={type.logo_props?.icon}
          className="max-w-40 min-w-0 shrink"
        />
      ))}
      {rest > 0 && (
        <AnchoredPopover
          ariaLabel={`查看全部 ${field.used_by.length} 个需求类型`}
          placement="bottom-end"
          buttonClassName="h-[26px] shrink-0 rounded-md bg-layer-3 px-2 text-13 text-secondary hover:bg-layer-3-hover"
          buttonContent={`+${rest}`}
          panelClassName="max-h-72 w-56 overflow-y-auto"
        >
          {() =>
            field.used_by.map((type) => (
              <div key={type.requirement_type_id} className="px-2 py-1.5">
                <IssueTypeTag name={type.name} icon={type.logo_props?.icon} className="bg-transparent px-0" />
              </div>
            ))
          }
        </AnchoredPopover>
      )}
    </span>
  );
}

type Props = {
  visibleFields: TRequirementFieldDefinition[];
  canManage: boolean;
  onEdit: (field: TRequirementFieldDefinition) => void;
  onDelete: (field: TRequirementFieldDefinition) => void;
  onResetFilters: () => void;
};

/** 需求通用字段库的表格：列与工作项通用字段库对齐，「联动规则」换成这边才有的子字段 */
export function RequirementFieldLibraryTable({ visibleFields, canManage, onEdit, onDelete, onResetFilters }: Props) {
  const { t } = useTranslation();
  const headers = ["字段名称", "类型", "选项 / 子字段", "使用的类型"];

  return (
    <div className="overflow-x-auto rounded-lg border border-subtle">
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-13" aria-label="需求通用字段库">
        <colgroup>
          <col style={{ width: "24%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "26%" }} />
          <col style={{ width: canManage ? "28%" : "38%" }} />
          {canManage && <col style={{ width: "10%" }} />}
        </colgroup>
        <thead className="bg-surface-2 text-secondary">
          <tr className="h-10">
            {headers.map((label) => (
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
                ? t(
                    `requirement_fields.builder.${
                      getRequirementSelectMode(field) === "multiple" ? "multiple_select" : "single_select"
                    }`
                  )
                : t(`requirement_fields.field_types.${field.field_type}`);
            const names =
              field.field_type === "select"
                ? getRequirementSelectOptions(field).map((option) => option.label)
                : field.children.map((child) => child.name);
            const isUsed = field.used_by.length > 0;
            return (
              <tr
                key={field.id}
                className="h-[52px] border-t border-subtle focus-within:bg-accent-subtle/40 hover:bg-accent-subtle/40"
              >
                <th scope="row" className="px-4 py-2 pl-5 text-left font-medium">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-14 text-primary" title={field.name}>
                      {field.name}
                    </span>
                    {field.is_required && (
                      <span className="shrink-0 text-danger-primary" aria-label="必填">
                        *
                      </span>
                    )}
                  </div>
                </th>
                <td className="px-4 py-2 text-secondary">{kindLabel}</td>
                <td className="px-4 py-2">
                  <NameChips fieldName={field.name} names={names} />
                </td>
                <td className="px-4 py-2">
                  <UsedBy field={field} />
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
                        title={isUsed ? "仍被需求类型使用，请先从这些类型里移除" : undefined}
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
              <td colSpan={canManage ? 5 : 4} className="h-48 border-t border-subtle text-center">
                <p className="text-14 font-medium text-primary">没有匹配的字段</p>
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
