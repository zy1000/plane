export interface IOverviewWorkItemCount {
  count: number;
}

export interface IOverviewMemberStat {
  member_id: string;
  display_name: string;
  avatar_url: string;
  work_item_count: number;
  defect_count: number;
  /** 未完成（状态组不在 completed / cancelled）的工作项数，含缺陷 */
  open_count?: number;
  /** 未完成且目标日期已过的工作项数 */
  overdue_count?: number;
  timesheet_hours?: number;
}

/** 近 N 个月「新建 vs 完成」节奏趋势的单点 */
export interface IOverviewTrendPoint {
  /** YYYY-MM */
  month: string;
  created: number;
  completed: number;
}

/** 近 N 个月缺陷「新建 vs 解决」的单点 */
export interface IOverviewDefectTrendPoint {
  /** YYYY-MM */
  month: string;
  created: number;
  resolved: number;
}

export type TOverviewDefectPriority = "urgent" | "high" | "medium" | "low" | "none";

export interface IProjectOverviewAnalytics {
  total_timesheet_hours?: number;
  total_work_items: IOverviewWorkItemCount;
  started_work_items: IOverviewWorkItemCount;
  backlog_work_items: IOverviewWorkItemCount;
  un_started_work_items: IOverviewWorkItemCount;
  completed_work_items: IOverviewWorkItemCount;
  cancelled_work_items: IOverviewWorkItemCount;
  member_stats?: IOverviewMemberStat[];
  /** 逾期未完成工作项数 */
  overdue_work_items?: number;
  /** 未来 7 天到期且未完成的工作项数 */
  due_soon_work_items?: number;
  /** 缺陷总数 */
  total_defects?: number;
  /** 待处理缺陷数 */
  pending_defects?: number;
  /** 待处理缺陷按优先级分桶 */
  pending_defects_by_priority?: Record<TOverviewDefectPriority, number>;
  /** 近 6 个月缺陷新建 vs 解决 */
  defect_trend?: IOverviewDefectTrendPoint[];
  /** 近 6 个月新建 vs 完成趋势 */
  created_completed_trend?: IOverviewTrendPoint[];
}
