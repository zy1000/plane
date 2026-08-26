import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import type { IUserLite, TProduct, TProductExtendedFieldKey } from "@plane/types";
import { Avatar, AvatarGroup, Input } from "@plane/ui";
import { cn, getDate, getFileURL, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { PRODUCT_DICTIONARY_FIELDS, PRODUCT_REQUIRED_EXTENDED_FIELDS } from "./constants";
import type { TProductDictionaryFieldKey } from "./constants";
import { DictionaryItemSelect } from "./dictionary-item-select";
import type { TProductExtendedFieldErrors, TProductExtendedFieldsState } from "./use-product-extended-fields";

type TVariant = "modal" | "settings";

type Props = {
  workspaceSlug: string;
  editable: boolean;
  variant: TVariant;
  values: TProductExtendedFieldsState;
  errors: TProductExtendedFieldErrors;
  onChange: <K extends TProductExtendedFieldKey>(key: K, value: TProductExtendedFieldsState[K]) => void;
  /** 查看态展示 *_detail；编辑态用来在字典列表未返回时兜住当前 label */
  product?: TProduct | null;
  /** 编辑存量产品时缺失的必填项，非空则在区块顶部提示补齐 */
  missingRequiredFields?: TProductExtendedFieldKey[];
  className?: string;
  /** 把产品负责人放进「团队」区，与项目/测试负责人同一套控件 */
  ownerField?: ReactNode;
};

const TEXT_FIELDS = ["code", "model_number", "external_model"] as const;
const CLASSIFICATION_FIELDS = ["stage", "category", "status"] as const;
const LEVEL_FIELDS = ["hardware_level", "structure_level", "software_level"] as const;
const DATE_FIELDS = ["start_date", "o_phase_close_date", "v_phase_close_date"] as const;
const LEAD_FIELDS = ["project_lead", "test_lead"] as const;

type TVariantStyles = {
  title: string;
  grid: string;
  label: string;
  control: string;
  input: string;
  dropdownButton: string;
  text: string;
  error: string;
  hint: string;
};

const VARIANT_STYLES: Record<TVariant, TVariantStyles> = {
  modal: {
    title: "text-13 font-semibold text-primary",
    grid: "md:grid-cols-2",
    label: "mb-1.5 block text-13 font-medium text-secondary",
    control: "h-10 w-full",
    input: "h-10 min-h-10 w-full !py-0 text-13 leading-5",
    dropdownButton: "h-full w-full text-13",
    text: "flex min-h-10 items-center text-13 text-primary",
    error: "mt-1 text-11 text-danger-primary",
    hint: "mt-1 text-12 text-tertiary",
  },
  settings: {
    title: "text-body-md-medium text-primary",
    grid: "md:grid-cols-2",
    label: "mb-1.5 block text-body-sm-medium text-primary",
    control: "h-10 w-full",
    input: "h-10 w-full border !border-subtle bg-surface-1 px-3 !py-0 text-body-sm-regular text-primary",
    dropdownButton: "h-full w-full border !border-subtle bg-surface-1 text-body-sm-regular",
    text: "flex min-h-10 items-center text-body-sm-regular text-primary",
    error: "mt-1.5 text-caption-md-regular text-danger-primary",
    hint: "mt-1.5 text-caption-md-regular text-tertiary",
  },
};

type FieldWrapperProps = {
  label: string;
  required: boolean;
  editable: boolean;
  optionalText: string;
  showOptional: boolean;
  error?: string;
  hint?: ReactNode;
  styles: TVariantStyles;
  children: ReactNode;
};

function FieldWrapper(props: FieldWrapperProps) {
  const { label, required, editable, optionalText, showOptional, error, hint, styles, children } = props;
  return (
    <div className="min-w-0">
      <span className={styles.label}>
        {label}
        {editable && required ? <span className="ml-0.5 text-danger-primary">*</span> : null}
        {editable && !required && showOptional ? (
          <span className="ml-1 font-normal text-tertiary">({optionalText})</span>
        ) : null}
      </span>
      {children}
      {error ? <p className={styles.error}>{error}</p> : hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
}

const UserCell = ({ user }: { user: IUserLite | null | undefined }) =>
  user ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate">{user.display_name}</span>
    </span>
  ) : (
    <>—</>
  );

function FieldSection(props: { title: string; extra?: ReactNode; divided?: boolean; children: ReactNode }) {
  const { title, extra, divided, children } = props;
  return (
    <section className="space-y-3.5">
      <div
        className={cn(
          "flex items-baseline justify-between gap-3",
          divided && "border-b border-subtle pb-2"
        )}
      >
        <h3 className="text-13 font-semibold text-primary">{title}</h3>
        {extra ? <span className="text-12 text-tertiary">{extra}</span> : null}
      </div>
      {children}
    </section>
  );
}

export const ProductExtendedFields = observer(function ProductExtendedFields(props: Props) {
  const {
    workspaceSlug,
    editable,
    variant,
    values,
    errors,
    onChange,
    product,
    missingRequiredFields,
    className,
    ownerField,
  } = props;
  const { t } = useTranslation();
  // 一次拉全量字典给 6 个下拉共用；查看态不请求
  const { isLoading, getDictionaryByKey } = useDataDictionaries(workspaceSlug, { autoFetch: editable });
  const styles = VARIANT_STYLES[variant];
  const reviewers = product?.reviewer_details ?? [];
  const showOptional = false;
  const divided = variant === "settings";
  const gridClass = cn(
    "grid grid-cols-1",
    variant === "settings" ? "gap-x-6 gap-y-4" : "gap-x-5 gap-y-4",
    styles.grid
  );

  const fieldLabel = (key: TProductExtendedFieldKey) => t(`workspace_products.fields.${key}`);
  const wrapperProps = (key: TProductExtendedFieldKey) => ({
    label: fieldLabel(key),
    required: PRODUCT_REQUIRED_EXTENDED_FIELDS.includes(key),
    editable,
    optionalText: t("workspace_products.fields.optional"),
    showOptional,
    error: errors[key],
    styles,
  });
  const dropdownButtonClassName = (key: TProductExtendedFieldKey) =>
    cn(styles.dropdownButton, errors[key] && "border-danger-strong");

  const isDictionaryEmpty = (key: TProductDictionaryFieldKey) => {
    const dictionary = getDictionaryByKey(PRODUCT_DICTIONARY_FIELDS[key]);
    return editable && dictionary !== undefined && dictionary.items.length === 0;
  };

  const renderDictionaryEmptyHint = (key: TProductDictionaryFieldKey) => {
    const dictionary = getDictionaryByKey(PRODUCT_DICTIONARY_FIELDS[key]);
    return (
      <span className="flex flex-wrap items-center gap-x-1">
        {t("workspace_products.validation.dictionary_empty", { name: dictionary?.name ?? fieldLabel(key) })}
        <Link to={`/${workspaceSlug}/settings/data-dictionaries`} className="text-accent-primary hover:underline">
          {t("workspace_products.validation.manage_dictionaries")}
        </Link>
      </span>
    );
  };

  const renderDictionaryEmptyBanners = (keys: readonly TProductDictionaryFieldKey[]) => {
    const emptyKeys = keys.filter(isDictionaryEmpty);
    if (emptyKeys.length === 0) return null;
    return (
      <div className="space-y-2">
        {emptyKeys.map((key) => (
          <div
            key={key}
            className="flex items-start gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-2.5 py-2 text-12 leading-5 text-warning-primary"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div>{renderDictionaryEmptyHint(key)}</div>
          </div>
        ))}
      </div>
    );
  };

  const textFields = TEXT_FIELDS.map((key) => (
    <FieldWrapper key={key} {...wrapperProps(key)}>
      {editable ? (
        <Input
          id={`product-${key}`}
          name={key}
          type="text"
          value={values[key]}
          onChange={(event) => onChange(key, event.target.value)}
          maxLength={255}
          hasError={Boolean(errors[key])}
          placeholder={key === "code" ? t("workspace_products.fields.code_placeholder") : fieldLabel(key)}
          className={styles.input}
        />
      ) : (
        <p className={cn(styles.text, "truncate")}>{values[key] || "—"}</p>
      )}
    </FieldWrapper>
  ));

  const dictionaryFields = (keys: readonly TProductDictionaryFieldKey[]) =>
    keys.map((key) => {
      const dictionary = getDictionaryByKey(PRODUCT_DICTIONARY_FIELDS[key]);
      const detail = product?.[`${key}_detail` as const] ?? null;
      const empty = isDictionaryEmpty(key);
      return (
        <FieldWrapper key={key} {...wrapperProps(key)} error={empty ? undefined : errors[key]}>
          {editable ? (
            <div className={styles.control}>
              <DictionaryItemSelect
                dictionary={dictionary}
                value={values[key]}
                onChange={(itemId) => onChange(key, itemId)}
                disabled={empty}
                placeholder={t("workspace_products.fields.select_placeholder")}
                hasError={Boolean(errors[key])}
                fallbackLabel={detail?.label}
                isLoading={isLoading}
                buttonClassName={styles.dropdownButton}
              />
            </div>
          ) : (
            <p className={cn(styles.text, "truncate")}>{detail?.label ?? "—"}</p>
          )}
        </FieldWrapper>
      );
    });

  const dateFields = DATE_FIELDS.map((key) => (
    <FieldWrapper key={key} {...wrapperProps(key)}>
      {editable ? (
        <div className={styles.control}>
          <DateDropdown
            value={getDate(values[key])}
            onChange={(date) => onChange(key, date ? (renderFormattedPayloadDate(date) ?? null) : null)}
            buttonVariant="border-with-text"
            isClearable={key !== "start_date"}
            placeholder={t("workspace_products.fields.date_placeholder")}
            className="h-full w-full"
            buttonContainerClassName="h-full w-full"
            buttonClassName={dropdownButtonClassName(key)}
          />
        </div>
      ) : (
        <p className={styles.text}>{renderFormattedDate(values[key]) ?? "—"}</p>
      )}
    </FieldWrapper>
  ));

  const leadFields = LEAD_FIELDS.map((key) => (
    <FieldWrapper key={key} {...wrapperProps(key)}>
      {editable ? (
        <div className={styles.control}>
          <MemberDropdown
            multiple={false}
            value={values[key]}
            onChange={(value) => onChange(key, value)}
            buttonVariant="border-with-text"
            placeholder={t("workspace_products.fields.select_member_placeholder")}
            showUserDetails
            className="h-full w-full"
            buttonContainerClassName="h-full w-full"
            buttonClassName={dropdownButtonClassName(key)}
          />
        </div>
      ) : (
        <div className={styles.text}>
          <UserCell user={product?.[`${key}_detail` as const]} />
        </div>
      )}
    </FieldWrapper>
  ));

  const reviewersField = (
    <FieldWrapper {...wrapperProps("reviewers")}>
      {editable ? (
        <div className={styles.control}>
          <MemberDropdown
            multiple
            value={values.reviewers}
            onChange={(value) => onChange("reviewers", value)}
            buttonVariant="border-with-text"
            placeholder={t("workspace_products.fields.select_member_placeholder")}
            showUserDetails
            className="h-full w-full"
            buttonContainerClassName="h-full w-full"
            buttonClassName={dropdownButtonClassName("reviewers")}
          />
        </div>
      ) : (
        <div className={styles.text}>
          {reviewers.length > 0 ? (
            <span className="flex min-w-0 items-center gap-2">
              <AvatarGroup size="sm" max={3} showTooltip={false}>
                {reviewers.map((user) => (
                  <Avatar key={user.id} name={user.display_name} src={getFileURL(user.avatar_url ?? "")} />
                ))}
              </AvatarGroup>
              <span className="truncate">{reviewers.map((user) => user.display_name).join("、")}</span>
            </span>
          ) : (
            "—"
          )}
        </div>
      )}
    </FieldWrapper>
  );

  const missingBanner =
    editable && missingRequiredFields && missingRequiredFields.length > 0 ? (
      <div className="flex gap-3 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-primary" />
        <p className="text-11 leading-4 text-secondary">
          {t("workspace_products.validation.legacy_incomplete", {
            fields: missingRequiredFields.map(fieldLabel).join("、"),
          })}
        </p>
      </div>
    ) : null;

  return (
    <div className={cn(variant === "settings" ? "space-y-8" : "space-y-7", className)}>
      {missingBanner}
      <FieldSection
        title={t("workspace_products.extended.identity")}
        extra={editable ? t("workspace_products.fields.code_hint") : undefined}
        divided={divided}
      >
        <div className={gridClass}>{textFields}</div>
      </FieldSection>
      <FieldSection title={t("workspace_products.extended.classification")} divided={divided}>
        {renderDictionaryEmptyBanners(CLASSIFICATION_FIELDS)}
        <div className={gridClass}>{dictionaryFields(CLASSIFICATION_FIELDS)}</div>
      </FieldSection>
      <FieldSection title={t("workspace_products.extended.levels")} divided={divided}>
        {renderDictionaryEmptyBanners(LEVEL_FIELDS)}
        <div className={gridClass}>{dictionaryFields(LEVEL_FIELDS)}</div>
      </FieldSection>
      <FieldSection title={t("workspace_products.extended.plan")} divided={divided}>
        <div className={gridClass}>{dateFields}</div>
      </FieldSection>
      <FieldSection title={t("workspace_products.extended.team")} divided={divided}>
        <div className={gridClass}>
          {ownerField}
          {leadFields}
          {reviewersField}
        </div>
      </FieldSection>
    </div>
  );
});
