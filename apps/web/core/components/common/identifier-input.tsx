"use client";

import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

/**
 * 需求编号前缀的输入框。
 *
 * 产品与需求标准库共用 —— 两边的规则完全一致（工作区内唯一、大写、首位字母、
 * 最长 12），后端也是同一个 IDENTIFIER_PATTERN 在校验。
 *
 * 刻意**不做**「跟着名称自动派生」：本系统的产品/库名基本都是中文，
 * 项目那套 projectIdentifierSanitizer 派生法会得到空串，反而要用户先删再填。
 */

export const IDENTIFIER_MAX_LENGTH = 12;

/** 与后端 plane/app/serializers/product.py 的 IDENTIFIER_PATTERN 保持一致 */
const IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9]{0,11}$/;

/** 输入时就滤掉非法字符，避免用户敲完一串中文才被告知不行 */
export const sanitizeIdentifier = (value: string): string =>
  value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, IDENTIFIER_MAX_LENGTH);

export const isValidIdentifier = (value: string): boolean => IDENTIFIER_PATTERN.test(value);

type TProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 只读态直接渲染文本，与产品弹窗的 view 模式一致 */
  editable?: boolean;
  error?: string | null;
  autoFocus?: boolean;
  label?: string;
  hint?: string;
  /** 必填标记：label 后追加红色星号 */
  required?: boolean;
  /** 隐藏 hint 与错误文案（错误描边保留），用于由外部统一展示提示行的紧凑布局 */
  hideMessages?: boolean;
};

export const IdentifierInput = (props: TProps) => {
  const { id, value, onChange, editable = true, error, autoFocus, label, hint, required, hideMessages } = props;
  const { t } = useTranslation();

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-0.5 text-12 font-medium text-secondary">
        {label ?? t("common.identifier.label")}
        {required && <span className="text-danger-primary">*</span>}
      </label>
      {editable ? (
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(sanitizeIdentifier(event.target.value))}
          maxLength={IDENTIFIER_MAX_LENGTH}
          autoFocus={autoFocus}
          className={cn(
            "focus:border-accent-primary h-9 w-full rounded-md border bg-surface-1 px-3 text-13 uppercase text-primary outline-none placeholder:text-placeholder",
            error ? "border-danger-primary" : "border-subtle"
          )}
          placeholder={t("common.identifier.placeholder")}
        />
      ) : (
        <p className="text-13 text-primary">{value || "—"}</p>
      )}
      {!hideMessages &&
        (error ? (
          <p className="mt-1.5 text-11 text-danger-primary">{error}</p>
        ) : (
          <p className="mt-1.5 text-11 text-tertiary">{hint ?? t("common.identifier.hint")}</p>
        ))}
    </div>
  );
};
