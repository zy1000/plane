import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

/**
 * 有未保存的改动时页面底部的一行：几处改动 + 放弃 / 保存。
 * 格子上的小蓝点与这里的数字数的是同一批（和服务端那份相比真正有差异的格子）。
 */
export const SaveFooter = ({
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
    <div className="flex h-13 shrink-0 items-center justify-end gap-2 border-t border-subtle bg-surface-1 px-5">
      <span className="mr-1 text-13 whitespace-nowrap text-secondary tabular-nums">
        {t("review_tailoring.matrix.unsaved_count", { count })}
      </span>
      <Button variant="secondary" size="lg" disabled={isMutating} onClick={onDiscard}>
        {t("review_tailoring.matrix.discard")}
      </Button>
      <Button variant="primary" size="lg" loading={isMutating} disabled={isMutating} onClick={onSave}>
        {t("save")}
      </Button>
    </div>
  );
};
