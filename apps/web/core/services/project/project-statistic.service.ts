import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TProjectStatisticCycle = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "CURRENT";
  work_item_count: number;
};

export type TProjectStatisticRelease = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  work_item_count: number;
};

export type TProjectStatisticTestPlan = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  case_count: number;
};

export type TProjectStatisticCaseReview = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  case_count: number;
};

export type TProjectStatisticResponse = {
  counts: {
    in_progress_requirements: number;
    total_requirements: number;
    pending_defects: number;
    total_defects: number;
    total_cases: number;
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
    total: number;
  }>;
  range: {
    start_date: string;
    end_date: string;
  };
};

export class ProjectStatisticService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getStatistic(
    workspaceSlug: string,
    projectId: string,
    params?: {
      page?: number;
      release_page?: number;
      plan_page?: number;
      review_page?: number;
      page_size?: number;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<TProjectStatisticResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/project/statistic/`, {
      params: { ...params, project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
