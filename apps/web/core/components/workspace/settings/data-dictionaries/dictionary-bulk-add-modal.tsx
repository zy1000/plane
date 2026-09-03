import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TBulkCreateDataDictionaryItemsResponse, TDataDictionary } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";

type Props = {
  isOpen: boolean;
  dictionary: TDataDictionary;
  onClose: () => void;
  onSubmit: (labels: string[]) => Promise<TBulkCreateDataDictionaryItemsResponse>;
};

const I18N = "workspace_settings.settings.data_dictionaries";
/** 与后端 BULK_LABELS_MAX 一致 */
const MAX_LABELS = 1000;
const PREVIEW_LIMIT = 20;

/** 多行文本 → 去空 / trim / 输入内去重，保持出现顺序 */
const parseLabels = (text: string) => {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const label = line.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
};

export function DictionaryBulkAddModal(props: Props) {
  const { isOpen, dictionary, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setText("");
    setIsSubmitting(false);
  }, [isOpen]);

  const existing = useMemo(() => new Set(dictionary.items.map((item) => item.label)), [dictionary.items]);
  const { newLabels, existingLabels } = useMemo(() => {
    const parsed = parseLabels(text);
    return {
      newLabels: parsed.filter((label) => !existing.has(label)),
      existingLabels: parsed.filter((label) => existing.has(label)),
    };
  }, [text, existing]);
  const overLimit = newLabels.length > MAX_LABELS;

  const handleSubmit = async () => {
    if (newLabels.length === 0 || overLimit) return;
    setIsSubmitting(true);
    try {
      await onSubmit(newLabels);
      onClose();
    } catch {
      // root 已 toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewExisting = existingLabels.slice(0, PREVIEW_LIMIT).join("、");
  const moreExisting = existingLabels.length - PREVIEW_LIMIT;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div>
          <h2 className="text-14 font-medium text-primary">{t(`${I18N}.bulk_modal.title`, { name: dictionary.name })}</h2>
          <p className="mt-0.5 text-11 text-tertiary">{t(`${I18N}.bulk_modal.description`)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover disabled:opacity-50"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        <TextArea
          value={text}
          rows={10}
          placeholder={t(`${I18N}.bulk_modal.placeholder`)}
          onChange={(event) => setText(event.target.value)}
          className="w-full resize-none font-mono text-13 leading-6"
          autoFocus
        />
        {(newLabels.length > 0 || existingLabels.length > 0) && (
          <div className="flex flex-col gap-1 rounded-md bg-layer-1 px-3 py-2 text-12">
            <span className="text-primary">{t(`${I18N}.bulk_modal.preview_new`, { count: newLabels.length })}</span>
            {existingLabels.length > 0 && (
              <span className="break-all text-warning-primary">
                {t(`${I18N}.bulk_modal.preview_existing`, { count: existingLabels.length, labels: previewExisting })}
                {moreExisting > 0 && t(`${I18N}.bulk_modal.preview_more`, { count: moreExisting })}
              </span>
            )}
            {overLimit && (
              <span className="text-danger-primary">{t(`${I18N}.bulk_modal.limit`, { max: MAX_LABELS })}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={() => void handleSubmit()}
          loading={isSubmitting}
          disabled={newLabels.length === 0 || overLimit}
        >
          {t(`${I18N}.bulk_modal.submit`, { count: newLabels.length })}
        </Button>
      </div>
    </ModalCore>
  );
}
