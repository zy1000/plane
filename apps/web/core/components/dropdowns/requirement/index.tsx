import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDropdown } from "@/hooks/use-dropdown";
import { DropdownButton } from "../buttons";
import { BUTTON_VARIANTS_WITHOUT_TEXT } from "../constants";
import type { TDropdownProps } from "../types";
import { RequirementButtonContent } from "./button-content";
import { RequirementOptions } from "./requirement-options";

type Props = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  itemClassName?: string;
  onChange: (val: string | null) => void;
  onClose?: () => void;
  workspaceSlug: string;
  projectId: string | undefined;
  value: string | null;
  selectedLabel: string | null;
  canRemoveRequirement?: boolean;
  renderByDefault?: boolean;
};

export function RequirementDropdown(props: Props) {
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
    itemClassName = "",
    onChange,
    onClose,
    placeholder = "",
    placement,
    workspaceSlug,
    projectId,
    showTooltip = false,
    tabIndex,
    value,
    selectedLabel,
    canRemoveRequirement = true,
    renderByDefault = true,
  } = props;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);

  const { handleClose, handleKeyDown, handleOnClick } = useDropdown({
    dropdownRef,
    isOpen,
    onClose,
    setIsOpen,
  });

  const dropdownOnChange = (val: string | null) => {
    onChange(val);
    handleClose();
  };

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
            tooltipHeading={t("project_requirements.issues.source_requirement")}
            tooltipContent={selectedLabel ?? placeholder}
            showTooltip={showTooltip}
            variant={buttonVariant}
            renderToolTipByDefault={renderByDefault}
          >
            <RequirementButtonContent
              canRemoveRequirement={canRemoveRequirement}
              className={itemClassName}
              disabled={disabled}
              dropdownArrow={dropdownArrow}
              dropdownArrowClassName={dropdownArrowClassName}
              hideIcon={hideIcon}
              hideText={BUTTON_VARIANTS_WITHOUT_TEXT.includes(buttonVariant)}
              onChange={onChange}
              placeholder={placeholder}
              selectedLabel={selectedLabel}
              showTooltip={showTooltip}
              value={value}
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
      value={value}
      onChange={dropdownOnChange}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
    >
      {isOpen && projectId && (
        <RequirementOptions
          isOpen={isOpen}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          placement={placement}
          referenceElement={referenceElement}
          canRemoveRequirement={canRemoveRequirement}
        />
      )}
    </ComboDropDown>
  );
}
