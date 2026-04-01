/**
 * 测试模块错误提示：与全站一致的系统 Toast（@plane/propel）及项目权限文案。
 */
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

export function qaCaseErrorContent(
  error: unknown,
  t: (key: string, params?: Record<string, unknown>) => string,
  fallback: string
): string {
  if (isProjectPermissionError(error)) {
    const title = t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title);
    const msgKey = PROJECT_ERROR_MESSAGES.permissionError.i18n_message;
    if (msgKey) return `${title} ${t(msgKey)}`;
    return title;
  }
  const e = error as { error?: string; message?: string; detail?: string };
  return String(e?.error ?? e?.message ?? e?.detail ?? fallback);
}

/** 系统 Toast：错误（含权限与其它接口错误） */
export function qaCaseSetToastError(
  error: unknown,
  t: (key: string, params?: Record<string, unknown>) => string,
  fallback: string
) {
  if (isProjectPermissionError(error)) {
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
      message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
        ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
        : undefined,
    });
    return;
  }
  const e = error as { error?: string; message?: string; detail?: string };
  const msg = String(e?.error ?? e?.message ?? e?.detail ?? fallback);
  setToast({
    type: TOAST_TYPE.ERROR,
    title: t("common.error.label"),
    message: msg,
  });
}

/** 系统 Toast：成功 */
export function qaCaseSetToastSuccess(message: string, title = "成功") {
  setToast({
    type: TOAST_TYPE.SUCCESS,
    title,
    message,
  });
}

/** 系统 Toast：警告 */
export function qaCaseSetToastWarning(message: string, title = "提示") {
  setToast({
    type: TOAST_TYPE.WARNING,
    title,
    message,
  });
}

/** 系统 Toast：信息 */
export function qaCaseSetToastInfo(message: string, title = "提示") {
  setToast({
    type: TOAST_TYPE.INFO,
    title,
    message,
  });
}

/**
 * 将 Axios 错误规范为与 `throw error?.response?.data` 一致的结构。
 * `responseType: "blob"` 时 403/400 的 JSON 体会落在 `response.data` 为 Blob，需解析后才能走 `isProjectPermissionError`。
 */
export async function normalizeQaAxiosError(error: unknown): Promise<unknown> {
  const ax = error as { response?: { data?: unknown } };
  const data = ax?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = (await data.text()).trim();
      if (text.startsWith("{") || text.startsWith("[")) {
        return JSON.parse(text) as unknown;
      }
    } catch {
      return error;
    }
    return error;
  }
  if (data !== undefined && data !== null && typeof data === "object" && "error" in (data as object)) {
    return data;
  }
  return error;
}

/** blob 导出等场景：先 normalize 再系统 Toast 错误 */
export async function qaCaseSetToastErrorFromAxios(
  error: unknown,
  t: (key: string, params?: Record<string, unknown>) => string,
  fallback: string
) {
  const normalized = await normalizeQaAxiosError(error);
  qaCaseSetToastError(normalized, t, fallback);
}
