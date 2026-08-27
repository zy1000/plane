import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateDataDictionaryItemPayload,
  TCreateDataDictionaryPayload,
  TDataDictionary,
  TDataDictionaryItem,
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
}
