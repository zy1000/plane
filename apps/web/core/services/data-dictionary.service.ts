import { API_BASE_URL } from "@plane/constants";
import type {
  TBulkCreateDataDictionaryItemsResponse,
  TCreateDataDictionaryItemPayload,
  TCreateDataDictionaryPayload,
  TDataDictionary,
  TDataDictionaryItem,
  TDataDictionaryUsageResponse,
  TUpdateDataDictionaryItemPayload,
  TUpdateDataDictionaryPayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/** 工作区级数据字典。列表接口一次返回全部字典及其值（`items` 已按 sort_order 排好）。 */
export class DataDictionaryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TDataDictionary[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/data-dictionaries/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TCreateDataDictionaryPayload): Promise<TDataDictionary> {
    return this.post(`/api/workspaces/${workspaceSlug}/data-dictionaries/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    dictionaryId: string,
    payload: TUpdateDataDictionaryPayload
  ): Promise<TDataDictionary> {
    return this.patch(`/api/workspaces/${workspaceSlug}/data-dictionaries/${dictionaryId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteDictionary(workspaceSlug: string, dictionaryId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/data-dictionaries/${dictionaryId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createItem(
    workspaceSlug: string,
    dictionaryId: string,
    payload: TCreateDataDictionaryItemPayload
  ): Promise<TDataDictionaryItem> {
    return this.post(`/api/workspaces/${workspaceSlug}/data-dictionaries/${dictionaryId}/items/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateItem(
    workspaceSlug: string,
    dictionaryId: string,
    itemId: string,
    payload: TUpdateDataDictionaryItemPayload
  ): Promise<TDataDictionaryItem> {
    return this.patch(`/api/workspaces/${workspaceSlug}/data-dictionaries/${dictionaryId}/items/${itemId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteItem(workspaceSlug: string, dictionaryId: string, itemId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/data-dictionaries/${dictionaryId}/items/${itemId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 设置页「引用」列：每个值被多少活跃产品 / 项目引用 */
  async getUsage(workspaceSlug: string, dictionaryId: string): Promise<TDataDictionaryUsageResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/data-dictionaries/${dictionaryId}/usage/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 多行粘贴批量新增：重名走 skipped 不报错 */
  async bulkCreateItems(
    workspaceSlug: string,
    dictionaryId: string,
    labels: string[]
  ): Promise<TBulkCreateDataDictionaryItemsResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/data-dictionaries/${dictionaryId}/items/bulk/`, { labels })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
