import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IPermission,
  TCreateProductRolePayload,
  TProductRole,
  TProductRolePermissionData,
  TUpdateProductRolePayload,
} from "@plane/types";
import { ProductRoleService } from "@/services/product-role.service";

const productRoleService = new ProductRoleService();

const upsertRole = (roles: TProductRole[], roleToUpsert: TProductRole) => {
  const roleIndex = roles.findIndex((role) => role.id === roleToUpsert.id);
  if (roleIndex === -1) return [roleToUpsert, ...roles];
  return roles.map((role) => (role.id === roleToUpsert.id ? roleToUpsert : role));
};

type TRolePermissionState = {
  data: TProductRolePermissionData | null;
  isLoading: boolean;
  loaded: boolean;
};

const emptyPermissionState = (): TRolePermissionState => ({ data: null, isLoading: false, loaded: false });

export const useProductRoles = (workspaceSlug: string | undefined, productId: string | undefined) => {
  const [roles, setRoles] = useState<TProductRole[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [error, setError] = useState<unknown>(null);
  // 角色权限按角色懒加载，与项目角色页同一套形状（use-project-roles）
  const [permissionByRoleId, setPermissionByRoleId] = useState<Record<number, TRolePermissionState>>({});
  const permissionRef = useRef(permissionByRoleId);
  permissionRef.current = permissionByRoleId;
  const inFlightRef = useRef<Set<number>>(new Set());

  const fetchRoles = useCallback(async () => {
    if (!workspaceSlug || !productId) {
      setRoles([]);
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await productRoleService.list(workspaceSlug, productId);
      setRoles(response);
      return response;
    } catch (requestError) {
      setError(requestError);
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [productId, workspaceSlug]);

  useEffect(() => {
    setRoles([]);
    setPermissionByRoleId({});
    void fetchRoles().catch(() => undefined);
  }, [fetchRoles]);

  const createRole = useCallback(
    async (payload: TCreateProductRolePayload) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      const response = await productRoleService.create(workspaceSlug, productId, payload);
      setRoles((current) => [response, ...current.filter((role) => role.id !== response.id)]);
      return response;
    },
    [productId, workspaceSlug]
  );

  const updateRole = useCallback(
    async (roleId: number, payload: TUpdateProductRolePayload) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      const response = await productRoleService.update(workspaceSlug, productId, roleId, payload);
      setRoles((current) => upsertRole(current, response));
      setPermissionByRoleId((prev) => {
        const cur = prev[roleId];
        if (!cur?.data) return prev;
        return { ...prev, [roleId]: { ...cur, data: { ...cur.data, role: response } } };
      });
      return response;
    },
    [productId, workspaceSlug]
  );

  const deleteRole = useCallback(
    async (roleId: number) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      await productRoleService.deleteRole(workspaceSlug, productId, roleId);
      setRoles((current) => current.filter((role) => role.id !== roleId));
      setPermissionByRoleId((prev) => {
        const next = { ...prev };
        delete next[roleId];
        return next;
      });
    },
    [productId, workspaceSlug]
  );

  const loadRolePermissions = useCallback(
    async (roleId: number) => {
      if (!workspaceSlug || !productId) return;
      if (inFlightRef.current.has(roleId)) return;
      inFlightRef.current.add(roleId);

      setPermissionByRoleId((prev) => {
        const existing = prev[roleId];
        return { ...prev, [roleId]: { ...(existing ?? emptyPermissionState()), isLoading: !existing?.data } };
      });

      try {
        const data = await productRoleService.fetchPermissions(workspaceSlug, productId, roleId);
        setPermissionByRoleId((prev) => ({ ...prev, [roleId]: { data, isLoading: false, loaded: true } }));
      } catch {
        setPermissionByRoleId((prev) => ({ ...prev, [roleId]: { data: null, isLoading: false, loaded: true } }));
      } finally {
        inFlightRef.current.delete(roleId);
      }
    },
    [productId, workspaceSlug]
  );

  const getRolePermissionState = useCallback(
    (roleId: number): TRolePermissionState => permissionByRoleId[roleId] ?? emptyPermissionState(),
    [permissionByRoleId]
  );

  /** 勾 / 取消一个权限：先本地翻转，失败回滚 */
  const togglePermission = useCallback(
    async (roleId: number, permissionKey: string) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      const currentState = permissionRef.current[roleId];
      if (!currentState?.data) return;

      const currentKeys = currentState.data.permission_keys;
      const newKeys = currentKeys.includes(permissionKey)
        ? currentKeys.filter((key) => key !== permissionKey)
        : [...currentKeys, permissionKey];
      const optimisticPermissions: IPermission[] = currentState.data.permissions.map((permission) => ({
        ...permission,
        is_bound: newKeys.includes(permission.key),
      }));
      setPermissionByRoleId((prev) => ({
        ...prev,
        [roleId]: {
          data: { ...currentState.data!, permission_keys: newKeys, permissions: optimisticPermissions },
          isLoading: false,
          loaded: true,
        },
      }));

      try {
        const updated = await productRoleService.updatePermissions(workspaceSlug, productId, roleId, newKeys);
        setPermissionByRoleId((prev) => ({ ...prev, [roleId]: { data: updated, isLoading: false, loaded: true } }));
      } catch (requestError) {
        setPermissionByRoleId((prev) => ({
          ...prev,
          [roleId]: { data: currentState.data, isLoading: false, loaded: true },
        }));
        throw requestError;
      }
    },
    [productId, workspaceSlug]
  );

  return {
    roles,
    isLoading,
    error,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    loadRolePermissions,
    getRolePermissionState,
    togglePermission,
  };
};
