import type { EViewAccess, IProjectView, TViewScope } from "@plane/types";

/** 一个视图记住的内容；需求页把列显隐塞进 display_properties */
export type TViewSnapshot = {
  rich_filters: IProjectView["rich_filters"];
  display_filters?: IProjectView["display_filters"];
  display_properties?: IProjectView["display_properties"];
};

export type TViewSnapshotKey = keyof TViewSnapshot;

export type TSaveViewInput = {
  name: string;
  access: EViewAccess;
  isDefault: boolean;
};

export type TViewSummaryRow = {
  /** 决定行首图标 */
  kind: "filters" | "layout" | "properties";
  label: string;
  text: string;
  /** 筛选行：用到的属性名 */
  chips?: string[];
};

export type TViewTabsParams = {
  workspaceSlug: string;
  projectId: string;
  scope: TViewScope;
  /** 页面当前的筛选 / 显示状态，用来判断「有没有未保存的更改」和保存 */
  current: TViewSnapshot | undefined;
  /** 把视图应用到页面；null = 回到「全部」（清空筛选，显示设置不动） */
  apply: (snapshot: TViewSnapshot | null) => void;
  /** 参与「是否已修改」比较的部分，默认三部分都比 */
  compareKeys?: TViewSnapshotKey[];
  /** 进页时是否把记住的页签应用到页面（筛选不持久化的页面要开） */
  applyOnMount?: boolean;
  /** 页面是否已经可以接受 apply（筛选实例已就绪） */
  ready?: boolean;
};
