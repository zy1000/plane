import { SearchX, ShieldAlert } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { RISK_I18N } from "./constants";

/** 一条风险都没有时的空态。有数据但被搜索 / 筛选筛空时走下面的 `RiskNoMatch` */
export const RiskEmptyState = ({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent-subtle text-accent-primary">
        <ShieldAlert className="size-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-16 font-semibold text-primary">{t(`${RISK_I18N}.empty.title`)}</h3>
      <p className="mt-2 max-w-[42ch] text-13 leading-relaxed text-tertiary">{t(`${RISK_I18N}.empty.description`)}</p>
      {canCreate && (
        <Button variant="primary" size="xl" className="mt-5" onClick={onCreate}>
          {t(`${RISK_I18N}.header.create`)}
        </Button>
      )}
    </div>
  );
};

/** 搜索 / 筛选后没有匹配：一句话 + 清除按钮 */
export const RiskNoMatch = ({ onClear }: { onClear: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <SearchX className="size-8 text-tertiary" aria-hidden="true" />
      <p className="mt-2 text-14 font-medium text-primary">{t(`${RISK_I18N}.empty.no_match`)}</p>
      <p className="mt-1 max-w-80 text-12 leading-relaxed text-tertiary">{t(`${RISK_I18N}.empty.no_match_description`)}</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onClear}>
        {t(`${RISK_I18N}.summary.clear_filters`)}
      </Button>
    </div>
  );
};
