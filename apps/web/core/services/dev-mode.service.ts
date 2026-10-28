import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateDevModeIssueTypePayload,
  TCreateDevModePayload,
  TCreateDevModeStagePayload,
  TDevMode,
  TDevModeDetail,
  TDevModeIssueType,
  TDevModeStage,
  TDevModeStageBulkCreateResult,
  TDevModeStageTemplateNode,
  TSchemeView,
  TUpdateDevModePayload,
  TUpdateDevModeStagePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/**
 * 研发模式：工作区级。列表一次返回全部（通常三五条），阶段挂在模式下。
 *
 * 读接口接受 view 或 manage 任一 key，写只认 manage（后端 DEV_MODE_READ_KEYS）。
 */
export class DevModeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/dev-modes/`;
  }

  async list(workspaceSlug: string): Promise<TDevMode[]> {
    return this.get(this.base(workspaceSlug))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 详情带 stages 列表，每个阶段带 template_count */
  async retrieve(workspaceSlug: string, devModeId: string): Promise<TDevModeDetail> {
    return this.get(`${this.base(workspaceSlug)}${devModeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TCreateDevModePayload): Promise<TDevMode> {
    return this.post(this.base(workspaceSlug), payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, devModeId: string, payload: TUpdateDevModePayload): Promise<TDevMode> {
    return this.patch(`${this.base(workspaceSlug)}${devModeId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteDevMode(workspaceSlug: string, devModeId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug)}${devModeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---- 阶段 ----------------------------------------------------------------

  async listStages(workspaceSlug: string, devModeId: string): Promise<TDevModeStage[]> {
    return this.get(`${this.base(workspaceSlug)}${devModeId}/stages/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 新建阶段：后端默认勾满该阶段类型下的全部活跃节点 */
  async createStage(
    workspaceSlug: string,
    devModeId: string,
    payload: TCreateDevModeStagePayload
  ): Promise<TDevModeStage> {
    return this.post(`${this.base(workspaceSlug)}${devModeId}/stages/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量新建：一次多选阶段类型，各生成一行，名称取类型名，已有同名的跳过 */
  async bulkCreateStages(
    workspaceSlug: string,
    devModeId: string,
    stageTypeIds: string[]
  ): Promise<TDevModeStageBulkCreateResult> {
    return this.post(`${this.base(workspaceSlug)}${devModeId}/stages/bulk-create/`, {
      stage_type_ids: stageTypeIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateStage(
    workspaceSlug: string,
    devModeId: string,
    stageId: string,
    payload: TUpdateDevModeStagePayload
  ): Promise<TDevModeStage> {
    return this.patch(`${this.base(workspaceSlug)}${devModeId}/stages/${stageId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteStage(workspaceSlug: string, devModeId: string, stageId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug)}${devModeId}/stages/${stageId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 勾选批量删除：有任一阶段被项目引用就整批拒绝 */
  async bulkDeleteStages(workspaceSlug: string, devModeId: string, stageIds: string[]): Promise<void> {
    return this.post(`${this.base(workspaceSlug)}${devModeId}/stages/bulk-destroy/`, { stage_ids: stageIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整段重排：传该模式内完整的有序 id 列表 */
  async reorderStages(workspaceSlug: string, devModeId: string, stageIds: string[]): Promise<void> {
    return this.post(`${this.base(workspaceSlug)}${devModeId}/stages/reorder/`, { stage_ids: stageIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---- 关联的工作项类型（类型本身在工作区类型库里） ----------------------------

  /** 本模式关联的类型库类型，按 sort_order，带状态 / 字段 / 工作流 / 在用工作项数 */
  async listIssueTypes(workspaceSlug: string, devModeId: string): Promise<TDevModeIssueType[]> {
    return this.get(`${this.base(workspaceSlug)}${devModeId}/issue-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 整体替换关联与排序：按顺序传类型 id。
   * 要取消的类型还有工作项在用时 409（code: DEV_MODE_TYPE_IN_USE，blocked 列出各类型的在用数）
   */
  async setIssueTypes(workspaceSlug: string, devModeId: string, issueTypeIds: string[]): Promise<TDevModeIssueType[]> {
    return this.put(`${this.base(workspaceSlug)}${devModeId}/issue-types/`, { issue_type_ids: issueTypeIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 在类型库新建类型并追加关联到本模式，返回新的一行 */
  async createIssueType(
    workspaceSlug: string,
    devModeId: string,
    payload: TCreateDevModeIssueTypePayload
  ): Promise<TDevModeIssueType> {
    return this.post(`${this.base(workspaceSlug)}${devModeId}/issue-types/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---- 研发模式视图（跟随本模式的项目共用的页内视图） ------------------------

  /** 本模式的研发模式视图（全部页面），按排序 */
  async listViews(workspaceSlug: string, devModeId: string): Promise<TSchemeView[]> {
    return this.get(`${this.base(workspaceSlug)}${devModeId}/views/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async renameView(workspaceSlug: string, devModeId: string, viewId: string, name: string): Promise<void> {
    return this.patch(`${this.base(workspaceSlug)}${devModeId}/views/${viewId}/`, { name })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteView(workspaceSlug: string, devModeId: string, viewId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug)}${devModeId}/views/${viewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 按给出的顺序重排（同一页面内的视图） */
  async reorderViews(workspaceSlug: string, devModeId: string, viewIds: string[]): Promise<void> {
    return this.post(`${this.base(workspaceSlug)}${devModeId}/views/reorder/`, { view_ids: viewIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---- 阶段下的评审勾选 ------------------------------------------------------

  /** 该阶段类型下的评审树（评审 → 活动两层）加 selected */
  async listStageTemplates(
    workspaceSlug: string,
    devModeId: string,
    stageId: string
  ): Promise<TDevModeStageTemplateNode[]> {
    return this.get(`${this.base(workspaceSlug)}${devModeId}/stages/${stageId}/templates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整体替换勾选集合 */
  async setStageTemplates(
    workspaceSlug: string,
    devModeId: string,
    stageId: string,
    templateIds: string[]
  ): Promise<{ selected: number }> {
    return this.put(`${this.base(workspaceSlug)}${devModeId}/stages/${stageId}/templates/`, {
      template_ids: templateIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
