export type TExecutionResultKey = "成功" | "阻塞" | "失败" | "无效" | "未执行";

export type TExecutionResultMeta = {
  key: TExecutionResultKey;
  label: string;
  /** 内联色值，给堆叠条 / 小进度条用 */
  color: string;
  dotClass: string;
  pillClass: string;
};

/**
 * 执行结果五态的展示顺序与颜色。
 * 顺序把「阻塞」夹在成功和失败之间，堆叠条里红绿不直接相邻。
 */
export const EXECUTION_RESULT_META: TExecutionResultMeta[] = [
  {
    key: "成功",
    label: "成功",
    color: "var(--bg-success-primary)",
    dotClass: "bg-success-primary",
    pillClass: "bg-success-subtle text-success-primary",
  },
  {
    key: "阻塞",
    label: "阻塞",
    color: "var(--bg-warning-primary)",
    dotClass: "bg-warning-primary",
    pillClass: "bg-warning-subtle text-warning-primary",
  },
  {
    key: "失败",
    label: "失败",
    color: "var(--bg-danger-primary)",
    dotClass: "bg-danger-primary",
    pillClass: "bg-danger-subtle text-danger-primary",
  },
  {
    key: "无效",
    label: "无效",
    color: "#5b7bb5",
    dotClass: "bg-[#5b7bb5]",
    pillClass: "bg-[#5b7bb5]/10 text-[#5b7bb5] dark:text-[#9bb4e6]",
  },
  {
    key: "未执行",
    label: "未执行",
    color: "var(--bg-layer-3)",
    dotClass: "bg-layer-3",
    pillClass: "bg-layer-1 text-tertiary",
  },
];
