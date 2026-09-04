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
  FormFieldGroup,
  FormFieldShell,
  FormSection,
  FormWarningBanner,
  getFormGridClassName,
} from "@/components/common/form-section";
import type { TFormVariant } from "@/components/common/form-section";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import { DictionaryItemSelect } from "@/components/dropdowns/dictionary-item-select";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { PRODUCT_DICTIONARY_FIELDS, PRODUCT_FORM_DICTIONARY_KEYS, PRODUCT_REQUIRED_EXTENDED_FIELDS } from "./constants";
import type { TProductDictionaryFieldKey, TProductFormDictionaryKey } from "./constants";
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
  /** 把描述编辑器放进「描述」区；不传则不渲染该组（设置页描述在区块外自持） */
  descriptionField?: ReactNode;
};

const TEXT_FIELDS = ["model_number", "external_model"] as const;
const CLASSIFICATION_FIELDS = ["stage", "status", "category"] as const;
const LEVEL_FIELDS = ["hardware_level", "structure_level", "software_level"] as const;
const DATE_FIELDS = ["start_date", "o_phase_close_date", "v_phase_close_date"] as const;
const LEAD_FIELDS = ["project_lead", "test_lead"] as const;

/**
 * 分组弹窗里三连排一行的字段用短标签，语境由组名（研发等级 / 计划）给出。
 * 设置页仍用完整字段名。
 */
const SHORT_LABEL_FIELDS: Partial<Record<TProductExtendedFieldKey, true>> = {
  hardware_level: true,
  structure_level: true,
  software_level: true,
  o_phase_close_date: true,
  v_phase_close_date: true,
};

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
    descriptionField,
  } = props;
  const { t } = useTranslation();
  // 一次拉全量字典给 7 个下拉（6 个 FK + 项目代号）共用；查看态不请求
  const { isLoading, getDictionaryByKey } = useDataDictionaries(workspaceSlug, { autoFetch: editable });
  const styles = FORM_VARIANT_STYLES[variant];
  const reviewers = product?.reviewer_details ?? [];
  const showOptional = false;
  const divided = variant === "settings";
  const grouped = variant === "grouped-modal";
  const gridClass = getFormGridClassName(variant);
  /** 分组弹窗按组指定列数；设置页一律两列 */
  const groupGrid = (columns: 2 | 3) =>
    grouped ? cn("grid grid-cols-1 gap-x-5 gap-y-4", columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2") : gridClass;
  /** 整行字段：跟随所在组的列数 */
  const fullSpan = (columns: 2 | 3) => (grouped && columns === 3 ? "md:col-span-3" : "md:col-span-2");

  const fieldLabel = (key: TProductExtendedFieldKey) => t(`workspace_products.fields.${key}`);
  const displayLabel = (key: TProductExtendedFieldKey) =>
    grouped && SHORT_LABEL_FIELDS[key] ? t(`workspace_products.fields.${key}_short`) : fieldLabel(key);
  const wrapperProps = (key: TProductExtendedFieldKey) => ({
    label: displayLabel(key),
    required: PRODUCT_REQUIRED_EXTENDED_FIELDS.includes(key),
    editable,
    optionalText: t("workspace_products.fields.optional"),
    showOptional,
    error: errors[key],
    styles,
  });
  const dropdownButtonClassName = (key: TProductExtendedFieldKey) =>
    cn(styles.dropdownButton, errors[key] && "border-danger-strong");

  const isDictionaryEmpty = (key: TProductFormDictionaryKey) => {
    const dictionary = getDictionaryByKey(PRODUCT_FORM_DICTIONARY_KEYS[key]);
    return editable && dictionary !== undefined && dictionary.items.length === 0;
  };

  const renderDictionaryEmptyHint = (key: TProductFormDictionaryKey) => {
    const dictionary = getDictionaryByKey(PRODUCT_FORM_DICTIONARY_KEYS[key]);
    return (
      <span className="flex flex-wrap items-center gap-x-1">
        {t("workspace_products.validation.dictionary_empty", { name: dictionary?.name ?? fieldLabel(key) })}
        <Link to={`/${workspaceSlug}/settings/data-dictionaries`} className="text-accent-primary hover:underline">
          {t("workspace_products.validation.manage_dictionaries")}
        </Link>
      </span>
    );
  };

  const renderDictionaryEmptyBanners = (keys: readonly TProductFormDictionaryKey[]) => {
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
    <FormFieldShell key={key} {...wrapperProps(key)}>
      {editable ? (
        <Input
          id={`product-${key}`}
          name={key}
          type="text"
          value={values[key]}
          onChange={(event) => onChange(key, event.target.value)}
          maxLength={255}
          hasError={Boolean(errors[key])}
          placeholder={fieldLabel(key)}
          className={styles.input}
        />
      ) : (
        <p className={cn(styles.text, "truncate")}>{values[key] || "—"}</p>
      )}
    </FormFieldShell>
  ));

  // 项目代号：与 Project.code 同一本 project_code 字典，但产品这边 code 是字符串列，存的是 label 而不是 id
  const codeDictionary = getDictionaryByKey(PRODUCT_FORM_DICTIONARY_KEYS.code);
  const code = values.code.trim();
  const codeItem = code ? codeDictionary?.items.find((item) => item.label === code) : undefined;
  const codeEmpty = isDictionaryEmpty("code");
  const codeField = (
    <FormFieldShell
      {...wrapperProps("code")}
      error={codeEmpty ? undefined : errors.code}
      // 分组弹窗没有分区标题的 extra 位，「工作区内唯一」挂到控件下方
      hint={grouped && editable && !codeEmpty ? t("workspace_products.fields.code_hint") : undefined}
      className={fullSpan(2)}
    >
      {editable ? (
        <div className={styles.control}>
          <DictionaryItemSelect
            dictionary={codeDictionary}
            // 下拉按 item id 选，表单值是 label，这里来回换算；
            // 字典未加载或存量代号不在字典里时，用 fallbackItem 把当前值原样显示出来
            value={codeItem?.id ?? (code || null)}
            onChange={(itemId) =>
              onChange("code", codeDictionary?.items.find((item) => item.id === itemId)?.label ?? "")
            }
            fallbackItem={
              code && !codeItem
                ? { id: code, label: code, dictionary: codeDictionary?.id ?? "", color: "", is_colored: false }
                : undefined
            }
            disabled={codeEmpty}
            placeholder={t("workspace_products.fields.select_placeholder")}
            hasError={Boolean(errors.code)}
            isLoading={isLoading}
            buttonClassName={styles.dropdownButton}
          />
        </div>
      ) : (
        <p className={cn(styles.text, "truncate")}>{values.code || "—"}</p>
      )}
    </FormFieldShell>
  );

  const dictionaryFields = (keys: readonly TProductDictionaryFieldKey[], columns: 2 | 3 = 2) =>
    keys.map((key) => {
      const dictionary = getDictionaryByKey(PRODUCT_DICTIONARY_FIELDS[key]);
      const detail = product?.[`${key}_detail` as const] ?? null;
      const empty = isDictionaryEmpty(key);
      return (
        <FormFieldShell
          key={key}
          {...wrapperProps(key)}
          error={empty ? undefined : errors[key]}
          className={key === "category" ? fullSpan(columns) : undefined}
        >
          {editable ? (
            <div className={styles.control}>
              <DictionaryItemSelect
                dictionary={dictionary}
                value={values[key]}
                onChange={(itemId) => onChange(key, itemId)}
                disabled={empty}
                placeholder={t("workspace_products.fields.select_placeholder")}
                hasError={Boolean(errors[key])}
                fallbackItem={detail}
                isLoading={isLoading}
                buttonClassName={styles.dropdownButton}
              />
            </div>
          ) : (
            <p className={cn(styles.text, "flex min-w-0 items-center")}>
              <DictionaryValueTag label={detail?.label ?? "—"} color={resolveDictionaryItemColor(detail, dictionary)} />
            </p>
          )}
        </FormFieldShell>
      );
    });

  const dateFields = DATE_FIELDS.map((key) => (
    <FormFieldShell key={key} {...wrapperProps(key)}>
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
    </FormFieldShell>
  ));

  const leadFields = LEAD_FIELDS.map((key) => (
    <FormFieldShell key={key} {...wrapperProps(key)}>
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
    </FormFieldShell>
  ));

  const reviewersField = (
    <FormFieldShell {...wrapperProps("reviewers")} className={fullSpan(3)}>
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
    </FormFieldShell>
  );

  const missingBanner =
    editable && missingRequiredFields && missingRequiredFields.length > 0 ? (
      <FormWarningBanner>
        {t("workspace_products.validation.legacy_incomplete", {
          fields: missingRequiredFields.map(fieldLabel).join("、"),
        })}
      </FormWarningBanner>
    ) : null;

  /** 分组弹窗用左侧组名列，设置页保持带分隔线的分区标题 */
  const group = (title: string, children: ReactNode, options?: { extra?: string; optional?: boolean }) =>
    grouped ? (
      <FormFieldGroup title={title} optional={options?.optional}>
        {children}
      </FormFieldGroup>
    ) : (
      <FormSection title={title} extra={options?.extra} divided={divided}>
        {children}
      </FormSection>
    );

  return (
    <div className={cn(grouped ? undefined : variant === "settings" ? "space-y-8" : "space-y-7", className)}>
      {missingBanner}
      {group(
        t("workspace_products.extended.basic"),
        <>
          {renderDictionaryEmptyBanners(["code"])}
          <div className={groupGrid(2)}>
            {codeField}
            {textFields}
          </div>
        </>,
        { extra: editable ? t("workspace_products.fields.code_hint") : undefined }
      )}
      {group(
        t("workspace_products.extended.classification"),
        <>
          {renderDictionaryEmptyBanners(CLASSIFICATION_FIELDS)}
          <div className={groupGrid(2)}>{dictionaryFields(CLASSIFICATION_FIELDS)}</div>
        </>
      )}
      {group(
        t("workspace_products.extended.levels"),
        <>
          {renderDictionaryEmptyBanners(LEVEL_FIELDS)}
          <div className={groupGrid(3)}>{dictionaryFields(LEVEL_FIELDS, 3)}</div>
        </>
      )}
      {group(t("workspace_products.extended.plan"), <div className={groupGrid(3)}>{dateFields}</div>)}
      {group(
        t("workspace_products.extended.team"),
        <div className={groupGrid(3)}>
          {ownerField}
          {leadFields}
          {reviewersField}
        </div>
      )}
      {descriptionField
        ? group(t("workspace_products.fields.description"), descriptionField, { optional: editable })
        : null}
    </div>
  );
});
