import { useEffect, useState } from "react";
import { CustomPicker } from "react-color";
import type { ColorResult, InjectedColorProps } from "react-color";
import { Hue, Saturation } from "react-color/lib/components/common";
import { useTranslation } from "@plane/i18n";
import { Input } from "@plane/ui";
import { normalizeHexColor, validateHexColor } from "@plane/utils";

const I18N = "workspace_settings.settings.data_dictionaries.detail";

type Props = {
  /** 当前 hex（#rrggbb） */
  value: string;
  onChange: (hex: string) => void;
};

// react-color 把 pointer 放在一个只定了 left / top 的绝对定位容器里，自己居中
function SaturationPointer() {
  return (
    <span className="block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.3)]" />
  );
}

function HuePointer() {
  return (
    <span className="block size-3.5 -translate-x-1/2 -translate-y-px rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.3)]" />
  );
}

/** 饱和度面板 + 色相条 + HEX 输入；颜色状态由外层 CustomPicker（ColorWrap）托管 */
function CustomColorPickerBody(props: InjectedColorProps) {
  const { hex, onChange } = props;
  const { t } = useTranslation();
  const currentHex = (hex ?? "#000000").toLowerCase();
  const [draft, setDraft] = useState(currentHex.slice(1));

  useEffect(() => {
    setDraft(currentHex.slice(1));
  }, [currentHex]);

  const commitDraft = () => {
    if (!validateHexColor(draft)) {
      setDraft(currentHex.slice(1));
      return;
    }
    const normalized = `#${normalizeHexColor(draft).toLowerCase()}`;
    if (normalized === currentHex) setDraft(currentHex.slice(1));
    else onChange?.(normalized);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative h-[108px] overflow-hidden rounded-md">
        <Saturation {...props} pointer={SaturationPointer} onChange={(color) => onChange?.(color)} />
      </div>
      <div className="relative h-3 overflow-hidden rounded-full">
        <Hue {...props} pointer={HuePointer} onChange={(color) => onChange?.(color)} />
      </div>
      <div className="flex items-center gap-2">
        <span className="size-4 shrink-0 rounded shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]" style={{ backgroundColor: currentHex }} />
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 font-mono text-12 text-placeholder">
            #
          </span>
          <Input
            value={draft}
            maxLength={6}
            placeholder={t(`${I18N}.hex_placeholder`)}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9a-fA-F]/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="h-8 w-full pl-5 font-mono text-12 uppercase"
          />
        </div>
      </div>
    </div>
  );
}

const CustomColorPickerRoot = CustomPicker(CustomColorPickerBody);

/** 自定义颜色：拖动即预览，停手（onChangeComplete，react-color 已去抖）才回调持久化 */
export function DictionaryCustomColorPicker(props: Props) {
  const { value, onChange } = props;
  return (
    <CustomColorPickerRoot
      color={value}
      onChangeComplete={(result: ColorResult) => onChange(result.hex.toLowerCase())}
    />
  );
}
