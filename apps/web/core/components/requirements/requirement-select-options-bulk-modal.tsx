import { useEffect, useState } from "react";
import { ListChecks, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementSelectOption } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import {
  findDuplicateRequirementSelectLabel,
  mergeRequirementSelectOptions,
  parseRequirementSelectOptionLabels,
} from "@/components/requirements/requirement-select";

/** 与逐条输入框的 maxLength 以及后端 RequirementFieldWriteSerializer 的限制一致 */
const MAX_OPTION_LABEL_LENGTH = 255;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** 打开时作为回显内容的当前选项列表 */
  options: TRequirementSelectOption[];
  /** 点「确定」才回写；直接给出替换后的完整列表 */
  onApply: (options: TRequirementSelectOption[]) => void;
};

/**
 * 选择器选项的批量编辑：一行一个选项名。
 *
 * 语义是整体替换而不是追加 —— 文本框里回显了当前全部选项，所见即所得：新增行是新选项，
 * 删掉行就删掉该选项，调整行序就是重排。名字没改的行会沿用原有 option id
 * （见 mergeRequirementSelectOptions），所以改顺序、插新值都不会让已录入的数据失效。
 */
export function RequirementSelectOptionsBulkModal(props: Props) {
  const { isOpen, onClose, options, onApply } = props;
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const parsedLabels = parseRequirementSelectOptionLabels(text);

  useEffect(() => {
    if (!isOpen) return;
    setText(options.map((option) => option.label).join("\n"));
    setError(null);
    // options 只在开启时取一次快照，故意不进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleApply = () => {
    if (!parsedLabels.length) {
      setError(t("requirement_fields.validation.bulk_options_empty"));
      return;
    }
    const tooLong = parsedLabels.find((label) => label.length > MAX_OPTION_LABEL_LENGTH);
    if (tooLong) {
      setError(t("requirement_fields.validation.bulk_options_too_long", { label: tooLong }));
      return;
    }
    const duplicate = findDuplicateRequirementSelectLabel(parsedLabels);
    if (duplicate) {
      setError(t("requirement_fields.validation.bulk_options_duplicate", { label: duplicate }));
      return;
    }
    onApply(mergeRequirementSelectOptions(options, parsedLabels));
    onClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span className="grid size-8 place-items-center rounded-md bg-layer-2 text-secondary">
            <ListChecks className="size-4" />
          </span>
          <h2 className="text-14 font-medium text-primary">{t("requirement_fields.builder.bulk_edit_title")}</h2>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-5 py-5">
        <p className="mb-2 text-11 leading-4 text-tertiary">
          {t("requirement_fields.builder.bulk_edit_description")}
        </p>
        <textarea
          value={text}
          rows={12}
          autoFocus
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 leading-5 text-primary outline-none placeholder:text-placeholder"
          placeholder={t("requirement_fields.builder.bulk_edit_placeholder")}
          aria-label={t("requirement_fields.builder.bulk_edit_title")}
        />
        <div className="mt-1.5 flex items-start justify-between gap-3">
          {error ? <p className="text-11 leading-4 text-danger-primary">{error}</p> : <span />}
          <span className="shrink-0 text-11 leading-4 tabular-nums text-tertiary">
            {t("requirement_fields.builder.bulk_edit_count", { count: parsedLabels.length })}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={handleApply}>
          {t("confirm")}
        </Button>
      </div>
    </ModalCore>
  );
}
