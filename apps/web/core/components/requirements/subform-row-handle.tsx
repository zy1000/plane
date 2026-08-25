import { GripVertical } from "lucide-react";
import { cn } from "@plane/utils";

type TProps = {
  index: number;
  label: string;
  draggable?: boolean;
};

/**
 * 子表单行首。静息居中显示序号；可拖时悬停换成握把，避免「歪在左边的 1」既不像序号也不像把手。
 *
 * 起拖范围是整个编号格（useSubformRowDnd 只把这一格注册成可拖元素），不靠这里的盒子撑，
 * 所以 absolute inset-0 纯粹是为了让序号和握把在格子里居中，量不出高度也不影响能不能拖。
 */
export function SubformRowHandle({ index, label, draggable = true }: TProps) {
  if (!draggable) {
    return (
      <span className="absolute inset-0 grid place-items-center text-body-xs-regular text-tertiary tabular-nums">
        {index}
      </span>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "group/handle absolute inset-0 grid cursor-grab place-items-center select-none",
        "text-body-xs-regular text-tertiary tabular-nums active:cursor-grabbing"
      )}
    >
      <span className="relative grid min-h-4 min-w-4 place-items-center">
        <span className="group-hover/handle:invisible">{index}</span>
        <GripVertical className="pointer-events-none absolute size-3.5 text-placeholder opacity-0 group-hover/handle:opacity-100" />
      </span>
    </span>
  );
}
