import { API_BASE_URL } from "@plane/constants";
import type {
  TProductCategory,
  TProductCategoryBulkModulesResponse,
  TProductCategoryNamePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/**
 * 工作区级产品分类与它的一级模块。列表一次返回全部（已按 sort_order 排好）；
 * 模块的增删改排都返回整个分类，调用方直接替换。
 */
export class ProductCategoryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private root(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/product-categories`;
  }

  async list(workspaceSlug: string): Promise<TProductCategory[]> {
    return this.get(`${this.root(workspaceSlug)}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TProductCategoryNamePayload): Promise<TProductCategory> {
    return this.post(`${this.root(workspaceSlug)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    categoryId: string,
    payload: TProductCategoryNamePayload
  ): Promise<TProductCategory> {
    return this.patch(`${this.root(workspaceSlug)}/${categoryId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 被标准库使用时 409 PRODUCT_CATEGORY_IN_USE */
  async deleteCategory(workspaceSlug: string, categoryId: string): Promise<void> {
    return this.delete(`${this.root(workspaceSlug)}/${categoryId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整段重排：传工作区内完整的有序 id 列表 */
  async reorder(workspaceSlug: string, ids: string[]): Promise<TProductCategory[]> {
    return this.post(`${this.root(workspaceSlug)}/reorder/`, { ids })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量添加（每行一个），后端负责去空、去重、跳过已有与超长 */
  async bulkCreateModules(
    workspaceSlug: string,
    categoryId: string,
    names: string[]
  ): Promise<TProductCategoryBulkModulesResponse> {
    return this.post(`${this.root(workspaceSlug)}/${categoryId}/modules/bulk/`, { names })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateModule(
    workspaceSlug: string,
    categoryId: string,
    moduleId: string,
    payload: TProductCategoryNamePayload
  ): Promise<TProductCategory> {
    return this.patch(`${this.root(workspaceSlug)}/${categoryId}/modules/${moduleId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 有库在该模块下还有内容时 409 PRODUCT_CATEGORY_MODULE_IN_USE */
  async deleteModule(workspaceSlug: string, categoryId: string, moduleId: string): Promise<TProductCategory> {
    return this.delete(`${this.root(workspaceSlug)}/${categoryId}/modules/${moduleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 分类内一级模块整段重排 */
  async reorderModules(workspaceSlug: string, categoryId: string, ids: string[]): Promise<TProductCategory> {
    return this.post(`${this.root(workspaceSlug)}/${categoryId}/modules/reorder/`, { ids })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
