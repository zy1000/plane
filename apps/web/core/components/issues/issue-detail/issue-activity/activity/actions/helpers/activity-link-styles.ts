import { cn } from "@plane/utils";

/** 活动流内可点击链接（与项目活动流保持一致） */
export const ACTIVITY_LINK_CLASS = "font-medium text-[#1677ff] hover:underline";

export const activityLinkClassName = (...extra: (string | false | undefined)[]) =>
  cn(ACTIVITY_LINK_CLASS, ...extra);

export const activityInlineLinkClassName = (...extra: (string | false | undefined)[]) =>
  cn("inline-flex items-center gap-1", ACTIVITY_LINK_CLASS, ...extra);

export const activityTruncateLinkClassName = (...extra: (string | false | undefined)[]) =>
  cn("inline-flex items-center gap-1 truncate", ACTIVITY_LINK_CLASS, ...extra);
