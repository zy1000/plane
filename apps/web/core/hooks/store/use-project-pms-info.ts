/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ProjectPmsInfoService,
  type TPmsSyncResponse,
  type TProjectPmsInfo,
  type TProjectPmsInfoCreatePayload,
  type TProjectPmsInfoUpdatePayload,
} from "@/services/project/project-pms-info.service";

const pmsInfoService = new ProjectPmsInfoService();

export function useProjectPmsInfo(workspaceSlug: string | undefined, projectId: string | undefined) {
  const [items, setItems] = useState<TProjectPmsInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchList = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setIsLoading(true);
    try {
      const data = await pmsInfoService.list(workspaceSlug, projectId);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const create = useCallback(
    async (payload: TProjectPmsInfoCreatePayload) => {
      if (!workspaceSlug || !projectId) throw new Error("missing_scope");
      const created = await pmsInfoService.create(workspaceSlug, projectId, payload);
      setItems((prev) => [created, ...prev]);
      return created;
    },
    [workspaceSlug, projectId]
  );

  const update = useCallback(
    async (id: number, payload: TProjectPmsInfoUpdatePayload) => {
      if (!workspaceSlug || !projectId) throw new Error("missing_scope");
      const updated = await pmsInfoService.update(workspaceSlug, projectId, id, payload);
      setItems((prev) => prev.map((row) => (row.id === id ? updated : row)));
      return updated;
    },
    [workspaceSlug, projectId]
  );

  const remove = useCallback(
    async (id: number) => {
      if (!workspaceSlug || !projectId) throw new Error("missing_scope");
      await pmsInfoService.destroy(workspaceSlug, projectId, id);
      setItems((prev) => prev.filter((row) => row.id !== id));
    },
    [workspaceSlug, projectId]
  );

  const sync = useCallback(async (): Promise<TPmsSyncResponse> => {
    if (!workspaceSlug || !projectId) throw new Error("missing_scope");
    const data = await pmsInfoService.sync(workspaceSlug, projectId);
    if (data?.pms_info) {
      setItems((prev) => {
        const pid = data.pms_info.id;
        if (!prev.some((r) => r.id === pid)) return prev;
        return prev.map((r) => (r.id === pid ? data.pms_info : r));
      });
    }
    return data;
  }, [workspaceSlug, projectId]);

  return {
    items,
    isLoading,
    fetchList,
    create,
    update,
    remove,
    sync,
  };
}
