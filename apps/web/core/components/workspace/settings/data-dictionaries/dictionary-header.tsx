import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TDataDictionary } from "@plane/types";
import { CustomMenu, ToggleSwitch } from "@plane/ui";
import { DictionaryTypeBadge } from "./dictionary-type-badge";

type Props = {
  dictionary: TDataDictionary;
  canEdit: boolean;
  /** 字典级「彩色显示」开关，切换即保存 */
  onToggleColored: (isColored: boolean) => Promise<unknown>;
  onEdit: () => void;
  onDelete: () => void;
};

const I18N = "workspace_settings.settings.data_dictionaries";
const ICON_BUTTON =
  "grid size-8 place-items-center rounded-md border border-subtle bg-surface-1 text-secondary transition-colors hover:bg-layer-1-hover hover:text-primary";

/** 右栏头部：只有名称 + 徽标；改名改描述收进铅笔弹层，key 与描述不展示 */
export function DictionaryHeader(props: Props) {
  const { dictionary, canEdit, onToggleColored, onEdit, onDelete } = props;
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <h2 className="truncate text-18 font-semibold text-primary">{dictionary.name}</h2>
        <DictionaryTypeBadge dictionary={dictionary} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="mr-1 flex items-center gap-2 text-12 text-secondary">
          {t(`${I18N}.detail.colored_toggle`)}
          <ToggleSwitch
            value={dictionary.is_colored}
            // 失败时 root 已 toast，开关跟着 store 里的值回弹
            onChange={(isColored) => void onToggleColored(isColored).catch(() => undefined)}
            disabled={!canEdit}
            size="sm"
          />
        </label>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className={ICON_BUTTON}
              aria-label={t(`${I18N}.header.edit`)}
              title={t(`${I18N}.header.edit`)}
            >
              <Pencil className="size-3.5" />
            </button>
            <CustomMenu
              customButton={
                <span className={ICON_BUTTON} title={t(`${I18N}.header.more`)}>
                  <MoreHorizontal className="size-4" />
                </span>
              }
              placement="bottom-end"
            >
              <CustomMenu.MenuItem disabled={dictionary.is_system} onClick={onDelete}>
                <Tooltip
                  disabled={!dictionary.is_system}
                  tooltipContent={t(`${I18N}.detail.system_locked`)}
                  position="left"
                >
                  <span className="flex items-center gap-2 text-danger-primary">
                    <Trash2 className="size-3.5" />
                    {t(`${I18N}.detail.delete`)}
                  </span>
                </Tooltip>
              </CustomMenu.MenuItem>
            </CustomMenu>
          </>
        )}
      </div>
    </header>
  );
}
