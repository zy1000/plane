/**
 * 项目需求筛选：工作项同款漏斗开关 + 筛选行。
 * 阶段是可添加/移除的条件，不常驻工具栏；类型筛选仍在工具栏左侧。
 *
 * 网格工具栏 portal 到页头右侧，挂点 id 见 PROJECT_REQUIREMENTS_HEADER_ACTIONS_ID。
 */
import { observer } from "mobx-react";
import { Transition } from "@headlessui/react";
import { ListFilterPlus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button, getButtonStyling } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { FilterAppliedIcon, FilterIcon } from "@plane/propel/icons";
import type { TRequirementProjectStage } from "@plane/types";
import { CustomMenu, EHeaderVariant, Header } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProjectRequirementStageFilter } from "./project-requirement-stage-filter";

export const PROJECT_REQUIREMENTS_HEADER_ACTIONS_ID = "project-requirements-header-actions";

type TToggleProps = {
  hasConditions: boolean;
  isVisible: boolean;
  onToggle: () => void;
};

export const ProjectRequirementFiltersToggle = observer(function ProjectRequirementFiltersToggle(props: TToggleProps) {
  const { hasConditions, isVisible, onToggle } = props;

  const activeFilterBaseClasses =
    "text-accent-primary border border-accent-subtle-1 hover:border-accent-subtle-1 active:border-accent-subtle-1 focus:border-accent-subtle-1";
  const noHoverStateClasses = "hover:text-accent-primary active:text-accent-primary focus:text-accent-primary";
  const backgroundClasses = isVisible
    ? "bg-accent-subtle-hover hover:bg-accent-subtle-hover active:bg-accent-subtle-hover focus:bg-accent-subtle-hover"
    : "bg-accent-subtle hover:bg-accent-subtle active:bg-accent-subtle focus:bg-accent-subtle";

  return (
    <IconButton
      size="lg"
      variant="secondary"
      icon={hasConditions ? FilterAppliedIcon : FilterIcon}
      onClick={onToggle}
      aria-label="切换筛选"
      className={cn({
        [activeFilterBaseClasses]: hasConditions,
        [backgroundClasses]: hasConditions,
        [noHoverStateClasses]: hasConditions,
      })}
      iconClassName={cn({
        "text-accent-primary [&_path]:fill-current": hasConditions,
      })}
    />
  );
});

type TRowProps = {
  isVisible: boolean;
  showStageChip: boolean;
  stageValue: TRequirementProjectStage | undefined;
  stageCounts: Record<TRequirementProjectStage, number> | undefined;
  totalCount: number;
  onStageChange: (stage: TRequirementProjectStage | undefined) => void;
  onAddStage: () => void;
  onRemoveStage: () => void;
};

export const ProjectRequirementFiltersRow = observer(function ProjectRequirementFiltersRow(props: TRowProps) {
  const {
    isVisible,
    showStageChip,
    stageValue,
    stageCounts,
    totalCount,
    onStageChange,
    onAddStage,
    onRemoveStage,
  } = props;
  const { t } = useTranslation();

  return (
    <Transition
      show={isVisible}
      enter="transition-all duration-150 ease-out"
      enterFrom="opacity-0 -translate-y-1"
      enterTo="opacity-100 translate-y-0"
      leave="transition-all duration-100 ease-in"
      leaveFrom="opacity-100 translate-y-0"
      leaveTo="opacity-0 -translate-y-1"
    >
      <Header variant={EHeaderVariant.TERNARY} className="min-h-11 bg-surface-1 !px-3">
        <div className="flex w-full items-start gap-2 rounded-lg bg-layer-1 px-4 py-2">
          <div className="flex w-full flex-wrap items-center gap-2">
            {showStageChip && (
              <ProjectRequirementStageFilter
                value={stageValue}
                counts={stageCounts}
                totalCount={totalCount}
                onChange={onStageChange}
                onRemove={onRemoveStage}
              />
            )}
            <CustomMenu
              customButton={<ListFilterPlus className="size-4 text-secondary" />}
              customButtonClassName={cn(getButtonStyling("secondary", "lg"), "py-[5px]")}
              placement="bottom-start"
              closeOnSelect
              maxHeight="md"
              ariaLabel="添加筛选"
            >
              {showStageChip ? (
                <CustomMenu.MenuItem disabled>
                  <span className="text-placeholder italic">All filters applied</span>
                </CustomMenu.MenuItem>
              ) : (
                <CustomMenu.MenuItem onClick={onAddStage}>
                  <span className="flex items-center gap-2 text-13 text-secondary">
                    <span aria-hidden className="size-3.5 shrink-0 rounded-full border-[1.5px] border-tertiary" />
                    {t("project_requirements.stage_column")}
                  </span>
                </CustomMenu.MenuItem>
              )}
            </CustomMenu>
          </div>
          {showStageChip && (
            <div className="flex items-center gap-2 border-l border-subtle pl-4">
              <Button variant="secondary" className="py-1" onClick={onRemoveStage}>
                {t("project_requirements.clear_filters")}
              </Button>
            </div>
          )}
        </div>
      </Header>
    </Transition>
  );
});
