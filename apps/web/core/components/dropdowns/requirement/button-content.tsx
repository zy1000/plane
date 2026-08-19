import { FileText } from "lucide-react";
import { CloseIcon, ChevronDownIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { usePlatformOS } from "@/hooks/use-platform-os";

type RequirementButtonContentProps = {
  canRemoveRequirement?: boolean;
  className?: string;
  disabled: boolean;
  dropdownArrow: boolean;
  dropdownArrowClassName: string;
  hideIcon: boolean;
  hideText: boolean;
  onChange: (requirementId: string | null) => void;
  placeholder?: string;
  selectedLabel: string | null;
  showTooltip?: boolean;
  value: string | null;
};

export function RequirementButtonContent(props: RequirementButtonContentProps) {
  const {
    canRemoveRequirement = true,
    className,
    disabled,
    dropdownArrow,
    dropdownArrowClassName,
    hideIcon,
    hideText,
    onChange,
    placeholder,
    selectedLabel,
    showTooltip = false,
    value,
  } = props;
  const { isMobile } = usePlatformOS();

  if (value && selectedLabel) {
    return (
      <>
        <div className="flex max-w-full flex-grow flex-wrap items-center gap-2 truncate py-0.5">
          <div
            className={cn("flex max-w-full items-center gap-1 rounded-sm bg-layer-1 py-1 text-secondary", className)}
          >
            {!hideIcon && <FileText className="h-2.5 w-2.5 flex-shrink-0" />}
            {!hideText && (
              <Tooltip
                tooltipHeading="Title"
                tooltipContent={selectedLabel}
                disabled={!showTooltip}
                isMobile={isMobile}
                renderByDefault={false}
              >
                <span className="max-w-40 truncate text-11 font-medium">{selectedLabel}</span>
              </Tooltip>
            )}
            {!disabled && canRemoveRequirement && (
              <Tooltip tooltipContent="Remove" disabled={!showTooltip} isMobile={isMobile} renderByDefault={false}>
                <button
                  type="button"
                  className="flex-shrink-0"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
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
      {!hideIcon && <FileText className="h-3 w-3 flex-shrink-0" />}
      {!hideText && (
        <span className="min-w-0 flex-1 truncate text-left text-body-xs-medium leading-5">{placeholder}</span>
      )}
      {dropdownArrow && (
        <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
      )}
    </>
  );
}
