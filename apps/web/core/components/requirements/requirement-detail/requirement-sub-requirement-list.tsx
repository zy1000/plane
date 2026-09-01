/**
 * 子需求列表：编号 + 标题 + 状态 / 负责人，一个外框 + 分隔线而不是 N 张小卡片。
 * framed=false 给关联区的折叠块用 —— 折叠块自己已经有标题行分隔。
 */
import { useTranslation } from "@plane/i18n";
import type { TRequirement } from "@plane/types";
import { cn } from "@plane/utils";
import { BuiltinCellValue } from "@/components/requirements/requirement-builtin-fields";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";

export const RequirementSubRequirementList = ({
  items,
  isLibrary = false,
  framed = true,
  onOpen,
}: {
  items: TRequirement[];
  isLibrary?: boolean;
  framed?: boolean;
  onOpen: (requirementId: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className={cn("divide-y divide-subtle", framed && "overflow-hidden rounded-md border border-subtle")}>
      {items.map((child) => (
        <button
          key={child.id}
          type="button"
          onClick={() => onOpen(child.id)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-xs-medium transition-colors hover:bg-layer-1"
        >
          {!isLibrary && (
            <span className="shrink-0">
              <BuiltinCellValue columnKey="status" values={child} />
            </span>
          )}
          <span className="shrink-0">
            <RequirementIdentifier displayId={child.display_id} size="md" />
          </span>
          <span className="min-w-0 flex-1 truncate text-primary">{child.title || t("requirement_detail.untitled")}</span>
          {!isLibrary && (
            <span className="shrink-0">
              <BuiltinCellValue columnKey="assignee_id" values={child} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
};
