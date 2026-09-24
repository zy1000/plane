import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import type { TProductOption } from "@plane/types";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDropdown } from "@/hooks/use-dropdown";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { DropdownButton } from "../buttons";
import { BUTTON_VARIANTS_WITHOUT_TEXT } from "../constants";
import type { TDropdownProps } from "../types";
import { ProductButtonContent } from "./button-content";
import { ProductOptions } from "./product-options";

export type TProductDropdownBaseProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  getProductById: (productId: string) => TProductOption | null;
  productIds?: string[];
  onChange: (val: string | null) => void;
  onClose?: () => void;
  onDropdownOpen?: () => void;
  renderByDefault?: boolean;
  value: string | null;
  /** 行上随行带出的名字：候选还没拉时也能回显 */
  valueName?: string | null;
};

/** 工作项「产品」单选下拉，结构照 dropdowns/release/base.tsx。 */
export const ProductDropdownBase = observer(function ProductDropdownBase(props: TProductDropdownBaseProps) {
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    getProductById,
    hideIcon = false,
    productIds,
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

  const selectedName = value ? (getProductById(value)?.name ?? valueName ?? null) : null;

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
            tooltipHeading="产品"
            tooltipContent={selectedName ?? ""}
            showTooltip={showTooltip}
            variant={buttonVariant}
            renderToolTipByDefault={renderByDefault}
          >
            <ProductButtonContent
              dropdownArrow={dropdownArrow}
              dropdownArrowClassName={dropdownArrowClassName}
              hideIcon={hideIcon}
              hideText={BUTTON_VARIANTS_WITHOUT_TEXT.includes(buttonVariant)}
              placeholder={placeholder}
              label={selectedName}
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
        <ProductOptions
          isOpen={isOpen}
          placement={placement}
          referenceElement={referenceElement}
          getProductById={getProductById}
          productIds={productIds}
          onDropdownOpen={onDropdownOpen}
          value={value}
        />
      )}
    </ComboDropDown>
  );
});
