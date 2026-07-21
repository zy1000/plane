import { useCallback, useRef } from "react";
import { EFileAssetType } from "@plane/types";
import { getAssetIdFromUrl } from "@plane/utils";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { FileService } from "@/services/file.service";

const fileService = new FileService();

const extractAssetIds = (html: string) => {
  if (typeof DOMParser === "undefined") return new Set<string>();
  const document = new DOMParser().parseFromString(html, "text/html");
  return new Set(
    Array.from(document.querySelectorAll("image-component"))
      .map((node) => node.getAttribute("src"))
      .filter((src): src is string => Boolean(src))
      .map(getAssetIdFromUrl)
  );
};

export const useProductEditorAssets = ({ entityId, workspaceSlug }: { entityId: string; workspaceSlug: string }) => {
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const sessionAssetIds = useRef(new Set<string>());
  const deferredDeleteIds = useRef(new Set<string>());

  const cleanupAssets = useCallback(
    async (assetIds: Iterable<string>) => {
      await Promise.allSettled(
        Array.from(new Set(assetIds)).map((assetId) => fileService.deleteWorkspaceAsset(workspaceSlug, assetId))
      );
    },
    [workspaceSlug]
  );

  const handleUpload = useCallback(
    async (blockId: string, file: File) => {
      const { asset_id } = await uploadEditorAsset({
        blockId,
        data: {
          entity_identifier: entityId,
          entity_type: EFileAssetType.PRODUCT_DESCRIPTION,
        },
        file,
        workspaceSlug,
      });
      sessionAssetIds.current.add(asset_id);
      return asset_id;
    },
    [entityId, uploadEditorAsset, workspaceSlug]
  );

  const handleDuplicate = useCallback(
    async (assetId: string) => {
      const response = await duplicateEditorAsset({
        assetId,
        entityId,
        entityType: EFileAssetType.PRODUCT_DESCRIPTION,
        workspaceSlug,
      });
      sessionAssetIds.current.add(response.asset_id);
      return response.asset_id;
    },
    [duplicateEditorAsset, entityId, workspaceSlug]
  );

  const handleDeferredAssetDelete = useCallback(async (assetSrc: string) => {
    deferredDeleteIds.current.add(getAssetIdFromUrl(assetSrc));
  }, []);

  const getActiveSessionAssetIds = useCallback((html: string) => {
    const activeAssetIds = extractAssetIds(html);
    return Array.from(sessionAssetIds.current).filter((assetId) => activeAssetIds.has(assetId));
  }, []);

  const bindActiveSessionAssets = useCallback(
    async (productId: string, html: string) => {
      const activeSessionAssetIds = getActiveSessionAssetIds(html);
      if (activeSessionAssetIds.length === 0) return;
      await fileService.updateBulkWorkspaceAssetsUploadStatus(workspaceSlug, productId, {
        asset_ids: activeSessionAssetIds,
      });
    },
    [getActiveSessionAssetIds, workspaceSlug]
  );

  const cleanupSessionAssets = useCallback(async () => {
    const pendingAssetIds = Array.from(sessionAssetIds.current);
    sessionAssetIds.current.clear();
    deferredDeleteIds.current.clear();
    await cleanupAssets(pendingAssetIds);
  }, [cleanupAssets]);

  const commitAssets = useCallback(
    async (html: string) => {
      const activeAssetIds = extractAssetIds(html);
      const removedAssetIds = new Set<string>();
      deferredDeleteIds.current.forEach((assetId) => {
        if (!activeAssetIds.has(assetId)) removedAssetIds.add(assetId);
      });
      sessionAssetIds.current.forEach((assetId) => {
        if (!activeAssetIds.has(assetId)) removedAssetIds.add(assetId);
      });
      sessionAssetIds.current.clear();
      deferredDeleteIds.current.clear();
      await cleanupAssets(removedAssetIds);
    },
    [cleanupAssets]
  );

  const resetAssets = useCallback(() => {
    sessionAssetIds.current.clear();
    deferredDeleteIds.current.clear();
  }, []);

  return {
    bindActiveSessionAssets,
    cleanupSessionAssets,
    commitAssets,
    getActiveSessionAssetIds,
    handleDeferredAssetDelete,
    handleDuplicate,
    handleUpload,
    resetAssets,
  };
};
