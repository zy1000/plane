import { Layers } from "lucide-react";
import { ChevronDownIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";

type ProjectStageButtonContentProps = {
  dropdownArrow: boolean;
  dropdownArrowClassName: string;
  hideIcon: boolean;
  hideText: boolean;
  placeholder?: string;
  label: string | null;
  /** 根阶段带编码（M030），子阶段不带 */
  code?: string | null;
};

export function ProjectStageButtonContent(props: ProjectStageButtonContentProps) {
  const { dropdownArrow, dropdownArrowClassName, hideIcon, hideText, placeholder, label, code } = props;
  return (
    <>
      {!hideIcon && <Layers className="h-3 w-3 flex-shrink-0" />}
      {!hideText && (
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-body-xs-medium leading-5">
          {label && code && <span className="flex-shrink-0 text-10 text-placeholder">{code}</span>}
          <span className="truncate">{label || placeholder}</span>
        </span>
      )}
      {dropdownArrow && (
        <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
      )}
    </>
  );
}
