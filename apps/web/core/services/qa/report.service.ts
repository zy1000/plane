// services
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

export type TReportType = "计划报告" | "对外报告";

export type TReportPassRate = {
  成功?: number;
  失败?: number;
  阻塞?: number;
  未执行?: number;
  无效?: number;
  [key: string]: number | undefined;
};

export type TReportModule = {
  id: string;
  name: string;
  project: string | null;
  parent: string | null;
  /** 树接口给的是直属数，页面用 count 接口的子树数覆盖 */
  count?: number;
  children?: TReportModule[];
};

/** `GET .../test/report/module/count/`：total 是项目报告总数，其余 key 是模块 id → 子树累计数 */
export type TReportModuleCounts = { total: number } & Record<string, number>;

export type TReportListItem = {
  id: string;
  name: string;
  report_type: TReportType;
  project: string | null;
  module: string | null;
  module_name: string | null;
  plan_names: string[];
  pass_rate: TReportPassRate;
  case_count: number;
  plan_count: number;
  overall_pass_rate: number;
  completion_rate: number;
  created_by_detail?: { id: string; display_name: string; avatar?: string; is_bot?: boolean } | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type TReportPlanBrief = { id: string; name: string; threshold?: number };

export type TReportDetail = {
  id: string;
  name: string;
  report_type: TReportType;
  summary_html: string;
  summary_json: unknown;
  project: string | null;
  module: string | null;
  module_name: string | null;
  plans: TReportPlanBrief[];
  created_by_detail?: { id: string; display_name: string; avatar?: string; is_bot?: boolean } | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

/** 详情页「关联测试计划」每个计划自己的统计 */
export type TReportPlanStat = {
  id: string;
  name: string;
  state: string;
  threshold: number | null;
  begin_time: string | null;
  end_time: string | null;
  case_count: number;
  success_count: number;
  assignee_count: number;
  pass_rate: TReportPassRate;
  overall_pass_rate: number;
  completion_rate: number;
};

export type TReportAnalysis = {
  report_id: string;
  plan_count: number;
  case_count: number;
  success_count: number;
  pass_rate: TReportPassRate;
  overall_pass_rate: number;
  completion_rate: number;
  plans: TReportPlanStat[];
  not_started_plan_count: number;
  /** 同一用例进多个计划只算一次 */
  distinct_case_count: number;
  /** 报告内用例关联的缺陷（去重） */
  defect_count: number;
  high_priority_defect_count: number;
};

export type TReportCaseRow = {
  id: string;
  case_id: string | null;
  code: string;
  name: string;
  priority: number | null;
  result: string;
  module: string;
  assignee_id: string | null;
  assignee_name: string | null;
  defect_count: number;
  plan_name: string;
  created_at: string;
  updated_at: string;
};

export type TReportListResponse = { data: TReportListItem[]; count: number };
export type TReportCaseListResponse = { data: TReportCaseRow[]; count: number };

export type TReportCreatePayload = {
  name: string;
  report_type?: TReportType;
  summary_html?: string;
  summary_json?: unknown;
  project?: string;
  plans?: string[];
  /** 所属模块，可选；编辑时显式传 null 才能清空 */
  module?: string | null;
};

export type TReportUpdatePayload = Partial<TReportCreatePayload> & { id: string };

export class ReportService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private moduleUrl(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/test/report/module/`;
  }

  async getReportModules(workspaceSlug: string, projectId: string): Promise<TReportModule[]> {
    return this.get(this.moduleUrl(workspaceSlug, projectId))
      .then((response) => (Array.isArray(response?.data) ? response.data : []))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReportModulesCount(workspaceSlug: string, projectId: string): Promise<TReportModuleCounts> {
    return this.get(`${this.moduleUrl(workspaceSlug, projectId)}count/`)
      .then((response) => response?.data ?? { total: 0 })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createReportModule(
    workspaceSlug: string,
    projectId: string,
    data: { name: string; parent?: string | null }
  ): Promise<TReportModule> {
    return this.post(this.moduleUrl(workspaceSlug, projectId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateReportModule(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    data: { name?: string; parent?: string | null }
  ): Promise<TReportModule> {
    return this.patch(`${this.moduleUrl(workspaceSlug, projectId)}${moduleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteReportModule(workspaceSlug: string, projectId: string, ids: string[]): Promise<void> {
    return this.delete(this.moduleUrl(workspaceSlug, projectId), { ids })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReports(workspaceSlug: string, projectId: string, queries?: any): Promise<TReportListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/report/`, {
      params: queries,
    })
      .then((response) => ({ data: response?.data?.data ?? [], count: Number(response?.data?.count || 0) }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReportDetail(workspaceSlug: string, projectId: string, reportId: string): Promise<TReportDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/report/`, {
      params: { id: reportId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createReport(workspaceSlug: string, projectId: string, data: TReportCreatePayload): Promise<TReportDetail> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/report/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateReport(workspaceSlug: string, projectId: string, data: TReportUpdatePayload): Promise<TReportDetail> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/report/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteReport(workspaceSlug: string, projectId: string, reportIds: string[]): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/report/`, {
      ids: reportIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReportAnalysis(workspaceSlug: string, projectId: string, reportId: string): Promise<TReportAnalysis> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/report/analysis/`, {
      params: { report_id: reportId, project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReportCaseList(
    workspaceSlug: string,
    projectId: string,
    queries: {
      report_id: string;
      page?: number;
      page_size?: number;
      name__icontains?: string;
      result?: string;
      all?: string;
    }
  ): Promise<TReportCaseListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/report/case-list/`, {
      params: { project_id: projectId, ...queries },
    })
      .then((response) => ({ data: response?.data?.data ?? [], count: Number(response?.data?.count || 0) }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
