import type { TDataDictionary } from "@plane/types";
import { DictionaryItemSelect } from "@/components/dropdowns/dictionary-item-select";

type Props = {
  dictionary?: TDataDictionary;
  /** 表单里的项目代号（字典值的 label） */
  value: string;
  onChange: (label: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
  isLoading?: boolean;
  buttonClassName?: string;
  triggerClassName?: string;
};

/**
 * 项目代号下拉：与 Project.code 同一本 project_code 字典，但产品这边 code 是字符串列，存的是 label 而不是 id。
 * 下拉按 item id 选，表单值是 label，这里来回换算；字典未加载或存量代号不在字典里时，用 fallbackItem 把当前值原样显示出来。
 */
export function ProductCodeSelect(props: Props) {
  const { dictionary, value, onChange, ...rest } = props;
  const code = value.trim();
  const codeItem = code ? dictionary?.items.find((item) => item.label === code) : undefined;

  return (
    <DictionaryItemSelect
      dictionary={dictionary}
      value={codeItem?.id ?? (code || null)}
      onChange={(itemId) => onChange(dictionary?.items.find((item) => item.id === itemId)?.label ?? "")}
      fallbackItem={
        code && !codeItem
          ? { id: code, label: code, dictionary: dictionary?.id ?? "", color: "", is_colored: false }
          : undefined
      }
      {...rest}
    />
  );
}
