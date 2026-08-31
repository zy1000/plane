import { cn } from "@plane/utils";

type TProps = {
  index: number;
  label: string;
  draggable?: boolean;
};

/**
 * 子表单行首。始终居中显示序号；可拖时整格是把手，光标用 grab / grabbing 提示。
 *
 * 起拖范围是整个编号格（useSubformRowDnd 只把这一格注册成可拖元素），不靠这里的盒子撑，
 * 所以 absolute inset-0 纯粹是为了让序号在格子里居中，量不出高度也不影响能不能拖。
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
        "absolute inset-0 grid cursor-grab place-items-center select-none",
        "text-body-xs-regular text-tertiary tabular-nums active:cursor-grabbing"
      )}
    >
      {index}
    </span>
  );
}
