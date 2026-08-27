import { useCallback, useEffect, useState } from "react";
import type { TCreateProductRolePayload, TProductRole, TUpdateProductRolePayload } from "@plane/types";
import { ProductRoleService } from "@/services/product-role.service";

const productRoleService = new ProductRoleService();

const upsertRole = (roles: TProductRole[], roleToUpsert: TProductRole) => {
  const roleIndex = roles.findIndex((role) => role.id === roleToUpsert.id);
  if (roleIndex === -1) return [roleToUpsert, ...roles];
  return roles.map((role) => (role.id === roleToUpsert.id ? roleToUpsert : role));
};

export const useProductRoles = (workspaceSlug: string | undefined, productId: string | undefined) => {
  const [roles, setRoles] = useState<TProductRole[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [error, setError] = useState<unknown>(null);

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
      return response;
    },
    [productId, workspaceSlug]
  );

  const deleteRole = useCallback(
    async (roleId: number) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      await productRoleService.deleteRole(workspaceSlug, productId, roleId);
      setRoles((current) => current.filter((role) => role.id !== roleId));
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
  };
};
