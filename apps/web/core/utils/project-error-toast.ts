import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

type TTranslate = (key: string, params?: Record<string, unknown>) => string;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "string") return error;
  const currentError = error as { detail?: unknown; error?: unknown; message?: unknown };
  return String(currentError?.detail ?? currentError?.error ?? currentError?.message ?? fallback);
};

export const projectSetToastError = (error: unknown, t: TTranslate, fallback: string) => {
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

  setToast({
    type: TOAST_TYPE.ERROR,
    title: t("common.error.label"),
    message: getErrorMessage(error, fallback),
  });
};

export const projectSetToastSuccess = (message: string, title = "成功") => {
  setToast({
    type: TOAST_TYPE.SUCCESS,
    title,
    message,
  });
};

export const projectSetToastWarning = (message: string, title = "提示") => {
  setToast({
    type: TOAST_TYPE.WARNING,
    title,
    message,
  });
};
