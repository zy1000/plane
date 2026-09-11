import { Check, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { TailoringNextSteps } from "./next-steps";

/**
 * 一张 4×4 的小矩阵：左上角是空角，第一行是产品表头、第一列是评审表头，其余是格子。
 * 比一把剪刀更能说明「裁剪表是什么」。h = 表头，on = 勾上，off = 没勾。
 */
const MATRIX: ("corner" | "h" | "on" | "off")[] = [
  "corner", "h", "h", "h",
  "h", "on", "on", "off",
  "h", "on", "off", "on",
  "h", "off", "on", "on",
];

/** 一张裁剪表都没有时的空态。有表但被搜索 / 过滤筛空时不走这里 */
export const TailoringEmptyState = ({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center px-6 pt-16 pb-18 text-center">
      <div className="mb-5 grid grid-cols-4 gap-1.5" aria-hidden>
        {MATRIX.map((cell, index) => (
          <span
            key={index}
            className={cn(
              "grid size-6.5 place-items-center rounded-md",
              cell === "corner" && "border border-dashed border-strong",
              cell === "h" && "bg-layer-3",
              cell === "on" && "bg-accent-subtle text-accent-primary",
              cell === "off" && "border border-subtle"
            )}
          >
            {cell === "on" && <Check className="size-3" strokeWidth={3.5} />}
          </span>
        ))}
      </div>
      <h3 className="text-16 font-semibold text-primary">{t("review_tailoring.empty.title")}</h3>
      <p className="mt-2 max-w-[42ch] text-13 leading-relaxed text-tertiary">
        {t("review_tailoring.empty.description")}
      </p>
      {canCreate && (
        <Button variant="primary" size="xl" className="mt-5" onClick={onCreate}>
          <Plus className="size-3.5" />
          {t("review_tailoring.create")}
        </Button>
      )}
      <TailoringNextSteps className="mt-9 w-full max-w-[620px] border-t border-subtle pt-6 text-left" />
    </div>
  );
};
