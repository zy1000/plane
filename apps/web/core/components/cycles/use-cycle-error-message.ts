/**
 * 统一处理 cycle patch 接口返回的错误结构。
 *
 * 后端 ValidationError 失败时 body 可能形如：
 *   { error: ["不符合状态流转规则"], reasons: ["请填写开始时间", "请先规划工作项"] }
 *
 * 其他场景可能只有 detail / error 字符串。
 */
export type TCycleUpdateErrorMessage = {
  title: string;
  message: string;
};

const pickString = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
};

const pickStringList = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item: unknown): item is string => typeof item === "string");
  return [];
};

const pickFallbackMessage = (err: unknown): string | undefined => {
  const directMessage =
    pickString((err as any)?.detail) ??
    pickString((err as any)?.error) ??
    pickString((err as any)?.non_field_errors) ??
    pickString((err as any)?.message);

  if (directMessage) return directMessage;

  if (err && typeof err === "object") {
    for (const value of Object.values(err as Record<string, unknown>)) {
      const message = pickString(value);
      if (message) return message;
    }
  }

  return undefined;
};

export const formatCycleUpdateError = (err: any): TCycleUpdateErrorMessage => {
  const reasons = pickStringList(err?.reasons);

  if (reasons.length > 0) {
    return {
      title: "状态变更失败",
      message: reasons.join("\n"),
    };
  }

  const fallback = pickFallbackMessage(err);
  return {
    title: "Error!",
    message: fallback ?? "Cycle could not be updated. Please try again.",
  };
};
