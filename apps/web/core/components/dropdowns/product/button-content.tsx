import { Package } from "lucide-react";
import { ChevronDownIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";

type ProductButtonContentProps = {
  dropdownArrow: boolean;
  dropdownArrowClassName: string;
  hideIcon: boolean;
  hideText: boolean;
  placeholder?: string;
  label: string | null;
  /** 多选时除第一个外还有几个，显示成「+N」 */
  extraCount?: number;
};

export function ProductButtonContent(props: ProductButtonContentProps) {
  const { dropdownArrow, dropdownArrowClassName, hideIcon, hideText, placeholder, label, extraCount = 0 } = props;
  return (
    <>
      {!hideIcon && <Package className="h-3 w-3 flex-shrink-0" />}
      {!hideText && (
        <span className="min-w-0 flex-1 truncate text-left text-body-xs-medium leading-5">{label || placeholder}</span>
      )}
      {!hideText && extraCount > 0 && (
        <span className="flex-shrink-0 rounded-sm bg-accent-subtle px-1 text-caption-sm-medium leading-4 text-accent-primary">
          +{extraCount}
        </span>
      )}
      {dropdownArrow && (
        <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
      )}
    </>
  );
}
