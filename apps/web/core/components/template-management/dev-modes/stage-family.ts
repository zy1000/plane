/**
 * 阶段的「族」：I / D / O / V 四段，「全部模式对比」的阶段路线按它上色。
 *
 * 阶段类型没有族字段，按阶段名首字母判（I阶段、D阶段、O-F1…、V阶段）；
 * 自定义的类型名对不上就归 other，用中性色，不硬塞进某一族。
 * 颜色写死 HEX：Tailwind 默认色板在这个项目里没有，bg-blue-500 之类不生效。
 */
export type TStageFamily = "I" | "D" | "O" | "V" | "other";

export const getStageFamily = (name: string): TStageFamily => {
  const head = name.trim().charAt(0).toUpperCase();
  if (head === "I" || head === "D" || head === "O" || head === "V") return head;
  return "other";
};

/** 阶段小药丸：浅底 + 同族深字 */
export const STAGE_FAMILY_SOFT: Record<TStageFamily, string> = {
  I: "bg-[#E6EFFA] text-[#1A5A97]",
  D: "bg-[#F0EBFB] text-[#5B3DB0]",
  O: "bg-[#FDF1DC] text-[#8A5410]",
  V: "bg-[#E3F3E8] text-[#1F7A44]",
  other: "bg-layer-1 text-secondary",
};
