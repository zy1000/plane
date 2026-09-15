import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

/**
 * 有未保存的改动时浮在内容区底部正中的一枚药丸：几处改动 + 放弃 / 保存。
 * 格子上的蓝色角标与这里的数字数的是同一批（和服务端那份相比真正有差异的格子）。
 * 父容器要 `relative`，滚动区底部要留出药丸的高度。
 */
export const SaveBar = ({
  count,
  isMutating,
  onDiscard,
  onSave,
}: {
  count: number;
  isMutating: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) => {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-[5] flex justify-center px-6">
      <div className="pointer-events-auto flex h-11 items-center gap-3 rounded-xl border border-subtle bg-surface-1 py-1.5 pr-1.5 pl-4 text-13 text-primary shadow-[0_12px_32px_-12px_rgb(0_0_0/0.3)]">
        <span className="size-2 rounded-full bg-accent-primary" />
        <span className="whitespace-nowrap tabular-nums">{t("review_tailoring.matrix.unsaved_count", { count })}</span>
        <Button variant="ghost" size="lg" disabled={isMutating} onClick={onDiscard}>
          {t("review_tailoring.matrix.discard")}
        </Button>
        <Button variant="primary" size="lg" loading={isMutating} disabled={isMutating} onClick={onSave}>
          {t("review_tailoring.matrix.save")}
        </Button>
      </div>
    </div>
  );
};
