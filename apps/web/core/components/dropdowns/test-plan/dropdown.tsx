import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ClipboardCheck } from "lucide-react";
import { ChevronDownIcon } from "@plane/propel/icons";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDropdown } from "@/hooks/use-dropdown";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { PlanService } from "@/services/qa/plan.service";
import { DropdownButton } from "../buttons";
import { BUTTON_VARIANTS_WITHOUT_TEXT } from "../constants";
import type { TDropdownProps } from "../types";
import { TestPlanOptions } from "./options";

const planService = new PlanService();

export const getTestPlanOptionsKey = (workspaceSlug: string, projectId: string) =>
  `TEST_PLAN_OPTIONS_${workspaceSlug}_${projectId}`;

type TTestPlanDropdownProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  onChange: (val: string | null) => void;
  onClose?: () => void;
  renderByDefault?: boolean;
  value: string | null;
};

/** 缺陷「测试计划」单选下拉：候选 = 本项目的测试计划；挂载即拉（SWR 按项目缓存），未展开也能回显计划名。 */
export const TestPlanDropdown = observer(function TestPlanDropdown(props: TTestPlanDropdownProps) {
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    hideIcon = false,
    onChange,
    onClose,
    placeholder = "",
    placement,
    projectId,
    renderByDefault = true,
    showTooltip = false,
    tabIndex,
    value,
    workspaceSlug,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const { isMobile } = usePlatformOS();

  const { data: plans } = useSWR(
    workspaceSlug && projectId ? getTestPlanOptionsKey(workspaceSlug, projectId) : null,
    workspaceSlug && projectId ? () => planService.getPlanList(workspaceSlug, { project_id: projectId }) : null,
    { revalidateOnFocus: false }
  );

  const { handleClose, handleKeyDown, handleOnClick } = useDropdown({
    dropdownRef,
    inputRef,
    isOpen,
    onClose,
    setIsOpen,
  });

  const dropdownOnChange = (val: string | null) => {
    onChange(val);
    handleClose();
  };

  useEffect(() => {
    if (isOpen && inputRef.current && !isMobile) {
      inputRef.current.focus();
    }
  }, [isOpen, isMobile]);

  // 计划已删除（后端会清引用，这里兜底）或列表还没回来时退回占位
  const selectedName = value ? (plans?.find((plan) => String(plan.id) === String(value))?.name ?? null) : null;
  const hideText = BUTTON_VARIANTS_WITHOUT_TEXT.includes(buttonVariant);

  const buttonContent = (
    <>
      {!hideIcon && <ClipboardCheck className="h-3 w-3 flex-shrink-0" />}
      {!hideText && (
        <span className="min-w-0 flex-1 truncate text-left text-body-xs-medium leading-5">
          {selectedName || placeholder}
        </span>
      )}
      {dropdownArrow && (
        <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
      )}
    </>
  );

  const comboButton = button ? (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn("clickable block h-full w-full outline-none hover:bg-layer-1", buttonContainerClassName)}
      onClick={handleOnClick}
      disabled={disabled}
      tabIndex={tabIndex}
    >
      {button}
    </button>
  ) : (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn(
        "clickable block h-full max-w-full outline-none hover:bg-layer-1",
        {
          "cursor-not-allowed text-secondary": disabled,
          "cursor-pointer": !disabled,
        },
        buttonContainerClassName
      )}
      onClick={handleOnClick}
      disabled={disabled}
      tabIndex={tabIndex}
    >
      <DropdownButton
        className={buttonClassName}
        isActive={isOpen}
        tooltipHeading="测试计划"
        tooltipContent={selectedName ?? ""}
        showTooltip={showTooltip}
        variant={buttonVariant}
        renderToolTipByDefault={renderByDefault}
      >
        {buttonContent}
      </DropdownButton>
    </button>
  );

  return (
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      className={cn("h-full", className)}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
      value={value}
      onChange={dropdownOnChange}
      disabled={disabled}
    >
      {isOpen && (
        <TestPlanOptions
          isOpen={isOpen}
          placement={placement}
          referenceElement={referenceElement}
          plans={plans}
          value={value}
        />
      )}
    </ComboDropDown>
  );
});
