"use client";

import { FolderOpenDot, GitBranch } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirement,
  TRequirementBuiltinValues,
  TRequirementItemStatus,
  TRequirementPriority,
} from "@plane/types";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { RequirementModuleDropdown } from "../module-tree/requirement-module-dropdown";
import { RequirementParentDropdown } from "../requirement-parent-dropdown";
import { RequirementStatusCell } from "../requirement-status-cell";

type TProps = {
  requirement: TRequirement;
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
 * 每格的外壳：一枚描边小胶囊。控件本身全是透明底，边框与 hover 底色由外壳统一给，
 * 七个格子才长得一样 —— 下拉组件各自的 border 变体粗细、圆角并不一致。
 */
const CHIP_SHELL =
  "flex h-7 min-w-0 max-w-full items-center rounded-md border border-subtle bg-surface-1 transition-colors hover:border-strong hover:bg-layer-2-hover";
const CHIP_TEXT = "text-body-xs-medium leading-5";

/**
 * 抽屉标题正下方的属性条：模块、状态、优先级、负责人、起止日期、父项。
 *
 * 需求类型不在这里 —— 它是这条需求的身份，放在头部编号旁；这一条只放能改的东西。
 * 图标表意（文件夹 / 优先级图标 / 头像 / 日历 / 分支），不写文字标签，与工作项 peek 同一读法。
 */
export const RequirementPropertyBar = (props: TProps) => {
  const { requirement, readOnly, parentScope, onPatch, onStatusChange, onModuleChange } = props;
  const { t } = useTranslation();

  const patch = (builtin: Partial<TRequirementBuiltinValues>) => void onPatch({ builtin });
  const isLibrary = Boolean(parentScope.libraryId) && !parentScope.productId;

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
      {/* 模块：与状态同为旁路轴（set-module，不经 onPatch）。有 onModuleChange 才是下拉 */}
      <div className={CHIP_SHELL}>
        {onModuleChange ? (
          <RequirementModuleDropdown
            workspaceSlug={parentScope.workspaceSlug}
            productId={parentScope.productId}
            libraryId={parentScope.libraryId}
            value={requirement.module_id}
            valueName={requirement.module_name}
            onChange={onModuleChange}
            icon={FolderOpenDot}
            buttonClassName="h-full min-w-0 gap-1.5 px-2"
            buttonTextClassName={CHIP_TEXT}
          />
        ) : (
          <div className={cn("flex h-full min-w-0 items-center gap-1.5 px-2", CHIP_TEXT)} title={requirement.module_name ?? undefined}>
            <FolderOpenDot className="size-3.5 shrink-0 text-tertiary" />
            <span className={cn("truncate", requirement.module_name ? "text-secondary" : "text-placeholder")}>
              {requirement.module_name ?? t("requirement_modules.column")}
            </span>
          </div>
        )}
      </div>

      {/* 状态 chip：有 onStatusChange 才是下拉。标准库没有交付状态。 */}
      {!isLibrary && (
        <RequirementStatusCell
          variant="chip"
          status={requirement.status}
          onChange={onStatusChange}
          className="h-7 rounded-md border border-subtle px-2 transition-colors hover:border-strong hover:bg-layer-2-hover"
        />
      )}

      <div className={CHIP_SHELL}>
        <PriorityDropdown
          value={requirement.priority}
          onChange={(next) => patch({ priority: next as TRequirementPriority })}
          disabled={readOnly}
          buttonVariant="transparent-with-text"
          buttonContainerClassName="h-full min-w-0 text-left"
          buttonClassName={cn(
            "h-full min-w-0 truncate px-2 [&_svg]:size-3.5",
            CHIP_TEXT,
            !requirement.priority || requirement.priority === "none" ? "text-placeholder" : "text-secondary"
          )}
        />
      </div>

      {!isLibrary && (
        <div className={CHIP_SHELL}>
          <MemberDropdown
            multiple={false}
            value={requirement.assignee_id}
            onChange={(memberId) => patch({ assignee_id: memberId })}
            disabled={readOnly}
            buttonVariant="transparent-with-text"
            placeholder={t("requirement_grid.data.select_member")}
            showUserDetails
            buttonContainerClassName="h-full min-w-0 text-left"
            buttonClassName={cn(
              "h-full min-w-0 justify-start truncate px-2",
              CHIP_TEXT,
              requirement.assignee_id ? "text-secondary" : "text-placeholder"
            )}
          />
        </div>
      )}

      {!isLibrary && (
        <div className={cn(CHIP_SHELL, "group")}>
          <DateDropdown
            value={requirement.start_date}
            onChange={(date) => patch({ start_date: renderFormattedPayloadDate(date) ?? null })}
            maxDate={requirement.target_date ? new Date(requirement.target_date) : undefined}
            placeholder={t("requirement_fields.builtin.start_date")}
            buttonVariant="transparent-with-text"
            disabled={readOnly}
            className="h-full min-w-0"
            buttonContainerClassName="h-full min-w-0 text-left"
            buttonClassName={cn(
              "h-full min-w-0 truncate px-2",
              CHIP_TEXT,
              requirement.start_date ? "text-secondary" : "text-placeholder"
            )}
            clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
          />
        </div>
      )}

      {!isLibrary && (
        <div className={cn(CHIP_SHELL, "group")}>
          <DateDropdown
            value={requirement.target_date}
            onChange={(date) => patch({ target_date: renderFormattedPayloadDate(date) ?? null })}
            minDate={requirement.start_date ? new Date(requirement.start_date) : undefined}
            placeholder={t("requirement_fields.builtin.target_date")}
            buttonVariant="transparent-with-text"
            disabled={readOnly}
            className="h-full min-w-0"
            buttonContainerClassName="h-full min-w-0 text-left"
            buttonClassName={cn(
              "h-full min-w-0 truncate px-2",
              CHIP_TEXT,
              requirement.target_date ? "text-secondary" : "text-placeholder"
            )}
            clearIconClassName="text-tertiary opacity-0 group-hover:opacity-100"
          />
        </div>
      )}

      <div className={CHIP_SHELL}>
        <RequirementParentDropdown
          value={requirement.parent_id}
          onChange={(parentId) => patch({ parent_id: parentId })}
          excludeId={requirement.id}
          disabled={readOnly}
          icon={GitBranch}
          placeholder={t("requirement_fields.builtin.parent")}
          buttonClassName="h-full gap-1.5 px-2"
          buttonTextClassName={cn(CHIP_TEXT, requirement.parent_id ? "text-secondary" : "text-placeholder")}
          {...parentScope}
        />
      </div>
    </div>
  );
};
