/**
 * 从后端的校验错误结构里取第一条人话。
 *
 * 字段级错误是嵌套的 —— 单条保存是 {"data": ["客户值：超出取值范围 (0,15]"]}，批量保存是
 * {"updates": [{"non_field_errors": ["…"]}]} —— 顶层没有 error 键。各保存入口在
 * payload.error 取不到时用它兜一层，别让一句「保存失败」把后端已经说清楚的原因盖掉。
 */
export const firstValidationMessage = (payload: unknown, depth = 0): string | null => {
  if (typeof payload === "string") {
    const text = payload.trim();
    // 网关 / 500 页面回来的是整段 HTML，不是给人看的原因
    return text && text.length <= 200 && !text.startsWith("<") ? text : null;
  }
  if (!payload || typeof payload !== "object" || depth > 4) return null;
  for (const value of Array.isArray(payload) ? payload : Object.values(payload)) {
    const found = firstValidationMessage(value, depth + 1);
    if (found) return found;
  }
  return null;
};
