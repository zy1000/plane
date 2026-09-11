import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

const STEPS = [
  { title: "pick_reviews", hint: "pick_reviews_hint" },
  { title: "add_products", hint: "add_products_hint" },
  { title: "select", hint: "select_hint" },
] as const;

/**
 * 建表之后要做的三步：挑评审（纵轴）→ 添加产品（横轴）→ 勾选并签批。
 * 新建弹窗与列表空态共用；弹窗里第一步点亮，表示「建好就从这里开始」。
 */
export const TailoringNextSteps = ({
  highlightFirst = false,
  className,
}: {
  highlightFirst?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <div className={cn("grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2", className)}>
      {STEPS.map((step, index) => (
        <Fragment key={step.title}>
          {index > 0 && <ArrowRight className="size-3.5 text-placeholder" />}
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "grid size-5.5 shrink-0 place-items-center rounded-full border text-11 font-semibold tabular-nums",
                highlightFirst && index === 0
                  ? "border-accent-strong bg-accent-primary text-on-color"
                  : "border-subtle bg-surface-1 text-tertiary"
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-13 text-secondary">{t(`review_tailoring.steps.${step.title}`)}</span>
              <span className="block truncate text-11 text-placeholder">{t(`review_tailoring.steps.${step.hint}`)}</span>
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
};
