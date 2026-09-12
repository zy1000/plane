import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

/**
 * 有未保存的改动时贴在页面底部的一条：几处改动 + 放弃 / 保存。
 * 格子上的蓝色角标与这里的数字数的是同一批（和服务端那份相比真正有差异的格子）。
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
    <div className="flex shrink-0 items-center gap-3 border-t border-subtle bg-surface-1 px-6 py-2.5 text-13 text-primary">
      <span className="size-2 rounded-full bg-accent-primary" />
      <span className="tabular-nums">{t("review_tailoring.matrix.unsaved_count", { count })}</span>
      <span className="flex-1" />
      <Button variant="secondary" size="xl" disabled={isMutating} onClick={onDiscard}>
        {t("review_tailoring.matrix.discard")}
      </Button>
      <Button variant="primary" size="xl" loading={isMutating} disabled={isMutating} onClick={onSave}>
        {t("review_tailoring.matrix.save")}
      </Button>
    </div>
  );
};
