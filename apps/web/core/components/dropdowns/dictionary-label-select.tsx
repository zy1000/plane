import type { TDataDictionary } from "@plane/types";
import { DictionaryItemSelect } from "./dictionary-item-select";

type Props = Omit<React.ComponentProps<typeof DictionaryItemSelect>, "value" | "onChange" | "fallbackItem"> & {
  /** 表单里的值：字典值的 label，不是 id */
  value: string;
  onChange: (label: string) => void;
};

/**
 * 按 label 存值的字典下拉：产品 / 项目的「项目代号」都是字符串列，取值来自 project_code 字典，存 label 不存 id。
 * 下拉按 item id 选，表单值是 label，这里来回换算；字典未加载或存量代号不在字典里时，用 fallbackItem 把当前值原样显示出来。
 */
export function DictionaryLabelSelect(props: Props) {
  const { dictionary, value, onChange, ...rest } = props;
  const label = value.trim();
  const item = label ? dictionary?.items.find((candidate) => candidate.label === label) : undefined;

  return (
    <DictionaryItemSelect
      dictionary={dictionary}
      value={item?.id ?? (label || null)}
      onChange={(itemId) => onChange(dictionary?.items.find((candidate) => candidate.id === itemId)?.label ?? "")}
      fallbackItem={
        label && !item
          ? { id: label, label, dictionary: dictionary?.id ?? "", color: "", is_colored: false }
          : undefined
      }
      {...rest}
    />
  );
}
