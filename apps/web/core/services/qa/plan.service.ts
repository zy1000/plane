// plane imports
import { API_BASE_URL } from "@plane/constants";
import { FileUploadService, generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import type { TFileSignedURLResponse } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TPlanCaseNestedCase = {
  id: string;
  code?: string;
  name: string;
  repository?: string | null;
  repository_name?: string | null;
  module?: string | null;
  type?: number | null;
  priority?: number | null;
  updated_at?: string | null;
  assignee?: string | null;
};

export type TPlanCaseItem = {
  id: string;
  plan?: string;
  case?: TPlanCaseNestedCase | null;
  /** 执行人（单选）：只有执行人本人可提交执行结果，后一次执行覆盖前一次 */
  assignee?: string | null;
  result?: string;
  /** 复核状态：未复核 / 复核中 / 通过 / 不通过，由计划的复核人对执行结果复核 */
  review_status?: string;
  created_at?: string;
  updated_at?: string;
};

export type TPlanCaseQueryParams = {
  page?: number;
  page_size?: number;
  plan_id?: string;
  search?: string;
  ordering?: "case__code" | "-case__code" | "case__updated_at" | "-case__updated_at" | string;
  result?: string;
  result__in?: string;
  review_status?: string;
  review_status__in?: string;
  case__type?: string;
  case__type__in?: string;
  case__priority?: string;
  case__priority__in?: string;
  assignee_id?: string;
  assignee_id__in?: string;
  assignee_isnull?: boolean;
  case__repository_id__in?: string;
  case__module_id__in?: string;
  "case__repository_id"?: string;
  "case__module_id"?: string;
};

export type TPlanCaseListResponse = {
  count: number;
  data: TPlanCaseItem[];
};

export type TPlanModulePathItem = { id: string; name: string };

export type TPlanListItem = {
  id: string;
  name: string;
  begin_time?: string | null;
  end_time?: string | null;
  state?: string | null;
  module?: string | null;
  /** 计划所属模块的祖先链（根 → 计划所属模块），无模块时为空数组 */
  module_path?: TPlanModulePathItem[];
  /** 复核人（可多人）：只有他们可复核该计划下各条用例的执行结果 */
  reviewers?: string[];
  /** 多人复核的通过规则；单人时无意义，后端存 all */
  review_approval_type?: TPlanReviewApprovalType;
  /** 仅 n_of_m 规则时有值 */
  review_required_count?: number | null;
};

/** 计划状态（TestPlan.State） */
export type TPlanState = "未开始" | "进行中" | "已完成";

/** 计划用例执行结果各状态的计数（PlanCase.Result） */
export type TPlanPassRate = Record<"成功" | "失败" | "阻塞" | "未执行" | "无效", number>;

/** 计划列表页一行（`GET /test/plane/`，TestPlanListSerializer + build_plan_stats_map） */
export type TPlanListRow = {
  id: string;
  name: string;
  description?: string | null;
  begin_time?: string | null;
  end_time?: string | null;
  state?: TPlanState | string | null;
  module?: string | null;
  module_id?: string | null;
  cycle?: string | null;
  /** 通过阈值 0-100 */
  threshold?: number | null;
  case_count?: number;
  pass_rate?: Partial<TPlanPassRate> | null;
  /** 按阈值折算："通过" / "不通过" / "-" */
  result?: string | null;
  /** 计划下所有用例的执行人（去重） */
  assignee_ids?: string[];
  reviewers?: string[];
  review_approval_type?: TPlanReviewApprovalType;
  review_required_count?: number | null;
};

/** 计划复核的通过规则：全部通过 / 至少 N 人通过 */
export type TPlanReviewApprovalType = "all" | "n_of_m";

/** 规则说明文案；单人或未设复核人时不展示规则 */
export const getPlanReviewRuleLabel = (plan?: {
  reviewers?: string[];
  review_approval_type?: TPlanReviewApprovalType;
  review_required_count?: number | null;
}): string => {
  const count = plan?.reviewers?.length ?? 0;
  if (count <= 1) return "";
  if (plan?.review_approval_type === "n_of_m") return `至少 ${plan.review_required_count ?? count} 人通过`;
  return "全部通过";
};

export type TPlanAssigneeTreeNode = {
  id: string;
  name: string;
  kind: "assignee" | "unassigned";
  count: number;
};

export type TPlanAssigneeTree = {
  id: string;
  name: string;
  kind: "root";
  count: number;
  children: TPlanAssigneeTreeNode[];
};

/** 计划用例按枚举字段分组的维度：类型 / 优先级 / 执行结果 / 复核状态 */
export type TPlanCaseEnumGroupBy = "type" | "priority" | "result" | "review_status";

type TPlanCaseEnumGroupQueryParam = "case__type" | "case__priority" | "result" | "review_status";

/** 枚举分组维度 → 左树选中值对应的列表精确过滤参数 */
export const PLAN_CASE_ENUM_GROUP_QUERY_PARAM: Record<TPlanCaseEnumGroupBy, TPlanCaseEnumGroupQueryParam> = {
  type: "case__type",
  priority: "case__priority",
  result: "result",
  review_status: "review_status",
};

export const isPlanCaseEnumGroupBy = (groupBy: string): groupBy is TPlanCaseEnumGroupBy =>
  Object.prototype.hasOwnProperty.call(PLAN_CASE_ENUM_GROUP_QUERY_PARAM, groupBy);

export type TPlanGroupTreeNode = {
  /** 枚举值（类型/优先级为数字字符串，执行结果为中文） */
  id: string;
  name: string;
  kind: TPlanCaseEnumGroupBy;
  count: number;
};

export type TPlanGroupTree = {
  id: string;
  name: string;
  kind: "root";
  count: number;
  children: TPlanGroupTreeNode[];
};

export type TPlanCaseCopyPayload = {
  source_plan_id: string;
  target_plan_id: string;
  plan_case_ids: string[];
  /** 缺省沿用源执行人；null 清空；传 id 则统一覆盖 */
  assignee?: string | null;
};

export type TPlanCaseCopyResponse = {
  copied: number;
  skipped: number;
};

/** 计划用例复核结论 */
export type TPlanCaseReviewResult = "通过" | "不通过";

export type TPlanCaseReviewPayload = {
  plan_id: string;
  plan_case_ids: string[];
  result: TPlanCaseReviewResult;
  /** 复核不通过时必填 */
  reason?: string;
};

export type TPlanCaseReviewResponse = {
  updated_ids: string[];
  /** 未执行、无法复核而被跳过的计划用例 */
  skipped_ids: string[];
  /** 计划用例 id -> 按通过规则折算后的复核状态；多人复核时本次投票未必就是最终状态 */
  statuses: Record<string, string>;
};

export type TPlanCaseReviewRecord = {
  id: string;
  plan_case: string;
  /** 本次复核针对的那一次执行记录；历史数据可能为空 */
  plan_case_record?: string | null;
  result: string;
  reason?: string | null;
  reviewer?: string | null;
  reviewer_detail?: { id: string; display_name?: string; avatar_url?: string | null } | null;
  /** 非空表示该条结论已因重新执行而作废，只留档不计票 */
  invalidated_at?: string | null;
  created_at?: string;
};

export class PlanService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getPlanList(workspaceSlug: string, queries?: any): Promise<TPlanListItem[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/list/`, { params: queries })
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanModulesCount(workspaceSlug: string, projectId: string): Promise<any> {
    const params = { project_id: projectId };
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/module/count/`, { params })
      .then((response) => response?.data ?? {})
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlans(workspaceSlug: string, projectId: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/plane/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPlan(workspaceSlug: string, projectId: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/plane/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePlan(workspaceSlug: string, projectId: string, data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/plane/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addPlanCases(
    workspaceSlug: string,
    projectId: string,
    data: { plan_id: string; case_ids: string[]; assignee?: string | null }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/add-cases/`, data, { params: { project_id: projectId } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async copyPlanCases(
    workspaceSlug: string,
    projectId: string,
    data: TPlanCaseCopyPayload
  ): Promise<TPlanCaseCopyResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/copy-cases/`, data, {
      params: { project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async associateReleases(
    workspaceSlug: string,
    projectId: string,
    data: { plan_id: string; release_ids: string[] }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/associate-releases/`, data, {
      params: { project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanModules(workspaceSlug: string, projectId: string, queries?: any): Promise<any[]> {
    const params = { project_id: projectId, ...queries };
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/module/`, { params })
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPlanModule(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/module/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePlanModule(workspaceSlug: string, moduleIds: Array<string>): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/plan/module/`, {
      ids: moduleIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePlanModule(workspaceSlug: string, moduleId: string, data: any): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/test/plan/module/${moduleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePlan(workspaceSlug: string, projectId: string, planIds: Array<string>): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/plane/`, {
      ids: planIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanAssigneeTree(workspaceSlug: string, queries: { plan_id: string }): Promise<TPlanAssigneeTree> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/assignee-tree/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanGroupTree(
    workspaceSlug: string,
    queries: { plan_id: string; group_by: TPlanCaseEnumGroupBy }
  ): Promise<TPlanGroupTree> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/group-tree/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanCases(workspaceSlug: string, queries?: TPlanCaseQueryParams): Promise<TPlanCaseListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plane/case/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cancelPlanCase(workspaceSlug: string, projectId: string, planCaseId: string | string[]): Promise<any> {
    const data = { id: planCaseId };
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/cancel/`, data, { params: { project_id: projectId } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async getPlanCaseList(
    workspaceSlug: string,
    plan_id: string,
    queries?: {
      all?: boolean;
      page?: number;
      page_size?: number;
      repository_id?: string | null;
      module_id?: string | null;
      assignee_id?: string | null;
      assignee_isnull?: boolean;
      result?: string;
      review_status?: string;
      case__type?: string;
      case__priority?: string;
      name__icontains?: string;
    }
  ): Promise<{
    data: Array<{
      id: string;
      case: string;
      name: string;
      priority: number;
      assignee: string | null;
      result: string;
      review_status?: string;
      created_by: string | null;
    }>;
    count: number;
  }> {
    const params = { plan_id, ...queries } as any;
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/case-list/`, { params })
      .then((response) => ({ data: response?.data.data ?? [], count: Number(response?.data.count || 0) }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePlanCaseAssignee(
    workspaceSlug: string,
    projectId: string,
    data: { plan_case_id: string; assignee: string | null }
  ): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/test/plan/case-assignee/`, data, {
      params: { project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 复核人对一批计划用例的执行结果提交复核结论 */
  async reviewPlanCases(
    workspaceSlug: string,
    projectId: string,
    data: TPlanCaseReviewPayload
  ): Promise<TPlanCaseReviewResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/review/`, data, {
      params: { project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 某条计划用例的复核记录（时间倒序） */
  async getPlanCaseReviewRecords(
    workspaceSlug: string,
    queries: { plan_case_id: string }
  ): Promise<TPlanCaseReviewRecord[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/review-records/`, { params: queries })
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async caseExecute(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/execute/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanCaseDetail(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/case-detail/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addCaseBug(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/add-bug/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanCaseRecord(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/records/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getExecutionFiles(workspaceSlug: string, recordId: string): Promise<any[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/execution-file/list/`, {
      params: { record_id: recordId },
    })
      .then((response) => response?.data?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getExecutionFileCount(workspaceSlug: string, recordId: string): Promise<number> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/execution-file/list/`, {
      params: { record_id: recordId, page_size: 1 },
    })
      .then((response) => Number(response?.data?.count ?? 0))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadExecutionFile(workspaceSlug: string, recordId: string, file: File): Promise<any> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    const presignResponse = await this.post(
      `/api/workspaces/${workspaceSlug}/test/execution-file/upload/`,
      {
        ...fileMetaData,
        record_id: recordId,
      }
    )
      .then((response) => response?.data as { upload_data: TFileSignedURLResponse["upload_data"]; asset_id: string })
      .catch((error) => {
        throw error?.response?.data;
      });

    if (!presignResponse?.upload_data || !presignResponse?.asset_id) {
      throw new Error("Failed to obtain presigned upload data");
    }

    const fileUploadPayload = generateFileUploadPayload(
      { upload_data: presignResponse.upload_data, asset_id: presignResponse.asset_id, asset_url: "" } as TFileSignedURLResponse,
      file
    );

    const fileUploader = new FileUploadService();
    await fileUploader.uploadFile(presignResponse.upload_data.url, fileUploadPayload);

    await this.patch(
      `/api/workspaces/${workspaceSlug}/test/execution-file/${presignResponse.asset_id}/uploaded/`,
      { attributes: fileMetaData }
    ).catch((error) => {
      throw error?.response?.data;
    });

    return { asset_id: presignResponse.asset_id };
  }

  async deleteExecutionFile(workspaceSlug: string, recordId: string, fileId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/execution-file/delete/`, {
      record_id: recordId,
      asset_id: fileId,
    })
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async downloadExecutionFile(workspaceSlug: string, fileId: string): Promise<string> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/execution-file/download/`, {
      params: { asset_id: fileId },
    })
      .then((response) => response?.data?.download_url as string)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

}
