import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DATA_DICTIONARY_COLOR_KEYS, DEFAULT_DATA_DICTIONARY_COLOR } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";
import {
  DictionaryColorDot,
  DictionaryValueTag,
  getDictionaryColorProps,
  isCustomDictionaryColor,
} from "@/components/data-dictionaries";
import { DictionaryCustomColorPicker } from "./dictionary-custom-color-picker";

const I18N = "workspace_settings.settings.data_dictionaries";
/** 从预设切到自定义时取色器的起点（预设色是 oklch 变量，没有 hex 可用） */
const DEFAULT_CUSTOM_HEX = "#8b8f98";

type Props = {
  /** 预设色 key 或 #rrggbb；空串按灰显示 */
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** 有值时在面板底部显示该值的标签预览 */
  previewLabel?: string;
};

/** 字典值的色点入口 + 色板弹层：5×2 预设，下面可展开自定义取色 */
export function DictionaryColorPicker(props: Props) {
  const { value, onChange, disabled = false, previewLabel } = props;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const isCustom = isCustomDictionaryColor(value);
  const [isCustomOpen, setIsCustomOpen] = useState(isCustom);
  const current = value || DEFAULT_DATA_DICTIONARY_COLOR;
  const currentName = isCustom ? value.toUpperCase() : t(`${I18N}.colors.${current}`);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        // 每次打开时按当前值决定自定义段是否展开
        if (open) setIsCustomOpen(isCustomDictionaryColor(value));
      }}
    >
      <Popover.Button
        type="button"
        disabled={disabled}
        aria-label={t(`${I18N}.detail.pick_color`)}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded transition-colors",
          !disabled && "hover:bg-layer-1",
          isOpen && "bg-layer-1"
        )}
      >
        <DictionaryColorDot color={current} />
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        className="z-50 w-[252px] rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200"
      >
        <div className="mb-2.5 flex items-center justify-between text-11 font-medium text-tertiary">
          <span>{t(`${I18N}.detail.color_title`)}</span>
          <span className="font-mono text-secondary">{currentName}</span>
        </div>
        <div className="grid grid-cols-5 gap-x-1.5 gap-y-2">
          {DATA_DICTIONARY_COLOR_KEYS.map((key) => {
            const selected = !isCustom && current === key;
            const { className: colorClassName } = getDictionaryColorProps(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setIsOpen(false);
                }}
                className="flex flex-col items-center gap-1 rounded py-0.5 hover:bg-layer-1"
              >
                <span
                  className={cn(
                    "dict-dot grid size-6 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]",
                    colorClassName,
                    selected && "ring-2 ring-[var(--dict-dot)] ring-offset-2 ring-offset-surface-1"
                  )}
                >
                  {selected && <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className={cn("text-10", selected ? "font-medium text-primary" : "text-tertiary")}>
                  {t(`${I18N}.colors.${key}`)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 border-t border-subtle pt-2.5">
          <button
            type="button"
            onClick={() => setIsCustomOpen((open) => !open)}
            className="flex h-6 w-full items-center gap-2 rounded text-12 font-medium text-secondary hover:text-primary"
          >
            <span className="conical-gradient size-4 shrink-0 rounded-full" aria-hidden="true" />
            {t(`${I18N}.detail.custom_color`)}
            <ChevronDown
              className={cn("ml-auto size-3.5 text-tertiary transition-transform", isCustomOpen && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {isCustomOpen && (
            <div className="mt-2.5">
              <DictionaryCustomColorPicker value={isCustom ? value : DEFAULT_CUSTOM_HEX} onChange={onChange} />
            </div>
          )}
        </div>

        {previewLabel && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-subtle pt-2.5 text-11 text-tertiary">
            <span>{t(`${I18N}.detail.color_preview`)}</span>
            <DictionaryValueTag label={previewLabel} color={current} />
          </div>
        )}
      </Popover.Panel>
    </Popover>
  );
}
