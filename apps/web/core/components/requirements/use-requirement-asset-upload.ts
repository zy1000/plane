import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { EFileAssetType } from "@plane/types";
import type { TRequirementAssetRef } from "@plane/types";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";

/**
 * 需求附件 / 图片字段的上传器。
 *
 * 资源挂在**归属实体**上而不是行上：产品需求传 productId，标准库条目传 libraryId。
 * 所以行还没建出来也能先传 —— 建行弹窗正是靠这一点，在确定之前就能选文件。
 *
 * 网格与建行弹窗共用一份：两边都要把 File 换成 TRequirementAssetRef，只是弹窗多一层
 * 「取消就把孤儿资源删掉」的登记（那套在弹窗自己里，见 requirement-create-modal.tsx）。
 * 网格不需要 —— 单元格改动即时落库，传完就已经有归属了。
 */
export const useRequirementAssetUpload = ({
  workspaceSlug,
  entityId,
}: {
  workspaceSlug: string;
  entityId: string;
}) => {
  const { uploadEditorAsset } = useEditorAsset();

  return useCallback(
    async (file: globalThis.File, imageOnly: boolean): Promise<TRequirementAssetRef> => {
      if (imageOnly && !file.type.startsWith("image/")) throw new Error("Only images are supported.");
      const response = await uploadEditorAsset({
        blockId: uuidv4(),
        data: {
          entity_identifier: entityId,
          entity_type: EFileAssetType.REQUIREMENT_ATTACHMENT,
        },
        file,
        workspaceSlug,
      });
      return {
        asset_id: response.asset_id,
        name: file.name,
        type: file.type,
        size: file.size,
      };
    },
    [entityId, uploadEditorAsset, workspaceSlug]
  );
};
