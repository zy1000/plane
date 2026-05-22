/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
// ui
import { ComboDropDown } from "@plane/ui";
// helpers
import { cn } from "@plane/utils";
// hooks
import { useDropdown } from "@/hooks/use-dropdown";
import { useCycle } from "@/hooks/store/use-cycle";
// local components and constants
import { DropdownButton } from "../buttons";
import { BUTTON_VARIANTS_WITHOUT_TEXT } from "../constants";
import type { TDropdownProps } from "../types";
import { CycleButtonContent } from "./button-content";
import { CycleOptions } from "./cycle-options";

type Props = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  itemClassName?: string;
  onChange: (val: string | null) => void;
  onClose?: () => void;
  projectId: string | undefined;
  value: string | null;
  canRemoveCycle?: boolean;
  renderByDefault?: boolean;
  currentCycleId?: string;
  showCount?: boolean;
};

export const CycleDropdown = observer(function CycleDropdown(props: Props) {
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
    projectId,
    showCount = false,
    showTooltip = false,
    tabIndex,
    value,
    canRemoveCycle = true,
    renderByDefault = true,
    currentCycleId,
  } = props;
  // i18n
  const { t } = useTranslation();
  // states

  const [isOpen, setIsOpen] = useState(false);
  const { getCycleNameById } = useCycle();
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);

  const selectedName = value ? getCycleNameById(value) : null;

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
            tooltipHeading={t("common.cycle")}
            tooltipContent={selectedName ?? placeholder}
            showTooltip={showTooltip}
            variant={buttonVariant}
            renderToolTipByDefault={renderByDefault}
          >
            <CycleButtonContent
              canRemoveCycle={canRemoveCycle}
              className={itemClassName}
              disabled={disabled}
              dropdownArrow={dropdownArrow}
              dropdownArrowClassName={dropdownArrowClassName}
              hideIcon={hideIcon}
              hideText={BUTTON_VARIANTS_WITHOUT_TEXT.includes(buttonVariant)}
              onChange={onChange}
              placeholder={placeholder}
              showCount={showCount}
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
        <CycleOptions
          isOpen={isOpen}
          projectId={projectId}
          placement={placement}
          referenceElement={referenceElement}
          canRemoveCycle={canRemoveCycle}
          currentCycleId={currentCycleId}
        />
      )}
    </ComboDropDown>
  );
});
