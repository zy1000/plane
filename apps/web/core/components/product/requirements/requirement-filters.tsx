import { observer } from "mobx-react";
import { CircleDot, FilePenLine, ListFilterPlus, SignalHigh, Users, X } from "lucide-react";
import { Button, getButtonStyling } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { FilterAppliedIcon, FilterIcon, PriorityIcon } from "@plane/propel/icons";
import type { TIssuePriorities } from "@plane/propel/icons";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

export type TRequirementFilterKey = "status" | "change_status" | "priority" | "assignee";

export const REQUIREMENT_FILTER_KEYS: TRequirementFilterKey[] = ["status", "change_status", "priority", "assignee"];

const STATUS_FILTER_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "in_review", label: "评审中" },
  { value: "published", label: "已发布" },
  { value: "rejected", label: "拒绝" },
  { value: "closed", label: "已关闭" },
];

const CHANGE_STATUS_FILTER_OPTIONS = [
  { value: "draft", label: "修订草稿" },
  { value: "pending", label: "修订评审中" },
  { value: "none", label: "无开放修订" },
];

const PRIORITY_FILTER_OPTIONS: { value: TIssuePriorities; label: string }[] = [
  { value: "urgent", label: "紧急" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
  { value: "none", label: "无" },
];

const FILTER_META: Record<TRequirementFilterKey, { label: string; icon: typeof SignalHigh }> = {
  status: { label: "状态", icon: CircleDot },
  change_status: { label: "修订状态", icon: FilePenLine },
  priority: { label: "优先级", icon: SignalHigh },
  assignee: { label: "负责人", icon: Users },
};

type TRequirementFiltersToggleProps = {
  isVisible: boolean;
  hasAppliedFilters: boolean;
  onToggle: () => void;
};

export const RequirementFiltersToggle = observer(function RequirementFiltersToggle(
  props: TRequirementFiltersToggleProps
) {
  const { isVisible, hasAppliedFilters, onToggle } = props;
  return (
    <IconButton
      size="lg"
      variant="secondary"
      icon={hasAppliedFilters ? FilterAppliedIcon : FilterIcon}
      onClick={onToggle}
      className={cn({
        "border-accent-subtle-1 text-accent-primary": hasAppliedFilters,
        "bg-accent-subtle-hover": hasAppliedFilters && isVisible,
        "bg-accent-subtle": hasAppliedFilters && !isVisible,
      })}
      iconClassName={cn({ "text-accent-primary [&_path]:fill-current": hasAppliedFilters })}
    />
  );
});

type TFilterChipProps = {
  icon: typeof SignalHigh;
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
};

function FilterChip(props: TFilterChipProps) {
  const { icon: Icon, label, onRemove, children } = props;
  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-sm border border-subtle bg-surface-1">
      <div className="flex items-center gap-1 border-r border-subtle-1 px-2 text-11 text-tertiary">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="flex items-center border-r border-subtle-1">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`移除${label}筛选`}
        className="bg-layer-transparent px-1.5 text-placeholder hover:bg-layer-transparent-hover hover:text-tertiary focus:outline-none"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

type TRequirementFiltersRowProps = {
  isVisible: boolean;
  activeKeys: TRequirementFilterKey[];
  status: string;
  changeStatus: string;
  priority: string;
  assigneeId: string | null;
  totalCount: number;
  onAddFilter: (key: TRequirementFilterKey) => void;
  onRemoveFilter: (key: TRequirementFilterKey) => void;
  onPriorityChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onChangeStatusChange: (value: string) => void;
  onAssigneeChange: (value: string | null) => void;
  onClearAll: () => void;
};

export const RequirementFiltersRow = observer(function RequirementFiltersRow(props: TRequirementFiltersRowProps) {
  const {
    isVisible,
    activeKeys,
    status,
    changeStatus,
    priority,
    assigneeId,
    totalCount,
    onAddFilter,
    onRemoveFilter,
    onPriorityChange,
    onStatusChange,
    onChangeStatusChange,
    onAssigneeChange,
    onClearAll,
  } = props;

  if (!isVisible) return null;

  const availableKeys = REQUIREMENT_FILTER_KEYS.filter((key) => !activeKeys.includes(key));
  const hasAppliedFilters = !!(status || changeStatus || priority || assigneeId);
  const selectedPriorityLabel = PRIORITY_FILTER_OPTIONS.find((item) => item.value === priority)?.label;

  const addFilterOptions = availableKeys.map((key) => {
    const Icon = FILTER_META[key].icon;
    return {
      value: key,
      content: (
        <span className="flex items-center gap-2">
          <Icon className="size-4 text-tertiary" />
          {FILTER_META[key].label}
        </span>
      ),
      query: FILTER_META[key].label,
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-layer-1/50 px-3 py-2">
      {activeKeys.includes("status") && (
        <FilterChip
          icon={FILTER_META.status.icon}
          label={FILTER_META.status.label}
          onRemove={() => onRemoveFilter("status")}
        >
          <CustomSearchSelect
            value={status}
            onChange={onStatusChange}
            options={STATUS_FILTER_OPTIONS.map((item) => ({
              value: item.value,
              content: item.label,
              query: item.label,
            }))}
            optionsClassName="w-40"
            maxHeight="rg"
            placement="bottom-start"
            customButton={
              <span className="flex h-7 items-center px-2 text-11 text-secondary">
                {STATUS_FILTER_OPTIONS.find((item) => item.value === status)?.label ?? "选择状态"}
              </span>
            }
          />
        </FilterChip>
      )}

      {activeKeys.includes("change_status") && (
        <FilterChip
          icon={FILTER_META.change_status.icon}
          label={FILTER_META.change_status.label}
          onRemove={() => onRemoveFilter("change_status")}
        >
          <CustomSearchSelect
            value={changeStatus}
            onChange={onChangeStatusChange}
            options={CHANGE_STATUS_FILTER_OPTIONS.map((item) => ({
              value: item.value,
              content: item.label,
              query: item.label,
            }))}
            optionsClassName="w-40"
            maxHeight="rg"
            placement="bottom-start"
            customButton={
              <span className="flex h-7 items-center px-2 text-11 text-secondary">
                {CHANGE_STATUS_FILTER_OPTIONS.find((item) => item.value === changeStatus)?.label ?? "选择修订状态"}
              </span>
            }
          />
        </FilterChip>
      )}

      {activeKeys.includes("priority") && (
        <FilterChip
          icon={FILTER_META.priority.icon}
          label={FILTER_META.priority.label}
          onRemove={() => onRemoveFilter("priority")}
        >
          <CustomSearchSelect
            value={priority}
            onChange={onPriorityChange}
            options={PRIORITY_FILTER_OPTIONS.map((item) => ({
              value: item.value,
              content: (
                <span className="flex items-center gap-1.5">
                  <PriorityIcon priority={item.value} size={12} withContainer />
                  {item.label}
                </span>
              ),
              query: item.label,
            }))}
            optionsClassName="w-40"
            maxHeight="rg"
            placement="bottom-start"
            customButton={
              <span className="flex h-7 items-center gap-1.5 px-2 text-11 text-secondary">
                {priority ? (
                  <>
                    <PriorityIcon priority={priority as TIssuePriorities} size={12} withContainer />
                    {selectedPriorityLabel}
                  </>
                ) : (
                  <span className="text-placeholder">选择优先级</span>
                )}
              </span>
            }
          />
        </FilterChip>
      )}

      {activeKeys.includes("assignee") && (
        <FilterChip
          icon={FILTER_META.assignee.icon}
          label={FILTER_META.assignee.label}
          onRemove={() => onRemoveFilter("assignee")}
        >
          <MemberDropdown
            value={assigneeId}
            onChange={onAssigneeChange}
            multiple={false}
            placeholder="选择负责人"
            buttonVariant="transparent-with-text"
            buttonClassName="h-7 px-2 text-11"
          />
        </FilterChip>
      )}

      {availableKeys.length > 0 && (
        <CustomSearchSelect
          value=""
          onChange={(value: string) => onAddFilter(value as TRequirementFilterKey)}
          options={addFilterOptions}
          optionsClassName="w-48"
          maxHeight="rg"
          placement="bottom-start"
          customButton={
            <span className={cn(getButtonStyling("secondary", "lg"), "flex items-center gap-1 py-[5px]")}>
              <ListFilterPlus className="size-4 text-secondary" />
              添加筛选
            </span>
          }
        />
      )}

      {hasAppliedFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={onClearAll}>
          清除筛选
        </Button>
      )}

      <span className="ml-auto text-11 text-tertiary">共 {totalCount} 条需求</span>
    </div>
  );
});
