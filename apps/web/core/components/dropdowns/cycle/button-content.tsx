/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CloseIcon, CycleIcon, ChevronDownIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { useCycle } from "@/hooks/store/use-cycle";
import { usePlatformOS } from "@/hooks/use-platform-os";

type CycleButtonContentProps = {
  canRemoveCycle?: boolean;
  className?: string;
  disabled: boolean;
  dropdownArrow: boolean;
  dropdownArrowClassName: string;
  hideIcon: boolean;
  hideText: boolean;
  onChange: (cycleId: string | null) => void;
  placeholder?: string;
  showCount?: boolean;
  showTooltip?: boolean;
  value: string | null;
};

export function CycleButtonContent(props: CycleButtonContentProps) {
  const {
    canRemoveCycle = true,
    className,
    disabled,
    dropdownArrow,
    dropdownArrowClassName,
    hideIcon,
    hideText,
    onChange,
    placeholder,
    showCount = false,
    showTooltip = false,
    value,
  } = props;
  const { getCycleNameById } = useCycle();
  const { isMobile } = usePlatformOS();

  const selectedName = value ? getCycleNameById(value) : null;

  if (showCount) {
    return (
      <>
        <div className="relative flex max-w-full items-center gap-1">
          {!hideIcon && <CycleIcon className="h-3 w-3 flex-shrink-0" />}
          {(selectedName || !!placeholder) && (
            <div className="min-w-0 flex-1 truncate text-left text-body-xs-medium leading-5">
              {selectedName ?? placeholder}
            </div>
          )}
        </div>
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </>
    );
  }

  if (value && selectedName) {
    return (
      <>
        <div className="flex max-w-full flex-grow flex-wrap items-center gap-2 truncate py-0.5">
          <div
            className={cn("flex max-w-full items-center gap-1 rounded-sm bg-layer-1 py-1 text-secondary", className)}
          >
            {!hideIcon && <CycleIcon className="h-2.5 w-2.5 flex-shrink-0" />}
            {!hideText && (
              <Tooltip
                tooltipHeading="Title"
                tooltipContent={selectedName}
                disabled={!showTooltip}
                isMobile={isMobile}
                renderByDefault={false}
              >
                <span className="max-w-40 truncate text-11 font-medium">{selectedName}</span>
              </Tooltip>
            )}
            {!disabled && canRemoveCycle && (
              <Tooltip tooltipContent="Remove" disabled={!showTooltip} isMobile={isMobile} renderByDefault={false}>
                <button
                  type="button"
                  className="flex-shrink-0"
                  onClick={() => {
                    onChange(null);
                  }}
                >
                  <CloseIcon className="h-2.5 w-2.5 text-tertiary hover:text-danger-primary" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </>
    );
  }

  return (
    <>
      {!hideIcon && <CycleIcon className="h-3 w-3 flex-shrink-0" />}
      {!hideText && (
        <span className="min-w-0 flex-1 truncate text-left text-body-xs-medium leading-5">{placeholder}</span>
      )}
      {dropdownArrow && (
        <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
      )}
    </>
  );
}
