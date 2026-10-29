import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TProjectStage } from "@plane/types";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDropdown } from "@/hooks/use-dropdown";
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TProjectStageOption } from "@/store/project-stage.store";
import { DropdownButton } from "../buttons";
import { BUTTON_VARIANTS_WITHOUT_TEXT } from "../constants";
import type { TDropdownProps } from "../types";
import { ProjectStageButtonContent } from "./button-content";
import { ProjectStageOptions } from "./project-stage-options";

export type TProjectStageDropdownBaseProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  getStageById: (stageId: string) => TProjectStage | null;
  /** undefined = 还没拉到候选 */
  options?: TProjectStageOption[];
  onChange: (val: string | null) => void;
  onClose?: () => void;
  onDropdownOpen?: () => void;
  renderByDefault?: boolean;
  value: string | null;
  /** 行上随行带出的名字：候选还没拉时也能回显 */
  valueName?: string | null;
  tooltipHeading?: string;
};

/** 「阶段」单选下拉，结构照 dropdowns/product/base.tsx；选项带编码与树形缩进。 */
export const ProjectStageDropdownBase = observer(function ProjectStageDropdownBase(
  props: TProjectStageDropdownBaseProps
) {
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    getStageById,
    hideIcon = false,
    options,
    onChange,
    onClose,
    onDropdownOpen,
    placeholder = "",
    placement,
    renderByDefault = true,
    showTooltip = false,
    tabIndex,
    value,
    valueName,
    tooltipHeading,
  } = props;
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const { isMobile } = usePlatformOS();

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

  const selectedStage = value ? getStageById(value) : null;
  const selectedName = value ? (selectedStage?.name ?? valueName ?? null) : null;
  const selectedCode = selectedStage && !selectedStage.parent_id ? selectedStage.code : null;

  const comboButton = (
    <>
      {button ? (
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
            tooltipHeading={tooltipHeading ?? t("stage_field.label")}
            tooltipContent={selectedName ?? ""}
            showTooltip={showTooltip}
            variant={buttonVariant}
            renderToolTipByDefault={renderByDefault}
          >
            <ProjectStageButtonContent
              dropdownArrow={dropdownArrow}
              dropdownArrowClassName={dropdownArrowClassName}
              hideIcon={hideIcon}
              hideText={BUTTON_VARIANTS_WITHOUT_TEXT.includes(buttonVariant)}
              placeholder={placeholder}
              label={selectedName}
              code={selectedCode}
            />
          </DropdownButton>
        </button>
      )}
    </>
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
        <ProjectStageOptions
          isOpen={isOpen}
          placement={placement}
          referenceElement={referenceElement}
          options={options}
          onDropdownOpen={onDropdownOpen}
          value={value}
        />
      )}
    </ComboDropDown>
  );
});
