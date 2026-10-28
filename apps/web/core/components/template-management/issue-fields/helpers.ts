/** 字段库接口的错误文案：后端统一回 `{error}`（409 还带 code / binding_count） */
export const getIssueFieldErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: unknown; detail?: unknown };
    if (typeof payload.error === "string") return payload.error;
    if (typeof payload.detail === "string") return payload.detail;
    const [firstValue] = Object.values(error as Record<string, unknown>);
    if (typeof firstValue === "string") return firstValue;
    if (Array.isArray(firstValue) && typeof firstValue[0] === "string") return firstValue[0];
  }
  return fallback;
};
