// types
export const CYCLE_STATUS: {
  i18n_label: string;
  value: "not_started" | "in_progress" | "delayed" | "completed" | "cancelled";
  i18n_title: string;
  color: string;
  textColor: string;
  bgColor: string;
}[] = [
  {
    i18n_label: "进行中",
    value: "in_progress",
    i18n_title: "进行中",
    color: "#F59E0B",
    textColor: "text-amber-500",
    bgColor: "bg-amber-50",
  },
  {
    i18n_label: "未开始",
    value: "not_started",
    i18n_title: "未开始",
    color: "#3F76FF",
    textColor: "text-blue-500",
    bgColor: "bg-indigo-50",
  },
  {
    i18n_label: "已延期",
    value: "delayed",
    i18n_title: "已延期",
    color: "#DC2626",
    textColor: "text-red-600",
    bgColor: "bg-red-50",
  },
  {
    i18n_label: "已完成",
    value: "completed",
    i18n_title: "已完成",
    color: "#16A34A",
    textColor: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    i18n_label: "已取消",
    value: "cancelled",
    i18n_title: "已取消",
    color: "#525252",
    textColor: "text-custom-text-300",
    bgColor: "bg-custom-background-90",
  },
];
