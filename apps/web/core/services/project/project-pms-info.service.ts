/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export const PMS_METER_TYPE_VALUES = [
  "01-电表",
  "02-水表",
  "03-气表",
  "04-P2P",
  "05-PLC",
  "06-DCU",
  "07-CIU",
] as const;

export const PMS_METER_TYPE_OPTIONS = PMS_METER_TYPE_VALUES.map((v) => ({ value: v, label: v }));

export const PMS_REPRODUCE_OPTIONS = ["表象级", "操作级", "发散级", "难重现", "其他"] as const;

export type TPmsMeterTypeValue = (typeof PMS_METER_TYPE_VALUES)[number];
export type TPmsReproduceLevel = (typeof PMS_REPRODUCE_OPTIONS)[number];

export type TProjectPmsInfo = {
  id: number;
  project: string;
  sub_project: string;
  project_code: string;
  meter_type: string;
  software_version: string;
  tool_version: string;
  reproduce: TPmsReproduceLevel;
  issue_ids: unknown[];
};

export type TProjectPmsInfoCreatePayload = Omit<TProjectPmsInfo, "id" | "project" | "issue_ids"> & {
  issue_ids?: unknown[];
};

export type TProjectPmsInfoUpdatePayload = Partial<TProjectPmsInfoCreatePayload>;

export type TPmsSyncFailedIssue = {
  id: string;
  sequence_id: number;
  name: string;
  error: string;
};

export type TPmsSyncResponse = {
  failed_issues: TPmsSyncFailedIssue[];
  pms_info: TProjectPmsInfo;
};

export class ProjectPmsInfoService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TProjectPmsInfo[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pms-info/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: TProjectPmsInfoCreatePayload
  ): Promise<TProjectPmsInfo> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pms-info/`, {
      ...data,
      issue_ids: data.issue_ids ?? [],
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    id: number,
    data: TProjectPmsInfoUpdatePayload
  ): Promise<TProjectPmsInfo> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pms-info/${id}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, id: number): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pms-info/${id}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 触发后端 PMS 同步（`PmsSyncAPIView`），返回失败工作项列表与更新后的配置。 */
  async sync(workspaceSlug: string, projectId: string): Promise<TPmsSyncResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/pms-info/sync/`, {})
      .then((response) => response?.data as TPmsSyncResponse)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const PMS_METER_TYPE_LEGACY_LABELS: Record<string, string> = {
  "01": "01-电表",
  "02": "02-水表",
  "03": "03-气表",
  "04": "04-P2P",
  "05": "05-PLC",
  "06": "06-DCU",
  "07": "07-CIU",
};

/** 展示用：兼容历史仅保存 01–07 的数据。 */
export function getPmsMeterTypeLabel(value: string): string {
  return PMS_METER_TYPE_LEGACY_LABELS[value] ?? value;
}
