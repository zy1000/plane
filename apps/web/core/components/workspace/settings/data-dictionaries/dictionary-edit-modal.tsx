import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDataDictionary, TUpdateDataDictionaryPayload } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { getDataDictionaryFieldErrorI18nKey } from "./helpers";

type Props = {
  isOpen: boolean;
  dictionary: TDataDictionary;
  onClose: () => void;
  onSubmit: (payload: TUpdateDataDictionaryPayload) => Promise<TDataDictionary>;
};

const I18N = "workspace_settings.settings.data_dictionaries";

/** 铅笔弹层：只改名称与描述。key 创建后不可改，也不在这里展示 */
export function DictionaryEditModal(props: Props) {
  const { isOpen, dictionary, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const [name, setName] = useState(dictionary.name);
  const [description, setDescription] = useState(dictionary.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(dictionary.name);
    setDescription(dictionary.description ?? "");
    setNameError(null);
    setIsSubmitting(false);
    setTimeout(() => nameRef.current?.select(), 80);
  }, [isOpen, dictionary.name, dictionary.description]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setNameError(t(`${I18N}.errors.name_required`));
      return;
    }
    const normalizedDescription = description.trim() || null;
    if (normalizedName === dictionary.name && normalizedDescription === (dictionary.description || null)) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    setNameError(null);
    try {
      await onSubmit({ name: normalizedName, description: normalizedDescription });
      onClose();
    } catch (requestError) {
      const i18nKey = getDataDictionaryFieldErrorI18nKey(requestError);
      if (i18nKey) setNameError(t(i18nKey));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-14 font-medium text-primary">{t(`${I18N}.edit_modal.title`)}</h2>
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

      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-1">
          <label className="text-12 font-medium text-secondary" htmlFor="data-dictionary-edit-name">
            {t(`${I18N}.detail.name_label`)}
            <span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <Input
            ref={nameRef}
            id="data-dictionary-edit-name"
            value={name}
            maxLength={255}
            hasError={Boolean(nameError)}
            placeholder={t(`${I18N}.detail.name_placeholder`)}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(null);
            }}
            className="w-full"
          />
          {nameError && <p className="text-10 leading-4 text-danger-primary">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-12 font-medium text-secondary" htmlFor="data-dictionary-edit-description">
            {t(`${I18N}.detail.description_label`)}
          </label>
          <TextArea
            id="data-dictionary-edit-description"
            value={description}
            maxLength={500}
            rows={3}
            placeholder={t(`${I18N}.detail.description_placeholder`)}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full resize-none"
          />
        </div>

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {t(`${I18N}.edit_modal.submit`)}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
