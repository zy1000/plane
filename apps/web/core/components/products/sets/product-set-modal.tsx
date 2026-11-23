import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { FORM_VARIANT_STYLES, FormFieldShell } from "@/components/common/form-section";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { TProductSetRequestError } from "@/hooks/store/use-product-sets";
import { useUser } from "@/hooks/store/user";
import { useProductsContext } from "../context";

const I18N = "workspace_product_sets";
const styles = FORM_VARIANT_STYLES.modal;

type TFieldErrors = { name?: string; identifier?: string };

/** 序列化器把错误码放在字段名下（{ name: ["PRODUCT_NAME_ALREADY_EXISTS"] }），取第一条 */
const fieldErrorCode = (error: TProductSetRequestError | undefined, field: string) => {
  const value = error?.[field];
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
};

/**
 * 产品集的创建 / 编辑弹窗：名称、编号、负责人。
 * 打开状态放在 ProductsContext（列表页表头按钮、行内「编辑」、详情页签行的设置入口共用一个）。
 */
export function ProductSetModal({ onCreated }: { onCreated?: (productSetId: string) => void } = {}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { sets, productSetModal, closeProductSetModal, fetchProduct } = useProductsContext();
  const { isOpen, productSet } = productSetModal;
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [errors, setErrors] = useState<TFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(productSet?.name ?? "");
    setIdentifier(productSet?.identifier ?? "");
    setOwnerId(productSet?.owner ?? currentUser?.id ?? null);
    setErrors({});
  }, [currentUser?.id, isOpen, productSet]);

  const errorText = (code: string | undefined) => {
    if (!code) return undefined;
    const key = `${I18N}.errors.${code.toLowerCase()}`;
    const text = t(key);
    return text === key ? t(`${I18N}.toast.failed`) : text;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { name: name.trim(), identifier: identifier.trim().toUpperCase(), owner: ownerId ?? undefined };
    const nextErrors: TFieldErrors = {
      name: payload.name ? undefined : t(`${I18N}.form.name_required`),
      identifier: payload.identifier ? undefined : t(`${I18N}.form.identifier_required`),
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.identifier) return;

    setIsSubmitting(true);
    try {
      if (productSet) {
        await sets.updateProductSet(productSet.id, payload);
        // 详情页签行、概览页头读的是产品对象，改名后把那一条换掉
        void fetchProduct(productSet.id).catch(() => undefined);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.toast.updated`) });
      } else {
        const created = await sets.createProductSet(payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: t(`${I18N}.toast.created`) });
        onCreated?.(created.id);
      }
      closeProductSetModal();
    } catch (requestError) {
      const error = requestError as TProductSetRequestError | undefined;
      const fieldErrors: TFieldErrors = {
        name: errorText(fieldErrorCode(error, "name")),
        identifier: errorText(fieldErrorCode(error, "identifier")),
      };
      setErrors(fieldErrors);
      if (!fieldErrors.name && !fieldErrors.identifier) {
        setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t(`${I18N}.toast.failed`) });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => !isSubmitting && closeProductSetModal()}
      position={EModalPosition.TOP}
      width={EModalWidth.XL}
      initialFocus={nameRef}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex h-14 items-center justify-between border-b border-subtle px-6">
          <h2 className="text-16 font-semibold text-primary">{t(productSet ? `${I18N}.edit` : `${I18N}.create`)}</h2>
          <button
            type="button"
            onClick={closeProductSetModal}
            className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          <FormFieldShell label={t(`${I18N}.fields.name`)} required editable styles={styles} error={errors.name}>
            <Input
              ref={nameRef}
              value={name}
              maxLength={255}
              autoComplete="off"
              placeholder={t(`${I18N}.form.name_placeholder`)}
              onChange={(event) => setName(event.target.value)}
              hasError={Boolean(errors.name)}
              className={styles.input}
            />
          </FormFieldShell>
          <FormFieldShell
            label={t(`${I18N}.fields.identifier`)}
            required
            editable
            styles={styles}
            error={errors.identifier}
            hint={errors.identifier ? undefined : t(`${I18N}.form.identifier_hint`)}
          >
            <Input
              value={identifier}
              maxLength={12}
              autoComplete="off"
              placeholder={t(`${I18N}.form.identifier_placeholder`)}
              onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              hasError={Boolean(errors.identifier)}
              className={styles.input}
            />
          </FormFieldShell>
          <FormFieldShell label={t(`${I18N}.fields.owner`)} required={false} editable styles={styles}>
            <div className={styles.control}>
              <MemberDropdown
                multiple={false}
                value={ownerId}
                onChange={(next) => setOwnerId(next ?? null)}
                buttonVariant="border-with-text"
                className="h-full w-full"
                buttonContainerClassName="h-full w-full"
                buttonClassName={styles.dropdownButton}
                placeholder={t(`${I18N}.form.owner_placeholder`)}
                showUserDetails
                optionsClassName="z-[50]"
              />
            </div>
          </FormFieldShell>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-subtle px-6 py-4">
          <Button variant="secondary" size="lg" type="button" onClick={closeProductSetModal} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {t(productSet ? "save" : `${I18N}.actions.create`)}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
