import { cn } from "@plane/utils";

/** 红色数字角标：待我签批的张数，0 不显示 */
export const TailoringCountBadge = ({ count, className }: { count: number; className?: string }) => {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-grid h-4 min-w-4 place-items-center rounded-full bg-danger-primary px-1 text-11 leading-none font-semibold text-on-color tabular-nums",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
};
