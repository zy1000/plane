import type { TTestCaseActivity } from "@plane/types";

export const TEST_CASE_FIELD_LABELS: Record<string, string> = {
  name: "名称",
  type: "用例类型",
  test_type: "测试类型",
  priority: "优先级",
  assignee: "维护人",
  module: "模块",
  labels: "标签",
  issues: "关联工作项",
  precondition: "前置条件",
  steps: "步骤",
  text_description: "文本描述",
  text_result: "预期结果",
  remark: "备注",
  review: "评审状态",
  execution: "执行情况",
  comment: "评论",
  attachment: "附件",
  case: "用例",
};

const TYPE_LABELS: Record<string, string> = {
  "0": "功能测试",
  "1": "性能测试",
  "2": "安全测试",
  "4": "兼容测试",
  "5": "回归测试",
  "7": "集成测试",
  "99": "其他",
};

const TEST_TYPE_LABELS: Record<string, string> = {
  "0": "手动",
  "1": "自动",
};

const PRIORITY_LABELS: Record<string, string> = {
  "0": "低",
  "1": "中",
  "2": "高",
};

const renderText = (value: string | null | undefined, fallback = "空"): string => {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  return String(value);
};

const renderChoiceText = (field: string | null, value: string | null | undefined): string => {
  const raw = renderText(value, "空");
  if (!field) return raw;
  if (field === "type") return TYPE_LABELS[raw] ?? raw;
  if (field === "test_type") return TEST_TYPE_LABELS[raw] ?? raw;
  if (field === "priority") return PRIORITY_LABELS[raw] ?? raw;
  return raw;
};

export const buildTestCaseActivityMessage = (activity: TTestCaseActivity): string => {
  const { verb, field, old_value, new_value, comment } = activity;
  const fieldLabel = field ? TEST_CASE_FIELD_LABELS[field] ?? field : "";

  if (field === "case" && verb === "created") return "创建了用例";
  if (field === "case" && verb === "deleted") {
    const name = renderText(old_value, "");
    return name ? `删除了用例「${name}」` : "删除了用例";
  }

  if (field === "comment" && verb === "created") {
    const text = renderText(new_value, "");
    return text ? `评论：${text}` : "新增了评论";
  }
  if (field === "comment" && verb === "deleted") {
    const text = renderText(old_value, "");
    return text ? `删除了评论：${text}` : "删除了评论";
  }

  if (field === "attachment" && verb === "created") {
    const name = renderText(new_value, "");
    return name ? `新增了附件「${name}」` : "新增了附件";
  }
  if (field === "attachment" && verb === "deleted") {
    const name = renderText(old_value, "");
    return name ? `删除了附件「${name}」` : "删除了附件";
  }

  if (field === "review" && verb === "updated") {
    const oldText = renderText(old_value, "未开始");
    const newText = renderText(new_value, "未开始");
    return `评审状态变更：${oldText} → ${newText}`;
  }

  if (field === "execution" && verb === "updated") {
    const oldText = renderText(old_value, "未执行");
    const newText = renderText(new_value, "未执行");
    return `执行情况变更：${oldText} → ${newText}`;
  }

  if (field && verb === "updated") {
    const oldText = renderChoiceText(field, old_value);
    const newText = renderChoiceText(field, new_value);
    return `更新了${fieldLabel}：${oldText} → ${newText}`;
  }

  return comment || `${verb} ${fieldLabel}`.trim();
};
