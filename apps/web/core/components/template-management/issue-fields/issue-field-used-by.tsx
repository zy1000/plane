import type { TIssueFieldLibraryItem } from "@plane/types";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { IssueTypeTag } from "@/components/project-issue-types/field-display";
import { AnchoredPopover } from "./anchored-popover";

/** 表格里最多直接摆几个类型标签，其余折成「+N」 */
const MAX_VISIBLE_TYPES = 3;

/**
 * 库字段「使用的类型」：used_by 只含研发模式类型库里的类型；
 * 只在自定义项目的类型里绑定时 used_by 为空、binding_count > 0，显示处数而不是「未使用」（这时删除会被拒）。
 */
export function IssueFieldUsedBy({ field }: { field: TIssueFieldLibraryItem }) {
  const usedBy = field.used_by ?? [];

  if (usedBy.length === 0) {
    return field.binding_count > 0 ? (
      <span className="text-13 text-tertiary">自定义项目 {field.binding_count} 处</span>
    ) : (
      <span className="text-13 text-placeholder">未使用</span>
    );
  }

  const visible = usedBy.slice(0, MAX_VISIBLE_TYPES);
  const restCount = usedBy.length - visible.length;

  return (
    <span className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      {visible.map((type) => (
        <IssueTypeTag key={type.issue_type_id} name={type.name} icon={type.logo_props?.icon} className="max-w-32" />
      ))}
      {restCount > 0 && (
        <AnchoredPopover
          ariaLabel={`查看全部 ${usedBy.length} 个类型`}
          placement="bottom-end"
          buttonClassName="h-[26px] shrink-0 rounded-md bg-layer-3 px-2 text-13 text-secondary hover:bg-layer-3-hover"
          buttonContent={`+${restCount}`}
          panelClassName="max-h-72 w-56 overflow-y-auto"
        >
          {() =>
            usedBy.map((type) => (
              <div key={type.issue_type_id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-13 text-primary">
                <TypeIcon iconProps={type.logo_props?.icon} className="size-4 rounded" iconClassName="size-3.5" />
                <span className="truncate">{type.name}</span>
              </div>
            ))
          }
        </AnchoredPopover>
      )}
    </span>
  );
}

/** 编辑弹窗底部「同步到」后面的类型列表 */
export function IssueFieldSyncTargets({ field }: { field: TIssueFieldLibraryItem }) {
  const usedBy = field.used_by ?? [];
  const extraCount = Math.max(field.binding_count - usedBy.length, 0);
  if (usedBy.length === 0 && extraCount === 0) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-13 text-secondary">
      <span className="shrink-0">同步到</span>
      {usedBy.map((type) => (
        <IssueTypeTag key={type.issue_type_id} name={type.name} icon={type.logo_props?.icon} className="max-w-40" />
      ))}
      {extraCount > 0 && <span className="text-tertiary">自定义项目 {extraCount} 处</span>}
    </div>
  );
}
