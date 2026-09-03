import { useTranslation } from "@plane/i18n";
import type { TDataDictionary } from "@plane/types";

const I18N = "workspace_settings.settings.data_dictionaries";

/** 系统 / 自定义徽标。key 不在页面上展示，系统徽标用 title 带出来（撞名时系统字典名带「（key）」后缀，靠它辨认） */
export function DictionaryTypeBadge({ dictionary }: { dictionary: Pick<TDataDictionary, "is_system" | "key"> }) {
  const { t } = useTranslation();
  return dictionary.is_system ? (
    <span
      title={dictionary.key}
      className="inline-flex shrink-0 items-center rounded-full bg-accent-primary/10 px-2 py-0.5 text-10 font-medium text-accent-primary"
    >
      {t(`${I18N}.list.system_badge`)}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-layer-1 px-2 py-0.5 text-10 font-medium text-tertiary">
      {t(`${I18N}.list.custom_badge`)}
    </span>
  );
}
