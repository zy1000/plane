"use client";

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { Modal } from "antd";
import { BookOpen, Maximize2 } from "lucide-react";
import { EFileAssetType } from "@plane/types";
import { Loader } from "@plane/ui";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  value: string | null | undefined;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxHeightClass?: string;
};

const DEFAULT_EMPTY_HTML = "<p></p>";

export const ProjectDescriptionFormEditor: React.FC<Props> = observer((props) => {
  const {
    workspaceSlug,
    projectId,
    value,
    onChange,
    disabled,
    placeholder = "输入项目描述",
    maxHeightClass = "max-h-[260px] min-h-[102px]",
  } = props;

  const [isFullscreen, setIsFullscreen] = useState(false);
  // Bumped whenever the fullscreen modal closes, so the inline editor remounts with the latest value.
  const [inlineEditorVersion, setInlineEditorVersion] = useState(0);

  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString();

  const initialValue = value?.trim() ? value : DEFAULT_EMPTY_HTML;

  const handleUploadFile = useCallback(
    async (blockId: string, file: File) => {
      try {
        const { asset_id } = await uploadEditorAsset({
          blockId,
          data: {
            entity_identifier: projectId,
            entity_type: EFileAssetType.PROJECT_DESCRIPTION,
          },
          file,
          projectId,
          workspaceSlug,
        });
        return asset_id;
      } catch (error) {
        console.log("Error in uploading project asset:", error);
        throw new Error("Asset upload failed. Please try again later.");
      }
    },
    [uploadEditorAsset, projectId, workspaceSlug]
  );

  const handleDuplicateFile = useCallback(
    async (assetId: string) => {
      try {
        const { asset_id } = await duplicateEditorAsset({
          assetId,
          entityId: projectId,
          entityType: EFileAssetType.PROJECT_DESCRIPTION,
          projectId,
          workspaceSlug,
        });
        return asset_id;
      } catch (error) {
        console.log("Error in duplicating project asset:", error);
        throw new Error("Asset duplication failed. Please try again later.");
      }
    },
    [duplicateEditorAsset, projectId, workspaceSlug]
  );

  const openFullscreen = () => setIsFullscreen(true);
  const closeFullscreen = () => {
    setIsFullscreen(false);
    setInlineEditorVersion((v) => v + 1);
  };

  if (!workspaceId) {
    return (
      <Loader>
        <Loader.Item height="102px" />
      </Loader>
    );
  }

  const commonEditorProps = {
    editable: !disabled,
    workspaceSlug,
    workspaceId,
    projectId,
    dragDropEnabled: !disabled,
    placeholder,
    searchMentionCallback: async (payload: Parameters<typeof workspaceService.searchEntity>[1]) =>
      await workspaceService.searchEntity(workspaceSlug, {
        ...payload,
        project_id: projectId,
      }),
    uploadFile: handleUploadFile,
    duplicateFile: handleDuplicateFile,
  } as const;

  return (
    <>
      <div className="relative rounded-md border-[0.5px] border-subtle-1 bg-layer-2">
        <button
          type="button"
          onClick={openFullscreen}
          className="absolute right-2 top-2 z-10 inline-flex cursor-pointer items-center justify-center rounded-md bg-layer-2/80 p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
          aria-label="放大"
          title="放大"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        {!isFullscreen ? (
          <div
            className={`w-full overflow-y-auto vertical-scrollbar scrollbar-sm ${maxHeightClass}`}
          >
            <RichTextEditor
              key={`inline-${projectId}-${inlineEditorVersion}`}
              id={projectId}
              initialValue={initialValue}
              value={null}
              onChange={(_json: object, html: string) => onChange(html)}
              containerClassName="pt-2 pr-8 text-13 font-medium"
              {...commonEditorProps}
            />
          </div>
        ) : (
          <div
            className={`flex w-full items-center justify-center px-3 text-13 text-placeholder ${maxHeightClass}`}
          >
            描述正在全屏编辑中，关闭弹窗后会回到此处。
          </div>
        )}
      </div>

      <Modal
        title={
          <div className="flex min-h-11 items-center gap-2 pr-2">
            <BookOpen className="h-4 w-4 shrink-0 text-placeholder" />
            <span className="text-base font-medium text-primary">编辑项目描述</span>
          </div>
        }
        open={isFullscreen}
        onCancel={closeFullscreen}
        closable
        footer={null}
        centered
        width="min(96vw, 1400px)"
        classNames={{
          header: "!mb-0 border-b border-subtle",
          body: "!p-0",
        }}
        styles={{
          content: { padding: 0 },
          header: { padding: "16px 20px" },
          body: { padding: 0 },
        }}
        className="[&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:inline-flex [&_.ant-modal-close]:!h-auto [&_.ant-modal-close]:!w-auto [&_.ant-modal-close]:items-center [&_.ant-modal-close]:justify-center [&_.ant-modal-close]:rounded-md [&_.ant-modal-close]:px-2 [&_.ant-modal-close]:py-1.5 [&_.ant-modal-close]:transition-colors [&_.ant-modal-close]:hover:!bg-surface-2 [&_.ant-modal-close]:hover:!text-primary"
        destroyOnClose
        getContainer={() => document.body}
      >
        <div className="flex max-h-[94vh] min-h-[min(72vh,680px)] flex-col overflow-y-auto vertical-scrollbar scrollbar-sm p-3">
          <RichTextEditor
            key={`modal-${projectId}-${inlineEditorVersion}`}
            id={projectId}
            initialValue={initialValue}
            value={null}
            onChange={(_json: object, html: string) => onChange(html)}
            containerClassName="text-13 font-medium"
            {...commonEditorProps}
          />
        </div>
      </Modal>
    </>
  );
});
