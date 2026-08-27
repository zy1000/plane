"use client";

import { FolderOpenDot, GitBranch } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirement,
  TRequirementBuiltinValues,
  TRequirementItemStatus,
  TRequirementPriority,
  TRequirementTypeSchema,
} from "@plane/types";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { RequirementModuleDropdown } from "../module-tree/requirement-module-dropdown";
import { RequirementParentDropdown } from "../requirement-parent-dropdown";
import { RequirementStatusCell } from "../requirement-status-cell";

type TProps = {
  requirement: TRequirement;
  requirementType: TRequirementTypeSchema | null;
  readOnly: boolean;
  /** 父项选择器的检索范围：产品需求传 productId，标准库条目传 libraryId */
  parentScope: { workspaceSlug: string; productId?: string; libraryId?: string };
  onPatch: (patch: { builtin?: Partial<TRequirementBuiltinValues> }) => Promise<unknown>;
  /**
   * 改需求级交付状态。不走 onPatch、不受 readOnly 管 —— closed 行内容只读但状态要能
   * 选回去重开；不传则状态 chip 只读。
   */
  onStatusChange?: (status: TRequirementItemStatus) => void;
  /**
   * 改模块挂靠。与状态同为旁路轴（set-module 端点，不经 onPatch、不受 readOnly 管）；
   * 不传则模块格只读。
   */
  onModuleChange?: (moduleId: string | null, moduleName: string | null) => void;
};

/**
 * 抽屉标题正下方的属性条：类型、状态、优先级、负责人、起止日期、父项排成一行。
 *
 * 词汇与工作项 peek 的 PeekOverviewCorePropertyBar 对齐 —— 透明下拉、竖分隔线、
 * 图标表意（优先级图标 / 头像 / 日历），不写文字标签。同一个产品里同一类信息
 * 不该有两种读法；标签-值栅格留给整页右栏（RequirementDetailProperties）。
 */
export const RequirementPropertyBar = (props: TProps) => {
  const { requirement, requirementType, readOnly, parentScope, onPatch, onStatusChange, onModuleChange } = props;
  const { t } = useTranslation();

  const patch = (builtin: Partial<TRequirementBuiltinValues>) => void onPatch({ builtin });
  const isLibrary = Boolean(parentScope.libraryId) && !parentScope.productId;

  // 与工作项属性条同款的分格：首格贴齐标题文本起点，其余格带竖分隔线
  const fieldShell = (isFirst: boolean) =>
    cn("flex min-h-7 min-w-0 flex-1 items-stretch", !isFirst && "border-l border-subtle pl-2.5");

  return (
    <div className="flex w-full min-w-0 flex-nowrap items-stretch text-body-xs-medium">
      {/* 类型是这条需求的身份锚点（需求没有工作项那样的编号），恒占首格 */}
      <div className={fieldShell(true)}>
        <div className="flex h-7 min-w-0 items-center gap-1.5 text-body-xs-medium leading-5 text-secondary">
          {requirementType && (
            <TypeIcon iconProps={requirementType.logo_props?.icon} className="size-3.5" iconClassName="size-3.5" />
          )}
          <span className="truncate">{requirementType?.name ?? "—"}</span>
        </div>
      </div>

      {/* 模块：与状态同为旁路轴（set-module，不经 onPatch）。有 onModuleChange 才是下拉 */}
      <div className={fieldShell(false)}>
        {onModuleChange ? (
          <RequirementModuleDropdown
            workspaceSlug={parentScope.workspaceSlug}
            productId={parentScope.productId}
            libraryId={parentScope.libraryId}
            value={requirement.module_id}
            valueName={requirement.module_name}
            onChange={onModuleChange}
            icon={FolderOpenDot}
            buttonClassName="h-7 min-w-0 gap-1.5"
            buttonTextClassName="text-body-xs-medium leading-5"
          />
        ) : (
          <div
            className="flex h-7 min-w-0 items-center gap-1.5 text-body-xs-medium leading-5"
            title={requirement.module_name ?? undefined}
          >
            <FolderOpenDot className="size-3.5 shrink-0 text-tertiary" />
            <span className={cn("truncate", requirement.module_name ? "text-secondary" : "text-placeholder")}>
              {requirement.module_name ?? "—"}
            </span>
          </div>
        )}
      </div>

      {/* 状态 chip 与右侧几个 DropdownButton 同壳（h-5 边框小胶囊）；有 onStatusChange 才是下拉。标准库没有交付状态。 */}
      {!isLibrary && (
        <div className={fieldShell(false)}>
          <div className="flex h-7 min-w-0 items-center">
            <RequirementStatusCell variant="chip" status={requirement.status} onChange={onStatusChange} />
          </div>
        </div>
      )}

      <div className={fieldShell(false)}>
        <PriorityDropdown
          value={requirement.priority}
          onChange={(next) => patch({ priority: next as TRequirementPriority })}
          disabled={readOnly}
          buttonVariant="transparent-with-text"
          buttonContainerClassName="h-7 w-full min-w-0 text-left"
          buttonClassName={cn(
            "w-full min-w-0 truncate text-body-xs-medium leading-5 [&_svg]:size-3.5",
            !requirement.priority || requirement.priority === "none" ? "text-placeholder" : "text-secondary"
          )}
        />
      </div>

      {!isLibrary && (
        <div className={fieldShell(false)}>
          <MemberDropdown
            multiple={false}
            value={requirement.assignee_id}
            onChange={(memberId) => patch({ assignee_id: memberId })}
            disabled={readOnly}
            buttonVariant="transparent-with-text"
            placeholder={t("requirement_grid.data.select_member")}
            showUserDetails
            buttonContainerClassName="h-7 w-full min-w-0 text-left"
            buttonClassName={cn(
              "min-w-0 justify-start truncate text-body-xs-medium leading-5",
              requirement.assignee_id ? "text-secondary" : "text-placeholder"
            )}
          />
        </div>
      )}

      {!isLibrary && (
        <div className={fieldShell(false)}>
          <DateDropdown
            value={requirement.start_date}
            onChange={(date) => patch({ start_date: renderFormattedPayloadDate(date) ?? null })}
            maxDate={requirement.target_date ? new Date(requirement.target_date) : undefined}
            placeholder={t("requirement_fields.builtin.start_date")}
            buttonVariant="transparent-with-text"
            disabled={readOnly}
            className="group w-full min-w-0"
            buttonContainerClassName="h-7 w-full min-w-0 text-left"
            buttonClassName={cn(
              "w-full min-w-0 truncate text-body-xs-medium leading-5",
              requirement.start_date ? "text-secondary" : "text-placeholder"
            )}
            clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
          />
        </div>
      )}

      {!isLibrary && (
        <div className={fieldShell(false)}>
          <DateDropdown
            value={requirement.target_date}
            onChange={(date) => patch({ target_date: renderFormattedPayloadDate(date) ?? null })}
            minDate={requirement.start_date ? new Date(requirement.start_date) : undefined}
            placeholder={t("requirement_fields.builtin.target_date")}
            buttonVariant="transparent-with-text"
            disabled={readOnly}
            className="group w-full min-w-0"
            buttonContainerClassName="h-7 w-full min-w-0 text-left"
            buttonClassName={cn(
              "w-full min-w-0 truncate text-body-xs-medium leading-5",
              requirement.target_date ? "text-secondary" : "text-placeholder"
            )}
            clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
          />
        </div>
      )}

      <div className={fieldShell(false)}>
        <RequirementParentDropdown
          value={requirement.parent_id}
          onChange={(parentId) => patch({ parent_id: parentId })}
          excludeId={requirement.id}
          disabled={readOnly}
          icon={GitBranch}
          buttonClassName="h-7 gap-1.5 px-1.5"
          buttonTextClassName={cn("text-body-xs-medium", requirement.parent_id ? "text-secondary" : "text-placeholder")}
          {...parentScope}
        />
      </div>
    </div>
  );
};
