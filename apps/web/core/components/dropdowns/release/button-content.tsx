import { Rocket } from "lucide-react";
import { CloseIcon, ChevronDownIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { useRelease } from "@/hooks/store/use-release";
import { usePlatformOS } from "@/hooks/use-platform-os";

type ReleaseButtonContentProps = {
  disabled: boolean;
  dropdownArrow: boolean;
  dropdownArrowClassName: string;
  hideIcon: boolean;
  hideText: boolean;
  onChange: (releaseIds: string[]) => void;
  placeholder?: string;
  showCount: boolean;
  showTooltip?: boolean;
  value: string | string[] | null;
  className?: string;
};

export function ReleaseButtonContent(props: ReleaseButtonContentProps) {
  const {
    disabled,
    dropdownArrow,
    dropdownArrowClassName,
    hideIcon,
    hideText,
    onChange,
    placeholder,
    showCount,
    showTooltip = false,
    value,
    className,
  } = props;
  const { getReleaseById } = useRelease();
  const { isMobile } = usePlatformOS();

  if (Array.isArray(value))
    return (
      <>
        {showCount ? (
          <div className="relative flex max-w-full items-center gap-1">
            {!hideIcon && <Rocket className="h-3 w-3 flex-shrink-0" />}
            {(value.length > 0 || !!placeholder) && (
              <div className="min-w-0 flex-1 max-w-40 truncate text-left">
                {value.length > 0
                  ? value.length === 1
                    ? `${getReleaseById(value[0])?.name || "release"}`
                    : `${value.length} 个发布`
                  : placeholder}
              </div>
            )}
          </div>
        ) : value.length > 0 ? (
          <div className="flex max-w-full flex-grow flex-wrap items-center gap-2 truncate py-0.5">
            {value.map((releaseId) => {
              const releaseDetails = getReleaseById(releaseId);
              return (
                <div
                  key={releaseId}
                  className={cn(
                    "flex max-w-full items-center gap-1 rounded-sm bg-layer-1 py-1 text-secondary",
                    className
                  )}
                >
                  {!hideIcon && <Rocket className="h-2.5 w-2.5 flex-shrink-0" />}
                  {!hideText && (
                    <Tooltip
                      tooltipHeading="Title"
                      tooltipContent={releaseDetails?.name}
                      disabled={!showTooltip}
                      isMobile={isMobile}
                      renderByDefault={false}
                    >
                      <span className="max-w-40 truncate text-11 font-medium">{releaseDetails?.name}</span>
                    </Tooltip>
                  )}
                  {!disabled && (
                    <Tooltip
                      tooltipContent="Remove"
                      disabled={!showTooltip}
                      isMobile={isMobile}
                      renderByDefault={false}
                    >
                      <button
                        type="button"
                        className="flex-shrink-0"
                        onClick={() => {
                          const newReleaseIds = value.filter((r) => r !== releaseId);
                          onChange(newReleaseIds);
                        }}
                      >
                        <CloseIcon className="h-2.5 w-2.5 text-tertiary hover:text-danger-primary" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {!hideIcon && <Rocket className="h-3 w-3 flex-shrink-0" />}
            <span className="flex-grow truncate text-left">{placeholder}</span>
          </>
        )}
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </>
    );
  else
    return (
      <>
        {!hideIcon && <Rocket className="h-3 w-3 flex-shrink-0" />}
        {!hideText && (
          <span className="flex-grow truncate text-left">{value ? getReleaseById(value)?.name : placeholder}</span>
        )}
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </>
    );
}
