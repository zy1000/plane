import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Boxes } from "lucide-react";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { TFlatProductModule } from "@plane/types";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDropdown } from "@/hooks/use-dropdown";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { DropdownButton } from "../buttons";
import { BUTTON_VARIANTS_WITHOUT_TEXT } from "../constants";
import type { TDropdownProps } from "../types";
import { ProductModuleOptions } from "./product-module-options";

export type TProductModuleDropdownBaseProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  getProductModuleById: (moduleId: string) => TFlatProductModule | null;
  moduleIds?: string[];
  onChange: (val: string | null) => void;
  onClose?: () => void;
  onDropdownOpen?: () => void;
  renderByDefault?: boolean;
  value: string | null;
  valueName?: string | null;
};

/** 工作项「产品模块」单选下拉，结构照 dropdowns/product/base.tsx；按钮回显模块名，选项显示路径。 */
export const ProductModuleDropdownBase = observer(function ProductModuleDropdownBase(
  props: TProductModuleDropdownBaseProps
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
    getProductModuleById,
    hideIcon = false,
    moduleIds,
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
  } = props;

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

  const selected = value ? getProductModuleById(value) : null;
  const selectedName = value ? (selected?.name ?? valueName ?? null) : null;
  const hideText = BUTTON_VARIANTS_WITHOUT_TEXT.includes(buttonVariant);

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
            tooltipHeading="产品模块"
            tooltipContent={selected?.path ?? selectedName ?? ""}
            showTooltip={showTooltip}
            variant={buttonVariant}
            renderToolTipByDefault={renderByDefault}
          >
            {!hideIcon && <Boxes className="h-3 w-3 flex-shrink-0" />}
            {!hideText && (
              <span className="min-w-0 flex-1 truncate text-left text-body-xs-medium leading-5">
                {selectedName || placeholder}
              </span>
            )}
            {dropdownArrow && (
              <ChevronDownIcon
                className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)}
                aria-hidden="true"
              />
            )}
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
        <ProductModuleOptions
          isOpen={isOpen}
          placement={placement}
          referenceElement={referenceElement}
          getProductModuleById={getProductModuleById}
          moduleIds={moduleIds}
          onDropdownOpen={onDropdownOpen}
          value={value}
        />
      )}
    </ComboDropDown>
  );
});
