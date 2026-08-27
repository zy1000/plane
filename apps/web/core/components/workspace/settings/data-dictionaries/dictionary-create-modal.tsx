import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateDataDictionaryPayload, TDataDictionary } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import {
  DATA_DICTIONARY_KEY_PATTERN,
  extractDataDictionaryErrorCode,
  getDataDictionaryFieldErrorI18nKey,
} from "./helpers";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: TCreateDataDictionaryPayload) => Promise<TDataDictionary>;
};

const I18N = "workspace_settings.settings.data_dictionaries";

export function DictionaryCreateModal(props: Props) {
  const { isOpen, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setKey("");
    setName("");
    setDescription("");
    setKeyError(null);
    setNameError(null);
    setIsSubmitting(false);
    setTimeout(() => keyRef.current?.focus(), 80);
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    let hasError = false;
    if (!key) {
      setKeyError(t(`${I18N}.errors.key_required`));
      hasError = true;
    } else if (!DATA_DICTIONARY_KEY_PATTERN.test(key)) {
      setKeyError(t(`${I18N}.errors.key_invalid`));
      hasError = true;
    }
    if (!normalizedName) {
      setNameError(t(`${I18N}.errors.name_required`));
      hasError = true;
    }
    if (hasError) return;

    setIsSubmitting(true);
    setKeyError(null);
    setNameError(null);
    try {
      await onSubmit({ key, name: normalizedName, description: description.trim() || null });
      onClose();
    } catch (requestError) {
      const i18nKey = getDataDictionaryFieldErrorI18nKey(requestError);
      if (!i18nKey) return;
      if (extractDataDictionaryErrorCode(requestError) === "DATA_DICTIONARY_NAME_ALREADY_EXISTS") {
        setNameError(t(i18nKey));
      } else {
        setKeyError(t(i18nKey));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-14 font-medium text-primary">{t(`${I18N}.create_modal.title`)}</h2>
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
          <label className="text-12 font-medium text-secondary" htmlFor="data-dictionary-create-key">
            {t(`${I18N}.create_modal.key_label`)}
            <span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <Input
            ref={keyRef}
            id="data-dictionary-create-key"
            value={key}
            maxLength={64}
            hasError={Boolean(keyError)}
            placeholder={t(`${I18N}.create_modal.key_placeholder`)}
            onChange={(event) => {
              // 与后端 key 规则同步：只保留小写字母、数字、下划线，输入时就挡住非法字符
              setKey(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
              if (keyError) setKeyError(null);
            }}
            className="w-full font-mono"
          />
          <p className="text-10 leading-4 text-tertiary">{t(`${I18N}.create_modal.key_hint`)}</p>
          {keyError && <p className="text-10 leading-4 text-danger-primary">{keyError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-12 font-medium text-secondary" htmlFor="data-dictionary-create-name">
            {t(`${I18N}.create_modal.name_label`)}
            <span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <Input
            id="data-dictionary-create-name"
            value={name}
            maxLength={255}
            hasError={Boolean(nameError)}
            placeholder={t(`${I18N}.create_modal.name_placeholder`)}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(null);
            }}
            className="w-full"
          />
          {nameError && <p className="text-10 leading-4 text-danger-primary">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-12 font-medium text-secondary" htmlFor="data-dictionary-create-description">
            {t(`${I18N}.create_modal.description_label`)}
          </label>
          <TextArea
            id="data-dictionary-create-description"
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
            {t(`${I18N}.create_modal.submit`)}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
