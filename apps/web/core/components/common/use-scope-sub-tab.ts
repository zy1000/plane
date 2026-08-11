import { BookOpenText, LayoutList } from "lucide-react";
import useLocalStorage from "@/hooks/use-local-storage";

/**
 * 「迭代范围 / 发布内容」页里的二级切换：工作项 | 需求。
 *
 * 状态必须放在 localStorage 而不是组件 state —— 页面和 header 是两棵独立的渲染树
 * （header 由 layout 挂载），而 header 右侧那排工具条（布局切换 / 筛选 / 添加工作项）
 * 只服务于工作项，切到需求子页时必须整排隐藏。useLocalStorage 的 setValue 会
 * dispatch `local-storage:${key}` 事件，同 key 的其他实例监听后 rehydrate，
 * 这正是本页 `*_sidebar_collapsed` 已经在用的同一套机制。
 *
 * key 带实体 id：不同迭代/发布单各记各的，避免像 `release_sidebar_collapsed`
 * 那样全局共用一个开关（那是个已有的坑，不要再复制）。
 */

export type TScopeSubTabKey = "work-items" | "requirements";

export const DEFAULT_SCOPE_SUB_TAB: TScopeSubTabKey = "work-items";

export const getCycleScopeSubTabStorageKey = (cycleId: string) => `cycle-scope-sub-tab-${cycleId}`;
export const getReleaseScopeSubTabStorageKey = (releaseId: string) => `release-scope-sub-tab-${releaseId}`;

/** 非法/历史值一律回落工作项 —— 它才是这个页面的主体 */
const normalize = (value: TScopeSubTabKey | null | undefined): TScopeSubTabKey =>
  value === "requirements" ? "requirements" : DEFAULT_SCOPE_SUB_TAB;

export const useScopeSubTab = (storageKey: string) => {
  const { storedValue, setValue } = useLocalStorage<TScopeSubTabKey>(storageKey, DEFAULT_SCOPE_SUB_TAB);
  return {
    activeSubTab: normalize(storedValue),
    setSubTab: setValue,
  };
};

/**
 * 两个页面的页签图标一致；label 由调用方传 t() 结果。
 * 需求用 BookOpenText，与项目左侧导航的「需求」项同图标，避免同一概念两个符号。
 */
export const SCOPE_SUB_TAB_ICONS = {
  "work-items": LayoutList,
  requirements: BookOpenText,
} as const;
