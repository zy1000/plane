import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

/** 一张裁剪表都没有时的空态。有表但被搜索 / 过滤筛空时不走这里 */
export const TailoringEmptyState = ({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      <h3 className="text-16 font-semibold text-primary">{t("review_tailoring.empty.title")}</h3>
      <p className="mt-2 max-w-[42ch] text-13 leading-relaxed text-tertiary">
        {t("review_tailoring.empty.description")}
      </p>
      {canCreate && (
        <Button variant="primary" size="xl" className="mt-5" onClick={onCreate}>
          {t("review_tailoring.create")}
        </Button>
      )}
    </div>
  );
};
