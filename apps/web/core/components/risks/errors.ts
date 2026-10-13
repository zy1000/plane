import { getRiskError } from "@/hooks/store/use-risks";
import { RISK_I18N } from "./constants";

/**
 * 接口错误 → 一句可显示的文案：领域错误码（`RISK_*`）查 `risk.errors.<code>`，
 * 查不到（`t` 对缺失 key 原样返回）或没有码的回落到服务端原文。
 */
export const translateRiskError = (t: (key: string) => string, error: unknown) => {
  const { message, code } = getRiskError(error);
  if (!code) return message;
  const key = `${RISK_I18N}.errors.${code}`;
  const text = t(key);
  return text && text !== key ? text : message;
};
