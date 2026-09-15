import { Check, Scissors, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";

/** 深色条上的次级按钮底色：跟着文字色走，亮暗主题下都是一层淡淡的当前色 */
const SUBTLE_ON_INVERSE = { backgroundColor: "color-mix(in srgb, currentColor 14%, transparent)" };

/**
 * 矩阵里勾选了格子之后浮在底部正中的操作条：已选几格 + 全部保留 / 全部裁剪 / 取消选择。
 * 与改动条占同一个位置，有选中时替代改动条；父容器要 `relative`。
 */
export const SelectionBar = ({
  count,
  onKeep,
  onCut,
  onClear,
}: {
  count: number;
  onKeep: () => void;
  onCut: () => void;
  onClear: () => void;
}) => {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-[6] flex justify-center px-6">
      <div className="pointer-events-auto flex h-11 items-center gap-1.5 rounded-xl bg-inverse py-1.5 pr-1.5 pl-4 text-13 text-inverse shadow-[0_16px_40px_-12px_rgb(0_0_0/0.45)] backdrop-blur-sm">
        <span className="whitespace-nowrap tabular-nums">
          {t("review_tailoring.matrix.selected_count", { count })}
        </span>
        <span className="mx-1.5 h-5 w-px bg-current opacity-25" aria-hidden />
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg bg-accent-primary px-3 font-medium whitespace-nowrap text-on-color hover:opacity-90"
          onClick={onKeep}
        >
          <Check className="size-3.5" strokeWidth={2.6} />
          {t("review_tailoring.matrix.keep_all")}
        </button>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg px-3 font-medium whitespace-nowrap hover:opacity-80"
          style={SUBTLE_ON_INVERSE}
          onClick={onCut}
        >
          <Scissors className="size-3.5" strokeWidth={2.2} />
          {t("review_tailoring.matrix.cut_all")}
        </button>
        <button
          type="button"
          aria-label={t("review_tailoring.matrix.clear_selection")}
          title={t("review_tailoring.matrix.clear_selection")}
          className="grid size-8 place-items-center rounded-lg opacity-70 hover:opacity-100"
          onClick={onClear}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
};
