export interface IOverviewWorkItemCount {
  count: number;
}

export interface IOverviewMemberStat {
  member_id: string;
  display_name: string;
  avatar_url: string;
  work_item_count: number;
  defect_count: number;
}

export interface IProjectOverviewAnalytics {
  total_timesheet_hours?: number;
  total_work_items: IOverviewWorkItemCount;
  started_work_items: IOverviewWorkItemCount;
  backlog_work_items: IOverviewWorkItemCount;
  un_started_work_items: IOverviewWorkItemCount;
  completed_work_items: IOverviewWorkItemCount;
  cancelled_work_items: IOverviewWorkItemCount;
  member_stats?: IOverviewMemberStat[];
}
