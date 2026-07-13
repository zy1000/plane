import { useCallback } from "react";
import { observer } from "mobx-react";
import { EFileAssetType } from "@plane/types";
import { Loader } from "@plane/ui";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();
const EMPTY_DESCRIPTION = "<p></p>";

type Props = {
  workspaceSlug: string;
  productId?: string;
  value?: string | null;
  editable: boolean;
  placeholder?: string;
  onChange?: (value: string) => void;
  onAssetUpload?: (assetId: string) => void;
};

export const ProductDescriptionEditor = observer(function ProductDescriptionEditor(props: Props) {
  const {
    editable,
    onAssetUpload,
    onChange,
    placeholder = "输入产品描述，可插入图片或附件",
    productId,
    value,
    workspaceSlug,
  } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const { duplicateEditorAsset, uploadEditorAsset } = useEditorAsset();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString();
  const initialValue = value?.trim() ? value : EMPTY_DESCRIPTION;

  const uploadFile = useCallback(
    async (blockId: string, file: File) => {
      const { asset_id } = await uploadEditorAsset({
        blockId,
        data: {
          entity_identifier: productId ?? "",
          entity_type: EFileAssetType.PRODUCT_DESCRIPTION,
        },
        file,
        productId,
        workspaceSlug,
      });
      onAssetUpload?.(asset_id);
      return asset_id;
    },
    [onAssetUpload, productId, uploadEditorAsset, workspaceSlug]
  );

  const duplicateFile = useCallback(
    async (assetId: string) => {
      const { asset_id } = await duplicateEditorAsset({
        assetId,
        entityId: productId,
        entityType: EFileAssetType.PRODUCT_DESCRIPTION,
        productId,
        workspaceSlug,
      });
      onAssetUpload?.(asset_id);
      return asset_id;
    },
    [duplicateEditorAsset, onAssetUpload, productId, workspaceSlug]
  );

  if (!workspaceId)
    return (
      <Loader className="min-h-36 rounded-md border border-subtle">
        <Loader.Item height="144px" />
      </Loader>
    );

  if (!editable)
    return (
      <RichTextEditor
        id={`product-description-${productId ?? "draft"}`}
        editable={false}
        initialValue={initialValue}
        value={initialValue}
        onChange={() => undefined}
        productId={productId}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        containerClassName="min-h-28 pr-3 pt-2 text-13"
      />
    );

  return (
    <div className="vertical-scrollbar scrollbar-sm max-h-80 min-h-36 overflow-y-auto rounded-md border border-subtle bg-layer-2">
      <RichTextEditor
        key={productId ?? "draft"}
        id={`product-description-${productId ?? "draft"}`}
        editable
        initialValue={initialValue}
        value={null}
        productId={productId}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        dragDropEnabled
        onChange={(_json, html) => onChange?.(html)}
        placeholder={placeholder}
        searchMentionCallback={(payload) => workspaceService.searchEntity(workspaceSlug, payload)}
        uploadFile={uploadFile}
        duplicateFile={duplicateFile}
        containerClassName="min-h-36 pr-3 pt-2 text-13"
      />
    </div>
  );
});
