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
import {
  FORM_VARIANT_STYLES,
  FormField,
  FormSection,
  FormWarningBanner,
  getFormGridClassName,
} from "@/components/common/form-section";
import type { TFormVariant } from "@/components/common/form-section";
import { DictionaryItemSelect } from "@/components/dropdowns/dictionary-item-select";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { PRODUCT_DICTIONARY_FIELDS, PRODUCT_REQUIRED_EXTENDED_FIELDS } from "./constants";
import type { TProductDictionaryFieldKey } from "./constants";
import type { TProductExtendedFieldErrors, TProductExtendedFieldsState } from "./use-product-extended-fields";

type Props = {
  workspaceSlug: string;
  editable: boolean;
  variant: TFormVariant;
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

const UserCell = ({ user }: { user: IUserLite | null | undefined }) =>
  user ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate">{user.display_name}</span>
    </span>
  ) : (
    <>—</>
  );

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
  const styles = FORM_VARIANT_STYLES[variant];
  const reviewers = product?.reviewer_details ?? [];
  const showOptional = false;
  const divided = variant === "settings";
  const gridClass = getFormGridClassName(variant);

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
    <FormField key={key} {...wrapperProps(key)}>
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
    </FormField>
  ));

  const dictionaryFields = (keys: readonly TProductDictionaryFieldKey[]) =>
    keys.map((key) => {
      const dictionary = getDictionaryByKey(PRODUCT_DICTIONARY_FIELDS[key]);
      const detail = product?.[`${key}_detail` as const] ?? null;
      const empty = isDictionaryEmpty(key);
      return (
        <FormField key={key} {...wrapperProps(key)} error={empty ? undefined : errors[key]}>
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
        </FormField>
      );
    });

  const dateFields = DATE_FIELDS.map((key) => (
    <FormField key={key} {...wrapperProps(key)}>
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
    </FormField>
  ));

  const leadFields = LEAD_FIELDS.map((key) => (
    <FormField key={key} {...wrapperProps(key)}>
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
    </FormField>
  ));

  const reviewersField = (
    <FormField {...wrapperProps("reviewers")}>
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
    </FormField>
  );

  const missingBanner =
    editable && missingRequiredFields && missingRequiredFields.length > 0 ? (
      <FormWarningBanner>
        {t("workspace_products.validation.legacy_incomplete", {
          fields: missingRequiredFields.map(fieldLabel).join("、"),
        })}
      </FormWarningBanner>
    ) : null;

  return (
    <div className={cn(variant === "settings" ? "space-y-8" : "space-y-7", className)}>
      {missingBanner}
      <FormSection
        title={t("workspace_products.extended.identity")}
        extra={editable ? t("workspace_products.fields.code_hint") : undefined}
        divided={divided}
      >
        <div className={gridClass}>{textFields}</div>
      </FormSection>
      <FormSection title={t("workspace_products.extended.classification")} divided={divided}>
        {renderDictionaryEmptyBanners(CLASSIFICATION_FIELDS)}
        <div className={gridClass}>{dictionaryFields(CLASSIFICATION_FIELDS)}</div>
      </FormSection>
      <FormSection title={t("workspace_products.extended.levels")} divided={divided}>
        {renderDictionaryEmptyBanners(LEVEL_FIELDS)}
        <div className={gridClass}>{dictionaryFields(LEVEL_FIELDS)}</div>
      </FormSection>
      <FormSection title={t("workspace_products.extended.plan")} divided={divided}>
        <div className={gridClass}>{dateFields}</div>
      </FormSection>
      <FormSection title={t("workspace_products.extended.team")} divided={divided}>
        <div className={gridClass}>
          {ownerField}
          {leadFields}
          {reviewersField}
        </div>
      </FormSection>
    </div>
  );
});
