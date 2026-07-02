import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TStatisticOwner = {
  id: string;
  display_name: string;
};

export type TProjectStatisticCycle = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "CURRENT";
  work_item_count: number;
  owner: TStatisticOwner | null;
};

export type TProjectStatisticRelease = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  work_item_count: number;
  owner: TStatisticOwner | null;
};

export type TProjectStatisticTestPlan = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  case_count: number;
  owner: TStatisticOwner | null;
};

export type TProjectStatisticCaseReview = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  case_count: number;
  owner: TStatisticOwner | null;
};

export type TProjectOverviewWorkItemMetric = "completed" | "in_progress" | "overdue" | "due_soon";

export type TProjectOverviewWorkItem = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project_identifier: string;
  state: {
    id: string;
    name: string;
    group: string;
    color: string;
  } | null;
  priority: string;
  target_date: string | null;
  completed_at: string | null;
  type: {
    id: string;
    name: string;
  } | null;
  assignees: Array<TStatisticOwner & { avatar_url: string }>;
};

export type TProjectStatisticResponse = {
  counts: {
    in_progress_requirements: number;
    total_requirements: number;
    pending_defects: number;
    total_defects: number;
    total_cases: number;
    total_timesheet_hours: number;
  };
  cycles: {
    count: number;
    data: TProjectStatisticCycle[];
  };
  releases: {
    count: number;
    data: TProjectStatisticRelease[];
  };
  test_plans: {
    count: number;
    data: TProjectStatisticTestPlan[];
  };
  case_reviews: {
    count: number;
    data: TProjectStatisticCaseReview[];
  };
  requirement_daily_status: Array<{
    date: string;
    completed: number;
    incomplete: number;
  }>;
  defect_daily_created: Array<{
    date: string;
    created: number;
  }>;
  work_item_stats: Array<{
    type_id: string;
    name: string;
    logo_props: any;
    unstarted: number;
    started: number;
    completed: number;
    cancelled: number;
    total: number;
  }>;
  overdue_by_assignee: {
    total: number;
    data: Array<{
      assignee_id: string | null;
      display_name: string;
      avatar_url: string;
      count: number;
    }>;
  };
  member_timesheet_hours: Array<{
    member_id: string;
    display_name: string;
    avatar_url: string;
    hours: number;
  }>;
  range: {
    start_date: string;
    end_date: string;
  };
};

export type TProjectOverviewStatisticResponse = Pick<
  TProjectStatisticResponse,
  "cycles" | "releases" | "test_plans" | "case_reviews" | "work_item_stats"
>;

export type TProjectStatisticParams = {
  page?: number;
  release_page?: number;
  plan_page?: number;
  review_page?: number;
  page_size?: number;
  start_date?: string;
  end_date?: string;
  include_all_statuses?: boolean;
};

export type TProjectOverviewWorkItemParams = {
  metric: TProjectOverviewWorkItemMetric;
  page?: number;
  page_size?: number;
};

export type TProjectOverviewWorkItemResponse = {
  count: number;
  data: TProjectOverviewWorkItem[];
};

export class ProjectStatisticService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getStatistic(
    workspaceSlug: string,
    projectId: string,
    params?: TProjectStatisticParams
  ): Promise<TProjectStatisticResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/project/statistic/`, {
      params: { ...params, project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getOverviewStatistic(
    workspaceSlug: string,
    projectId: string,
    params?: TProjectStatisticParams
  ): Promise<TProjectOverviewStatisticResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/project/overview-statistic/`, {
      params: { ...params, project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getOverviewWorkItems(
    workspaceSlug: string,
    projectId: string,
    params: TProjectOverviewWorkItemParams
  ): Promise<TProjectOverviewWorkItemResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/project/overview-work-items/`, {
      params: { ...params, project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
