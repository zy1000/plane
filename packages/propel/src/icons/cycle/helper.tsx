export interface ICycleGroupIcon {
  className?: string;
  color?: string;
  cycleGroup: TCycleGroups;
  height?: string;
  width?: string;
}

export type TCycleGroups = "not_started" | "in_progress" | "delayed" | "completed" | "cancelled";

export const CYCLE_GROUP_COLORS: {
  [key in TCycleGroups]: string;
} = {
  in_progress: "#F59E0B",
  not_started: "#3F76FF",
  delayed: "#DC2626",
  completed: "#16A34A",
  cancelled: "#525252",
};

export const CYCLE_GROUP_I18N_LABELS: {
  [key in TCycleGroups]: string;
} = {
  not_started: "未开始",
  in_progress: "进行中",
  delayed: "已延期",
  completed: "已完成",
  cancelled: "已取消",
};
