import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

/** 「已延期 N 天」标签：计划结束已过且未完成时出现，纯派生显示，不存延期状态 */
export const ProjectStageDelayedTag = ({ days, className }: { days: number; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full border border-danger-subtle bg-danger-subtle px-1.5 text-11 font-medium text-danger-primary",
        className
      )}
    >
      {t("project_stage.delayed", { days })}
    </span>
  );
};
