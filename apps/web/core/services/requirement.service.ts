import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateRequirementLibraryPayload,
  TCreateRequirementModulePayload,
  TLinkableRequirementsResponse,
  TLinkableTestCasesResponse,
  TProductProject,
  TProjectRequirement,
  TProjectRequirementModulesResponse,
  TProjectRequirementsResponse,
  TRequirement,
  TRequirementApprovalAction,
  TRequirementApprovalInboxResponse,
  TRequirementBaseline,
  TRequirementBaselineCompareResponse,
  TRequirementBaselineCreated,
  TRequirementBaselineEntriesResponse,
  TRequirementBaselinePayload,
  TRequirementBaselinePreview,
  TRequirementBaselinesResponse,
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementBuiltinValues,
  TRequirementChangeItemsResponse,
  TRequirementChangeRequest,
  TRequirementChangeRequestDetail,
  TRequirementChangeRequestsResponse,
  TRequirementChangeStatus,
  TRequirementChangeType,
  TRequirementConfiguration,
  TRequirementConfigurationPayload,
  TRequirementContainerLinkPayload,
  TRequirementData,
  TRequirementExcelImportResponse,
  TRequirementExcelScope,
  TRequirementExcelValidation,
  TRequirementFilter,
  TRequirementImportableLibrary,
  TRequirementImportPayload,
  TRequirementImportResponse,
  TRequirementIssue,
  TRequirementItemStatus,
  TRequirementLibrary,
  TRequirementLibraryConfiguration,
  TRequirementModule,
  TRequirementModuleScope,
  TRequirementModuleTreeResponse,
  TRequirementsResponse,
  TRequirementSubmitReviewPayload,
  TRequirementTestCase,
  TRequirementTrailResponse,
  TRequirementVersionsResponse,
  TSetRequirementModulePayload,
  TUpdateRequirementLibraryPayload,
  TUpdateRequirementModulePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/**
 * 从 Content-Disposition 解析下载文件名，支持 RFC5987 的 `filename*=UTF-8''...`。
 * 与 services/issue/issue.service.ts 里那份同形 —— 后端也用的同一个响应头工具。
 */
function parseAttachmentFilename(disposition?: string): string | null {
  if (!disposition) return null;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

/**
 * responseType 是 blob 时，出错的响应体也会被当成 blob 收下来。不解回文本的话，调用方
 * 拿到的是一个没法读的 Blob，错误提示会变成一句「[object Blob]」。
 */
async function unwrapBlobError(error: any) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text());
    } catch {
      return { error: "导出失败，请稍后重试。" };
    }
  }
  return data;
}

/** 需求接口的作用域。product = 归属（可写），project = 引用（只读） */
export type TRequirementScope = { kind: "product" | "project"; id: string };

export class RequirementService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * 作用域前缀。产品是需求的**归属**，项目只是**引用** —— 两个作用域下的能力完全
   * 不同（项目侧没有任何内容写入口），所以不要拿它当通用的「换个 id 就行」开关。
   */
  private scopeRoot(workspaceSlug: string, scope: TRequirementScope) {
    const segment = scope.kind === "product" ? "products" : "projects";
    return `/api/workspaces/${workspaceSlug}/${segment}/${scope.id}`;
  }

  /** 产品需求条目的作用域前缀 */
  private requirementsRoot(workspaceSlug: string, productId: string) {
    return `${this.scopeRoot(workspaceSlug, { kind: "product", id: productId })}/requirements`;
  }

  /** 项目引用的需求 */
  private projectRequirementsRoot(workspaceSlug: string, projectId: string) {
    return `${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/requirements`;
  }

  /** 迭代关联的需求 */
  private cycleRequirementsRoot(workspaceSlug: string, projectId: string, cycleId: string) {
    return `${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/cycles/${cycleId}/requirements`;
  }

  /** 发布单关联的需求 */
  private releaseRequirementsRoot(workspaceSlug: string, projectId: string, releaseId: string) {
    return `${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/releases/${releaseId}/requirements`;
  }

  /** 需求关联的工作项。方向与容器关联相反：需求是主语，工作项是宾语 */
  private requirementIssuesRoot(workspaceSlug: string, projectId: string, requirementId: string) {
    return `${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/requirements/${requirementId}/issues`;
  }

  /** 工作项关联的需求。同一张 RequirementIssue 表的另一个方向，服务端复用容器关联基类 */
  private issueRequirementsRoot(workspaceSlug: string, projectId: string, issueId: string) {
    return `${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/issues/${issueId}/requirements`;
  }

  /**
   * 需求关联的测试用例。**产品作用域**，与工作项关联（项目作用域）不同 —— 用例的
   * project 来自 repository 且可空（共享用例库），一条需求的关联用例横跨它进过的所有
   * 项目，按单个项目切开表达不出来。用例侧的反向入口在 services/qa/case.service.ts。
   */
  private requirementTestCasesRoot(workspaceSlug: string, productId: string, requirementId: string) {
    return `${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/test-cases`;
  }

  /** 变更单的作用域前缀。**始终是产品** —— 项目只是提单入口，审批权威不下放 */
  private changeRequestsRoot(workspaceSlug: string, productId: string) {
    return `${this.scopeRoot(workspaceSlug, { kind: "product", id: productId })}/requirement-change-requests`;
  }

  /** 基线快照的作用域前缀 */
  private baselinesRoot(workspaceSlug: string, productId: string) {
    return `${this.scopeRoot(workspaceSlug, { kind: "product", id: productId })}/requirement-baselines`;
  }

  /**
   * Excel 导入 / 导出的作用域前缀。产品需求与标准库条目共用同一组 handler
   * （后端挂在 BaseRequirementRowViewSet 上），这里只是把两条路径收敛成一个分派。
   */
  private excelRoot(workspaceSlug: string, scope: TRequirementExcelScope, entityId: string) {
    return scope === "product"
      ? `${this.requirementsRoot(workspaceSlug, entityId)}/excel`
      : `/api/workspaces/${workspaceSlug}/requirement-libraries/${entityId}/items/excel`;
  }

  /* --- 需求 Excel 导入 / 导出 ------------------------------------------- */

  /**
   * 导出（或下载空模板）。
   *
   * 返回 blob 而不是让浏览器直接跳转：接口带鉴权头，`window.open` 拿不到；而且出错时
   * 后端返回的是 JSON，需要在这里解回来（见下面的 catch）。
   */
  async exportRequirementsExcel(
    workspaceSlug: string,
    scope: TRequirementExcelScope,
    entityId: string,
    params?: {
      search?: string;
      filters?: TRequirementFilter[];
      /** 类型视图导出单个 Sheet；默认视图不传，按需求类型分 Sheet 导全部 */
      requirementTypeIds?: string[];
      /** 只出表头的空模板 */
      template?: boolean;
    }
  ): Promise<{ blob: Blob; filename: string }> {
    return this.get(
      `${this.excelRoot(workspaceSlug, scope, entityId)}/`,
      {
        params: {
          ...(params?.search ? { search: params.search } : {}),
          ...(params?.filters?.length ? { filters: JSON.stringify(params.filters) } : {}),
          ...(params?.requirementTypeIds?.length
            ? { requirement_type_id: params.requirementTypeIds.join(",") }
            : {}),
          ...(params?.template ? { template: "1" } : {}),
        },
      },
      { responseType: "blob" }
    )
      .then((response) => ({
        blob: response?.data as Blob,
        filename: parseAttachmentFilename(response?.headers?.["content-disposition"]) ?? "需求.xlsx",
      }))
      .catch(async (error) => {
        throw await unwrapBlobError(error);
      });
  }

  /** 上传文件做逐行校验，不写库。返回的结果直接喂给预览表格 */
  async validateRequirementExcelImport(
    workspaceSlug: string,
    scope: TRequirementExcelScope,
    entityId: string,
    formData: FormData
  ): Promise<TRequirementExcelValidation> {
    return this.post(`${this.excelRoot(workspaceSlug, scope, entityId)}/validate/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 正式导入。row_keys 省略表示导入全部通过校验的行 */
  async importRequirementsExcel(
    workspaceSlug: string,
    scope: TRequirementExcelScope,
    entityId: string,
    formData: FormData
  ): Promise<TRequirementExcelImportResponse> {
    return this.post(`${this.excelRoot(workspaceSlug, scope, entityId)}/import/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 需求标准库 ------------------------------------------------------- */

  async listLibraries(workspaceSlug: string): Promise<TRequirementLibrary[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLibrary(workspaceSlug: string, libraryId: string): Promise<TRequirementLibrary> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createLibrary(workspaceSlug: string, payload: TCreateRequirementLibraryPayload): Promise<TRequirementLibrary> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirement-libraries/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateLibrary(
    workspaceSlug: string,
    libraryId: string,
    payload: TUpdateRequirementLibraryPayload
  ): Promise<TRequirementLibrary> {
    return this.patch(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteLibrary(workspaceSlug: string, libraryId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLibraryConfiguration(
    workspaceSlug: string,
    libraryId: string
  ): Promise<TRequirementLibraryConfiguration> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/configuration/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listLibraryItems(
    workspaceSlug: string,
    libraryId: string,
    params: {
      cursor?: string;
      perPage?: number;
      search?: string;
      filters?: TRequirementFilter[];
      /** 按 id 直取，供父项选择器回显不在当前页的行 */
      ids?: string[];
      /** 藏掉已经导进该产品的条目 —— 导入弹窗的候选池用，必须在服务端剔除才能保住分页 */
      excludeImportedIntoProduct?: string;
      /** 按模块过滤（含子模块）；不传 = 全部（含未挂靠的条目） */
      moduleId?: string;
    } = {}
  ): Promise<TRequirementsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.filters?.length ? { filters: JSON.stringify(params.filters) } : {}),
        ...(params.ids?.length ? { ids: params.ids.join(",") } : {}),
        ...(params.excludeImportedIntoProduct
          ? { exclude_imported_into_product: params.excludeImportedIntoProduct }
          : {}),
        ...(params.moduleId ? { module_id: params.moduleId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createLibraryItem(
    workspaceSlug: string,
    libraryId: string,
    payload: {
      data: TRequirementData;
      /** 手填编号，必填非空、库内唯一（服务端校验，不校验格式） */
      code: string;
      before_id?: string;
      after_id?: string;
    }
  ): Promise<TRequirement> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateLibraryItem(
    workspaceSlug: string,
    libraryId: string,
    itemId: string,
    payload: {
      data: TRequirementData;
      builtin?: TRequirementBuiltinValues;
      version: number;
      /** 手填编号；不带 = 不改 */
      code?: string;
    }
  ): Promise<TRequirement> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/${itemId}/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteLibraryItem(workspaceSlug: string, libraryId: string, itemId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/${itemId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkDeleteLibraryItems(workspaceSlug: string, libraryId: string, itemIds: string[]): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/bulk-delete/`, {
      ids: itemIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkSaveLibraryItems(
    workspaceSlug: string,
    libraryId: string,
    payload: TRequirementBatchSavePayload
  ): Promise<TRequirementBatchSaveResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/requirement-libraries/${libraryId}/items/bulk-save/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 需求模块（标准库 / 产品各一棵独立的树） ----------------------------- */

  /** 模块树的 URL 根：库与产品两组前缀，由 scope 分派 */
  private modulesRoot(workspaceSlug: string, scope: TRequirementModuleScope) {
    if ("libraryId" in scope) {
      return `/api/workspaces/${workspaceSlug}/requirement-libraries/${scope.libraryId}/modules`;
    }
    return `/api/workspaces/${workspaceSlug}/products/${scope.productId}/requirement-modules`;
  }

  /** 批量挂靠/移动端点挂在条目路由下，与模块树的前缀不同 */
  private setModuleRoot(workspaceSlug: string, scope: TRequirementModuleScope) {
    if ("libraryId" in scope) {
      return `/api/workspaces/${workspaceSlug}/requirement-libraries/${scope.libraryId}/items/set-module`;
    }
    return `/api/workspaces/${workspaceSlug}/products/${scope.productId}/requirements/set-module`;
  }

  /** 一次拿整棵树 + 子树累加计数 + 作用域总数（「全部」节点的计数） */
  async listRequirementModules(
    workspaceSlug: string,
    scope: TRequirementModuleScope
  ): Promise<TRequirementModuleTreeResponse> {
    return this.get(`${this.modulesRoot(workspaceSlug, scope)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRequirementModule(
    workspaceSlug: string,
    scope: TRequirementModuleScope,
    payload: TCreateRequirementModulePayload
  ): Promise<TRequirementModule> {
    return this.post(`${this.modulesRoot(workspaceSlug, scope)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRequirementModule(
    workspaceSlug: string,
    scope: TRequirementModuleScope,
    moduleId: string,
    payload: TUpdateRequirementModulePayload
  ): Promise<TRequirementModule> {
    return this.patch(`${this.modulesRoot(workspaceSlug, scope)}/${moduleId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 删除模块会连带删掉子模块；模块下的需求不删，回到「全部」 */
  async deleteRequirementModule(
    workspaceSlug: string,
    scope: TRequirementModuleScope,
    moduleId: string
  ): Promise<void> {
    return this.delete(`${this.modulesRoot(workspaceSlug, scope)}/${moduleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量挂靠/移动需求到模块；module_id 显式传 null = 移回「全部」 */
  async setRequirementModule(
    workspaceSlug: string,
    scope: TRequirementModuleScope,
    payload: TSetRequirementModulePayload
  ): Promise<{ updated_ids: string[] }> {
    return this.post(`${this.setModuleRoot(workspaceSlug, scope)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 项目需求页左侧的只读模块树（按产品分组，只含已关联需求涉及的模块） */
  async listProjectRequirementModules(
    workspaceSlug: string,
    projectId: string
  ): Promise<TProjectRequirementModulesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/requirement-modules/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 需求配置（审批规则 + 字段/需求类型） -------------------------------- */

  private configurationRoot(workspaceSlug: string, productId: string) {
    return `/api/workspaces/${workspaceSlug}/products/${productId}/requirement-configuration`;
  }

  /** 配置由后端惰性创建，所以 GET 一定拿得到一份（哪怕是空态） */
  async getConfiguration(workspaceSlug: string, productId: string): Promise<TRequirementConfiguration> {
    return this.get(`${this.configurationRoot(workspaceSlug, productId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateConfiguration(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementConfigurationPayload
  ): Promise<TRequirementConfiguration> {
    return this.put(`${this.configurationRoot(workspaceSlug, productId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 产品需求条目 ------------------------------------------------------ */

  async listRequirements(
    workspaceSlug: string,
    productId: string,
    params: {
      cursor?: string;
      perPage?: number;
      search?: string;
      filters?: TRequirementFilter[];
      /** 按需求类型切视图必须走服务端过滤 —— 条目是游标分页的 */
      requirementTypeId?: string;
      /** 按 id 直取，供父项选择器回显不在当前页的行 */
      ids?: string[];
      /** 关联选择器（父项下拉等）用：排除已关闭的需求。带 ids 回显时服务端豁免 */
      excludeClosed?: boolean;
      /** 按模块过滤（含子模块）；不传 = 全部（含未挂靠的需求） */
      moduleId?: string;
    } = {}
  ): Promise<TRequirementsResponse> {
    return this.get(`${this.requirementsRoot(workspaceSlug, productId)}/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.filters?.length ? { filters: JSON.stringify(params.filters) } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
        ...(params.ids?.length ? { ids: params.ids.join(",") } : {}),
        ...(params.excludeClosed ? { exclude_closed: "true" } : {}),
        ...(params.moduleId ? { module_id: params.moduleId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRequirement(
    workspaceSlug: string,
    productId: string,
    payload: {
      data: TRequirementData;
      /** 新行绑定哪个需求类型 —— 字段与校验都以它为准 */
      requirement_type_id: string;
      before_id?: string;
      after_id?: string;
      /** 左侧树选中模块后新建自动挂靠 */
      module_id?: string | null;
    }
  ): Promise<TRequirement> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 本产品还没导过的库条目 id，按库分组。导入弹窗的可导条数、三态与「勾整库」都靠它 */
  async listImportableLibraryItems(
    workspaceSlug: string,
    productId: string
  ): Promise<TRequirementImportableLibrary[]> {
    return this.get(`${this.requirementsRoot(workspaceSlug, productId)}/importable-library-items/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 从标准库导入条目，成为本产品下绑定该库需求类型的需求 */
  async importLibraryItems(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementImportPayload
  ): Promise<TRequirementImportResponse> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/import/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 更新一条需求。
   *
   * builtin 必须整组传：后端按缺省值补齐没传的列，漏传等于把它清空。
   */
  async updateRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    payload: { data: TRequirementData; builtin: TRequirementBuiltinValues; version: number }
  ): Promise<TRequirement> {
    return this.patch(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 改需求级交付状态（产品侧写入口）。
   *
   * 与内容 PATCH 分开：不带 version、不进内容 diff、评审中也能改；closed 行改成任意
   * 非 closed 值即重开。返回整行，但调用方只该合并 status / can_submit_review ——
   * 整行替换会与在飞的内容自动保存竞态。
   */
  async updateRequirementStatus(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    status: TRequirementItemStatus
  ): Promise<TRequirement> {
    return this.patch(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/status/`, {
      status,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 一条需求的变更轨迹：内容变更与字段结构变更并成一条时间线。
   *
   * 字段结构那一半来自需求类型的修订链，一次类型编辑只写一行，这里在读的时候并进来 ——
   * 所以同一条 schema 记录会在该类型下每条需求里都出现，渲染时必须让它视觉后退。
   */
  async listRequirementTrail(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    params: { cursor?: string; perPage?: number; kind?: "content" | "schema" } = {}
  ): Promise<TRequirementTrailResponse> {
    return this.get(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/trail/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.kind ? { kind: params.kind } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRequirement(workspaceSlug: string, productId: string, requirementId: string): Promise<void> {
    return this.delete(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkDeleteRequirements(
    workspaceSlug: string,
    productId: string,
    requirementIds: string[]
  ): Promise<void> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/bulk-delete/`, {
      ids: requirementIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkSaveRequirements(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementBatchSavePayload
  ): Promise<TRequirementBatchSaveResponse> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/bulk-save/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  /* --- 变更单 ----------------------------------------------------------- */

  async listChangeRequests(
    workspaceSlug: string,
    productId: string,
    params: {
      cursor?: string;
      perPage?: number;
      status?: TRequirementChangeStatus;
      /** all = 全部，mine = 我提交的，to_review = 等我审批的 */
      scope?: "all" | "mine" | "to_review";
      /** 「这条需求被哪些单改过」 */
      requirementId?: string;
    } = {}
  ): Promise<TRequirementChangeRequestsResponse> {
    return this.get(`${this.changeRequestsRoot(workspaceSlug, productId)}/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.scope && params.scope !== "all" ? { scope: params.scope } : {}),
        ...(params.requirementId ? { requirement_id: params.requirementId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getChangeRequest(
    workspaceSlug: string,
    productId: string,
    changeRequestId: string
  ): Promise<TRequirementChangeRequestDetail> {
    return this.get(`${this.changeRequestsRoot(workspaceSlug, productId)}/${changeRequestId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 条目多到详情内联不下时才走这里；N 通常是个位数 */
  async listChangeItems(
    workspaceSlug: string,
    productId: string,
    changeRequestId: string,
    params: {
      cursor?: string;
      perPage?: number;
      changeType?: TRequirementChangeType;
      requirementTypeId?: string;
    } = {}
  ): Promise<TRequirementChangeItemsResponse> {
    return this.get(`${this.changeRequestsRoot(workspaceSlug, productId)}/${changeRequestId}/items/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.changeType ? { change_type: params.changeType } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 提交 1..N 条需求进入评审。
   *
   * 没有单条的提交端点：行上带 pending_change_request_id，单条提交就是 items.length === 1，
   * 单条撤回就是对那个 id 调 cancel。一条代码路径，单条与批量不会走偏。
   */
  async submitReview(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementSubmitReviewPayload
  ): Promise<TRequirementChangeRequest> {
    return this.post(`${this.changeRequestsRoot(workspaceSlug, productId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async actOnChangeRequest(
    workspaceSlug: string,
    productId: string,
    changeRequestId: string,
    payload: { action: TRequirementApprovalAction; comment?: string; revert?: boolean }
  ): Promise<TRequirementChangeRequest> {
    return this.post(`${this.changeRequestsRoot(workspaceSlug, productId)}/${changeRequestId}/act/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cancelChangeRequest(
    workspaceSlug: string,
    productId: string,
    changeRequestId: string
  ): Promise<TRequirementChangeRequest> {
    return this.post(`${this.changeRequestsRoot(workspaceSlug, productId)}/${changeRequestId}/cancel/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 单条需求的版本 ---------------------------------------------------- */

  async listRequirementVersions(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    params: { cursor?: string; perPage?: number } = {}
  ): Promise<TRequirementVersionsResponse> {
    return this.get(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/versions/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 回滚到某个已通过版本。
   *
   * 不撤销审批：版本链一条不动，回滚完这条需求是 modified，要不要真的退回那一版由随后
   * 的评审说了算。所以它返回的是普通的行，调用方按更新行处理即可。
   */
  async rollbackRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    version: number
  ): Promise<TRequirement> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/rollback/`, {
      version,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 待我审批 --------------------------------------------------------- */

  /**
   * 跨产品聚合当前用户名下的变更单。
   *
   * 作用域是工作区而不是产品 —— 一个人可能是三个产品的审批人，产品级的入口等于让他
   * 记住自己要去哪三个地方看。产品页头部的入口用 productId 收窄到当前产品。
   */
  async listMyApprovals(
    workspaceSlug: string,
    params: { tab?: "pending" | "processed"; productId?: string } = {}
  ): Promise<TRequirementApprovalInboxResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-approvals/`, {
      params: {
        ...(params.tab ? { tab: params.tab } : {}),
        ...(params.productId ? { product_id: params.productId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 基线快照 --------------------------------------------------------- */

  async listBaselines(
    workspaceSlug: string,
    productId: string,
    params: { cursor?: string; perPage?: number } = {}
  ): Promise<TRequirementBaselinesResponse> {
    return this.get(`${this.baselinesRoot(workspaceSlug, productId)}/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 打基线前先算一遍：会纳入多少条、哪些没纳入、哪些纳入的不是当前内容。
   *
   * 与真正落库共用服务端同一份判定，所以预览说的数字就是最后会写进去的数字。
   */
  async previewBaseline(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementBaselinePayload = {}
  ): Promise<TRequirementBaselinePreview> {
    return this.post(`${this.baselinesRoot(workspaceSlug, productId)}/?preview=1`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createBaseline(
    workspaceSlug: string,
    productId: string,
    payload: TRequirementBaselinePayload
  ): Promise<TRequirementBaselineCreated> {
    return this.post(`${this.baselinesRoot(workspaceSlug, productId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getBaseline(workspaceSlug: string, productId: string, baselineId: string): Promise<TRequirementBaseline> {
    return this.get(`${this.baselinesRoot(workspaceSlug, productId)}/${baselineId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 基线内容不可改，能改的只有名字和说明 */
  async updateBaseline(
    workspaceSlug: string,
    productId: string,
    baselineId: string,
    payload: { name?: string; description?: string }
  ): Promise<TRequirementBaseline> {
    return this.patch(`${this.baselinesRoot(workspaceSlug, productId)}/${baselineId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteBaseline(workspaceSlug: string, productId: string, baselineId: string): Promise<void> {
    return this.delete(`${this.baselinesRoot(workspaceSlug, productId)}/${baselineId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listBaselineRequirements(
    workspaceSlug: string,
    productId: string,
    baselineId: string,
    params: { cursor?: string; perPage?: number; requirementTypeId?: string } = {}
  ): Promise<TRequirementBaselineEntriesResponse> {
    return this.get(`${this.baselinesRoot(workspaceSlug, productId)}/${baselineId}/requirements/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async compareBaselines(
    workspaceSlug: string,
    productId: string,
    baselineId: string,
    toBaselineId: string,
    params: { cursor?: string; perPage?: number } = {}
  ): Promise<TRequirementBaselineCompareResponse> {
    return this.get(`${this.baselinesRoot(workspaceSlug, productId)}/${baselineId}/compare/`, {
      params: {
        to: toBaselineId,
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 项目 ↔ 产品 ------------------------------------------------------ */

  async listProjectProducts(workspaceSlug: string, projectId: string): Promise<TProductProject[]> {
    return this.get(`${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/products/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 一次调用同时增删，与工作项挂模块的接口同形 */
  async updateProjectProducts(
    workspaceSlug: string,
    projectId: string,
    payload: { products?: string[]; removed_products?: string[] }
  ): Promise<{ message: string }> {
    return this.post(`${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/products/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 产品侧：这个产品被哪些项目引用 */
  async listProductProjects(workspaceSlug: string, productId: string): Promise<TProductProject[]> {
    return this.get(`${this.scopeRoot(workspaceSlug, { kind: "product", id: productId })}/projects/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 产品侧一次增删关联项目，与项目侧 updateProjectProducts 对称 */
  async updateProductProjects(
    workspaceSlug: string,
    productId: string,
    payload: { projects?: string[]; removed_projects?: string[] }
  ): Promise<{ message: string }> {
    return this.post(`${this.scopeRoot(workspaceSlug, { kind: "product", id: productId })}/projects/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 项目 ↔ 需求 ------------------------------------------------------ */

  /** 项目网格渲染自定义列所需的需求类型与字段。形状与产品的 configuration 一致，但 policy 恒为 null */
  async getProjectRequirementConfiguration(
    workspaceSlug: string,
    projectId: string
  ): Promise<TRequirementConfiguration> {
    return this.get(`${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/requirement-configuration/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listProjectRequirements(
    workspaceSlug: string,
    projectId: string,
    params: {
      cursor?: string;
      perPage?: number;
      search?: string;
      filters?: TRequirementFilter[];
      requirementTypeId?: string;
      /** 只看某个产品来的需求；逗号分隔多值 */
      productId?: string;
      /** 按需求级状态筛选；逗号分隔多值 */
      status?: string;
      title?: string;
      approvalState?: string;
      priority?: string;
      assigneeId?: string;
      startDate?: string;
      startDateFrom?: string;
      startDateTo?: string;
      targetDate?: string;
      targetDateFrom?: string;
      targetDateTo?: string;
      ids?: string[];
      /** 关联选择器用：排除已关联到该迭代的行 */
      exclude_cycle_id?: string;
      /** 关联选择器用：排除已关联到该发布单的行 */
      exclude_release_id?: string;
      /** 关联选择器用：排除已关联到该工作项的行 */
      exclude_issue_id?: string;
      /** 关联选择器用：排除已关闭的需求（主列表不带 —— 项目页仍要看到已关闭需求） */
      excludeClosed?: boolean;
      /** 左侧模块树的过滤（含子模块）；模块归产品，项目侧只读 */
      moduleId?: string;
    } = {}
  ): Promise<TProjectRequirementsResponse> {
    return this.get(`${this.projectRequirementsRoot(workspaceSlug, projectId)}/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.filters?.length ? { filters: JSON.stringify(params.filters) } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
        ...(params.productId ? { product_id: params.productId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.title ? { title: params.title } : {}),
        ...(params.approvalState ? { approval_state: params.approvalState } : {}),
        ...(params.priority ? { priority: params.priority } : {}),
        ...(params.assigneeId ? { assignee_id: params.assigneeId } : {}),
        ...(params.startDate ? { start_date: params.startDate } : {}),
        ...(params.startDateFrom ? { start_date_from: params.startDateFrom } : {}),
        ...(params.startDateTo ? { start_date_to: params.startDateTo } : {}),
        ...(params.targetDate ? { target_date: params.targetDate } : {}),
        ...(params.targetDateFrom ? { target_date_from: params.targetDateFrom } : {}),
        ...(params.targetDateTo ? { target_date_to: params.targetDateTo } : {}),
        ...(params.ids?.length ? { ids: params.ids.join(",") } : {}),
        ...(params.exclude_cycle_id ? { exclude_cycle_id: params.exclude_cycle_id } : {}),
        ...(params.exclude_release_id ? { exclude_release_id: params.exclude_release_id } : {}),
        ...(params.exclude_issue_id ? { exclude_issue_id: params.exclude_issue_id } : {}),
        ...(params.excludeClosed ? { exclude_closed: "true" } : {}),
        ...(params.moduleId ? { module_id: params.moduleId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 候选池：可以关联进本项目的需求。
   *
   * 只包含已关联产品下、且已通过评审的需求 —— 未过评审的需求不进入交付链路。
   */
  async listLinkableRequirements(
    workspaceSlug: string,
    projectId: string,
    params: {
      cursor?: string;
      perPage?: number;
      search?: string;
      requirementTypeId?: string;
      productId?: string;
    } = {}
  ): Promise<TLinkableRequirementsResponse> {
    return this.get(`${this.scopeRoot(workspaceSlug, { kind: "project", id: projectId })}/linkable-requirements/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
        ...(params.search ? { search: params.search } : {}),
        ...(params.requirementTypeId ? { requirement_type_id: params.requirementTypeId } : {}),
        ...(params.productId ? { product_id: params.productId } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkRequirementsToProject(
    workspaceSlug: string,
    projectId: string,
    payload: { requirements: string[] }
  ): Promise<{ message: string }> {
    return this.post(`${this.projectRequirementsRoot(workspaceSlug, projectId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 解除关联。软删关联行 —— 需求本体、版本、审批历史一律不动 */
  async unlinkRequirementFromProject(
    workspaceSlug: string,
    projectId: string,
    requirementId: string
  ): Promise<void> {
    return this.delete(`${this.projectRequirementsRoot(workspaceSlug, projectId)}/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 改本项目内的排序 / 需求级交付状态（项目侧写入口，权限是项目的
   * project.requirement_link.manage）。
   *
   * status 写在需求本体上，跨项目共享一份；任意方向可改，closed 选回任意非 closed
   * 值即重开。返回该行的项目侧整行（与列表同口径），调用方直接就地替换。
   */
  async updateProjectRequirement(
    workspaceSlug: string,
    projectId: string,
    requirementId: string,
    payload: { sort_order?: number; status?: TRequirementItemStatus }
  ): Promise<TProjectRequirement> {
    return this.patch(`${this.projectRequirementsRoot(workspaceSlug, projectId)}/${requirementId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 项目侧发起变更单。
   *
   * 变更单本身仍是产品作用域、审批人仍是产品的名单 —— 项目只是提单入口。
   * 需求内容与已批准版本一致时服务端会以 REQUIREMENT_NO_CHANGES 拒绝，那是对的：
   * 没有变化就没有可审的东西。
   */
  async submitChangeFromProject(
    workspaceSlug: string,
    projectId: string,
    requirementId: string,
    payload: { reason?: string } = {}
  ): Promise<TRequirementChangeRequest> {
    return this.post(`${this.projectRequirementsRoot(workspaceSlug, projectId)}/${requirementId}/changes/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 需求侧：改这条需求进了哪些项目 */
  async updateRequirementProjects(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    payload: { projects?: string[]; removed_projects?: string[] }
  ): Promise<{ message: string }> {
    return this.post(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/projects/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 迭代/发布单 ↔ 需求（容器关联） ------------------------------------ */

  /** 迭代已关联的需求列表。行形状与项目需求列表一致，但不带分面 */
  async listCycleRequirements(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    params: { cursor?: string; perPage?: number } = {}
  ): Promise<TProjectRequirementsResponse> {
    return this.get(`${this.cycleRequirementsRoot(workspaceSlug, projectId, cycleId)}/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量关联需求进迭代。需求必须先关联本项目，否则服务端 409；阶段升档由服务端重算 */
  async linkRequirementsToCycle(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    payload: TRequirementContainerLinkPayload
  ): Promise<{ message: string }> {
    return this.post(`${this.cycleRequirementsRoot(workspaceSlug, projectId, cycleId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 解除需求与迭代的关联。软删关联行，阶段降档与留痕由服务端重算 */
  async unlinkRequirementFromCycle(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    requirementId: string
  ): Promise<void> {
    return this.delete(`${this.cycleRequirementsRoot(workspaceSlug, projectId, cycleId)}/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 发布单已关联的需求列表。行形状与项目需求列表一致，但不带分面 */
  async listReleaseRequirements(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    params: { cursor?: string; perPage?: number } = {}
  ): Promise<TProjectRequirementsResponse> {
    return this.get(`${this.releaseRequirementsRoot(workspaceSlug, projectId, releaseId)}/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量关联需求进发布单。需求必须先关联本项目，否则服务端 409；阶段升档由服务端重算 */
  async linkRequirementsToRelease(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    payload: TRequirementContainerLinkPayload
  ): Promise<{ message: string }> {
    return this.post(`${this.releaseRequirementsRoot(workspaceSlug, projectId, releaseId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 解除需求与发布单的关联。软删关联行，阶段降档与留痕由服务端重算 */
  async unlinkRequirementFromRelease(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    requirementId: string
  ): Promise<void> {
    return this.delete(`${this.releaseRequirementsRoot(workspaceSlug, projectId, releaseId)}/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 需求 ↔ 工作项（RequirementIssue） --------------------------------- */

  /** 需求已关联的工作项列表。轻量行（含归档，前端按 archived_at 置灰），不走工作项网格链路 */
  async listRequirementIssues(
    workspaceSlug: string,
    projectId: string,
    requirementId: string
  ): Promise<TRequirementIssue[]> {
    return this.get(`${this.requirementIssuesRoot(workspaceSlug, projectId, requirementId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 批量关联已有工作项。需求必须先关联本项目，否则 409 REQUIREMENT_NOT_LINKED_TO_PROJECT；
   * 已关闭的需求 409 REQUIREMENT_CLOSED。多对多：工作项已挂别的需求不算冲突，已挂本需求
   * 的由服务端幂等吸收。
   */
  async linkIssuesToRequirement(
    workspaceSlug: string,
    projectId: string,
    requirementId: string,
    issueIds: string[]
  ): Promise<{ message: string }> {
    return this.post(`${this.requirementIssuesRoot(workspaceSlug, projectId, requirementId)}/`, { issues: issueIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 解除工作项与需求的关联。软删关联行，阶段回落由服务端重算 */
  async unlinkIssueFromRequirement(
    workspaceSlug: string,
    projectId: string,
    requirementId: string,
    issueId: string
  ): Promise<void> {
    return this.delete(`${this.requirementIssuesRoot(workspaceSlug, projectId, requirementId)}/${issueId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 工作项 ↔ 需求（RequirementIssue 的工作项侧） ------------------------ */

  /** 工作项已关联的需求列表。行形状与迭代关联需求列表一致（分页信封，一条工作项挂的需求是个位数） */
  async listIssueRequirements(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    params: { cursor?: string; perPage?: number } = {}
  ): Promise<TProjectRequirementsResponse> {
    return this.get(`${this.issueRequirementsRoot(workspaceSlug, projectId, issueId)}/`, {
      params: {
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.perPage ? { per_page: params.perPage } : {}),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量把需求挂到工作项上。需求必须先关联本项目（409 REQUIREMENT_NOT_LINKED_TO_PROJECT）、非已关闭（409 REQUIREMENT_CLOSED） */
  async linkRequirementsToIssue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload: TRequirementContainerLinkPayload
  ): Promise<{ message: string }> {
    return this.post(`${this.issueRequirementsRoot(workspaceSlug, projectId, issueId)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 解除工作项与某条需求的关联。软删关联行，不影响需求状态 */
  async unlinkRequirementFromIssue(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    requirementId: string
  ): Promise<void> {
    return this.delete(`${this.issueRequirementsRoot(workspaceSlug, projectId, issueId)}/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 需求 ↔ 测试用例（RequirementTestCase） ----------------------------- */

  /** 需求已关联的用例列表。轻量行、无分页 —— 与关联工作项同取舍：人手挂的量级，一次给完 */
  async listRequirementTestCases(
    workspaceSlug: string,
    productId: string,
    requirementId: string
  ): Promise<TRequirementTestCase[]> {
    return this.get(`${this.requirementTestCasesRoot(workspaceSlug, productId, requirementId)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 候选池：能挂到这条需求上、且尚未挂上的用例。范围 = 需求已关联项目下的用例库 +
   * project 为空的共享库。需要写权限（会露出项目侧内容）。
   */
  async listLinkableTestCases(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    params: {
      search?: string;
      repository_id?: string;
      /** 项目侧抽屉必传：把池子收窄到本项目 + 共享库，不露出需求其他项目的用例 */
      project_id?: string;
      cursor?: string;
      perPage?: number;
    } = {}
  ): Promise<TLinkableTestCasesResponse> {
    const { perPage, ...rest } = params;
    return this.get(`${this.requirementsRoot(workspaceSlug, productId)}/${requirementId}/linkable-test-cases/`, {
      params: { ...rest, per_page: perPage },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 批量关联已有用例。全有或全无 —— 任一条不在作用域内 → 409
   * REQUIREMENT_TEST_CASE_LINK_REJECTED，conflicts[].reason 给出原因
   * （NOT_FOUND / PROJECT_OUT_OF_SCOPE），调用方据此提示。
   */
  async linkTestCasesToRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    caseIds: string[]
  ): Promise<{ message: string }> {
    return this.post(`${this.requirementTestCasesRoot(workspaceSlug, productId, requirementId)}/`, {
      test_cases: caseIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 解除用例与需求的关联。软删关联行；已关闭的需求同样可以解除（closed 保护内容不保护关联） */
  async unlinkTestCaseFromRequirement(
    workspaceSlug: string,
    productId: string,
    requirementId: string,
    caseId: string
  ): Promise<void> {
    return this.delete(`${this.requirementTestCasesRoot(workspaceSlug, productId, requirementId)}/${caseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
