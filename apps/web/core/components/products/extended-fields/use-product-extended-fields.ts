import { useCallback, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { TProduct, TProductExtendedFieldKey, TProductExtendedPayload } from "@plane/types";
import { PRODUCT_EXTENDED_FIELD_KEYS, PRODUCT_REQUIRED_EXTENDED_FIELDS } from "./constants";

export type TProductExtendedFieldsState = {
  code: string;
  stage: string | null;
  category: string | null;
  status: string | null;
  hardware_level: string | null;
  structure_level: string | null;
  software_level: string | null;
  /** YYYY-MM-DD */
  start_date: string | null;
  o_phase_close_date: string | null;
  v_phase_close_date: string | null;
  project_lead: string | null;
  test_lead: string | null;
  model_number: string;
  external_model: string;
  reviewers: string[];
};

export type TProductExtendedFieldErrors = Partial<Record<TProductExtendedFieldKey, string>>;

type TUseProductExtendedFieldsArgs = {
  product: TProduct | null | undefined;
  mode: "view" | "create" | "edit";
};

/** DRF 对必填字段的三种报错文案，统一映射成本地的「请填写 xx」 */
const SERVER_REQUIRED_PATTERN = /required|may not be null|may not be blank/i;

const buildState = (product?: TProduct | null): TProductExtendedFieldsState => ({
  code: product?.code ?? "",
  stage: product?.stage ?? null,
  category: product?.category ?? null,
  status: product?.status ?? null,
  hardware_level: product?.hardware_level ?? null,
  structure_level: product?.structure_level ?? null,
  software_level: product?.software_level ?? null,
  start_date: product?.start_date ?? null,
  o_phase_close_date: product?.o_phase_close_date ?? null,
  v_phase_close_date: product?.v_phase_close_date ?? null,
  project_lead: product?.project_lead ?? null,
  test_lead: product?.test_lead ?? null,
  model_number: product?.model_number ?? "",
  external_model: product?.external_model ?? "",
  reviewers: product?.reviewers ?? [],
});

const getMissingRequiredFields = (values: TProductExtendedFieldsState): TProductExtendedFieldKey[] =>
  PRODUCT_REQUIRED_EXTENDED_FIELDS.filter((key) => {
    const value = values[key];
    return typeof value === "string" ? value.trim() === "" : value === null;
  });

export const useProductExtendedFields = ({ product, mode }: TUseProductExtendedFieldsArgs) => {
  const { t } = useTranslation();
  const [values, setValues] = useState<TProductExtendedFieldsState>(() => buildState(product));
  const [errors, setErrors] = useState<TProductExtendedFieldErrors>({});

  const requiredMessage = useCallback(
    (key: TProductExtendedFieldKey) =>
      t("workspace_products.validation.required", { field: t(`workspace_products.fields.${key}`) }),
    [t]
  );

  const setValue = useCallback(
    <K extends TProductExtendedFieldKey>(key: K, value: TProductExtendedFieldsState[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
      setErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    []
  );

  const reset = useCallback((nextProduct?: TProduct | null) => {
    setValues(buildState(nextProduct));
    setErrors({});
  }, []);

  const clearErrors = useCallback(() => setErrors({}), []);

  const validate = useCallback(() => {
    const missing = getMissingRequiredFields(values);
    if (missing.length === 0) return true;
    const nextErrors: TProductExtendedFieldErrors = {};
    missing.forEach((key) => {
      nextErrors[key] = requiredMessage(key);
    });
    setErrors(nextErrors);
    return false;
  }, [requiredMessage, values]);

  const getPayload = useCallback(
    (): TProductExtendedPayload => ({
      code: values.code.trim(),
      // validate() 通过后必填项必非空，这里的 ?? "" 只做类型收窄
      stage: values.stage ?? "",
      category: values.category ?? "",
      status: values.status ?? "",
      hardware_level: values.hardware_level ?? "",
      structure_level: values.structure_level ?? "",
      software_level: values.software_level ?? "",
      start_date: values.start_date ?? "",
      project_lead: values.project_lead ?? "",
      test_lead: values.test_lead ?? "",
      model_number: values.model_number.trim() || null,
      external_model: values.external_model.trim() || null,
      o_phase_close_date: values.o_phase_close_date,
      v_phase_close_date: values.v_phase_close_date,
      reviewers: values.reviewers,
    }),
    [values]
  );

  const applyServerErrors = useCallback(
    (error: unknown) => {
      if (!error || typeof error !== "object") return false;
      const payload = error as Partial<Record<TProductExtendedFieldKey, unknown>>;
      const nextErrors: TProductExtendedFieldErrors = {};
      PRODUCT_EXTENDED_FIELD_KEYS.forEach((key) => {
        const raw = payload[key];
        const message = Array.isArray(raw) ? raw[0] : raw;
        if (typeof message !== "string" || !message) return;
        if (message === "PRODUCT_CODE_ALREADY_EXISTS") {
          nextErrors[key] = t("workspace_products.validation.code_already_exists");
        } else if (SERVER_REQUIRED_PATTERN.test(message)) {
          nextErrors[key] = requiredMessage(key);
        } else {
          nextErrors[key] = message;
        }
      });
      if (Object.keys(nextErrors).length === 0) return false;
      setErrors(nextErrors);
      return true;
    },
    [requiredMessage, t]
  );

  return {
    values,
    errors,
    hasErrors: Object.keys(errors).length > 0,
    // 只有编辑存量产品才需要提示「缺哪些必填」；创建态全空是常态，查看态不可改
    missingRequiredFields: mode === "edit" ? getMissingRequiredFields(values) : [],
    setValue,
    reset,
    clearErrors,
    validate,
    getPayload,
    applyServerErrors,
  };
};
