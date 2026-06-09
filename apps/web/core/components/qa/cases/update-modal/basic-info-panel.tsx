"use client";
import React from "react";
import { useParams } from "next/navigation";
import { Button, Dropdown } from "antd";
import { DownOutlined, EditOutlined } from "@ant-design/icons";
import { StepsEditor } from "../util";
// plane imports
import { EFileAssetType } from "@plane/types";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { WorkspaceService } from "@/services/workspace.service";

type BasicInfoPanelProps = {
  caseId?: string;
  preconditionValue: string;
  stepsValue: { description?: string; result?: string }[];
  modeValue: number;
  textDescriptionValue: string;
  textResultValue: string;
  remarkValue: string;
  onSave: (data: {
    precondition: string;
    steps: any[];
    mode: number;
    textDescription: string;
    textResult: string;
    remark: string;
  }) => Promise<void>;
  activityContent?: React.ReactNode;
};

export function BasicInfoPanel(props: BasicInfoPanelProps) {
  const {
    caseId,
    preconditionValue,
    stepsValue,
    modeValue,
    textDescriptionValue,
    textResultValue,
    remarkValue,
    onSave,
    activityContent,
  } = props;

  const [isEditing, setIsEditing] = React.useState(false);
  const [localPrecondition, setLocalPrecondition] = React.useState(preconditionValue);
  const [localSteps, setLocalSteps] = React.useState(stepsValue);
  const [localMode, setLocalMode] = React.useState<number>(modeValue ?? 0);
  const [localTextDescription, setLocalTextDescription] = React.useState(textDescriptionValue ?? "");
  const [localTextResult, setLocalTextResult] = React.useState(textResultValue ?? "");
  const [localRemark, setLocalRemark] = React.useState(remarkValue);

  // plane hooks
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug?: string; projectId?: string };
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = workspaceSlug ? getWorkspaceBySlug(workspaceSlug)?.id : undefined;
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const workspaceService = React.useMemo(() => new WorkspaceService(), []);

  const handleUploadFile = async (blockId: string | undefined, file: File) => {
    if (!workspaceSlug || !projectId || !caseId) throw new Error("Missing context");
    try {
      const { asset_id } = await uploadEditorAsset({
        blockId: blockId ?? "",
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
      console.error("Upload failed", error);
      throw new Error("Upload failed");
    }
  };

  const handleDuplicateFile = async (assetId: string) => {
    if (!workspaceSlug || !projectId || !caseId) throw new Error("Missing context");
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
      console.error("Duplicate failed", error);
      throw new Error("Duplicate failed");
    }
  };

  React.useEffect(() => {
    if (!isEditing) {
      setLocalPrecondition(preconditionValue);
      setLocalSteps(stepsValue);
      setLocalMode(modeValue ?? 0);
      setLocalTextDescription(textDescriptionValue ?? "");
      setLocalTextResult(textResultValue ?? "");
      setLocalRemark(remarkValue);
    }
  }, [preconditionValue, stepsValue, modeValue, textDescriptionValue, textResultValue, remarkValue]);

  const handleSave = async () => {
    await onSave({
      precondition: localPrecondition,
      steps: localSteps,
      mode: localMode,
      textDescription: localTextDescription,
      textResult: localTextResult,
      remark: localRemark,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalPrecondition(preconditionValue);
    setLocalSteps(stepsValue);
    setLocalMode(modeValue ?? 0);
    setLocalTextDescription(textDescriptionValue ?? "");
    setLocalTextResult(textResultValue ?? "");
    setLocalRemark(remarkValue);
    setIsEditing(false);
  };

  return (
    <div className="space-y-8 rounded-b-md border-subtle px-6 py-6 transition-colors ring-1 ring-transparent">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-semibold text-secondary">
            前置条件
          </label>
          {!isEditing && (
            <Button
              type="link"
              onClick={() => setIsEditing(true)}
              className="transition-all"
            >
              <EditOutlined />
              编辑用例
            </Button>
          )}
        </div>
        <RichTextEditor
          id="qa-precondition-editor"
          placeholder='请输入前置条件'
          editable={isEditing}
          initialValue={localPrecondition ?? ""}
          value={isEditing ? undefined : (localPrecondition ?? "")}
          workspaceSlug={workspaceSlug ?? ""}
          workspaceId={workspaceId ?? ""}
          projectId={projectId ?? ""}
          onChange={(_: any, val: string) => setLocalPrecondition(val)}
          uploadFile={handleUploadFile}
          duplicateFile={handleDuplicateFile}
          searchMentionCallback={async (payload) =>
            await workspaceService.searchEntity(workspaceSlug?.toString() ?? "", {
              ...payload,
              project_id: projectId?.toString() ?? "",
            })
          }
          containerClassName="min-h-[100px] rounded-md"
        />
      </div>
      <div>
        {localMode === 1 ? (
          <div className="space-y-8">
            <div>
              <div className="mb-3 flex items-center justify-between gap-6">
                <label className="flex items-center gap-2 text-sm font-semibold text-secondary">文本描述</label>
                <Dropdown
                  trigger={["click"]}
                  overlayStyle={{ zIndex: 1200 }}
                  menu={{
                    selectable: true,
                    selectedKeys: [localMode === 1 ? "text" : "step"],
                    items: [
                      { key: "step", label: "步骤描述" },
                      { key: "text", label: "文本描述" },
                    ],
                    onClick: ({ key }) => {
                      setLocalMode(key === "text" ? 1 : 0);
                    },
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    className="px-0 text-sm font-medium text-tertiary hover:text-secondary"
                  >
                    更改类型 <DownOutlined />
                  </Button>
                </Dropdown>
              </div>
              <RichTextEditor
                id="qa-text-description-editor"
                editable={isEditing}
                placeholder='请输入文本描述'
                initialValue={localTextDescription ?? ""}
                value={isEditing ? undefined : (localTextDescription ?? "")}
                workspaceSlug={workspaceSlug ?? ""}
                workspaceId={workspaceId ?? ""}
                projectId={projectId ?? ""}
                onChange={(_: any, val: string) => setLocalTextDescription(val)}
                uploadFile={handleUploadFile}
                duplicateFile={handleDuplicateFile}
                searchMentionCallback={async (payload) =>
                  await workspaceService.searchEntity(workspaceSlug?.toString() ?? "", {
                    ...payload,
                    project_id: projectId?.toString() ?? "",
                  })
                }
                containerClassName="min-h-[100px] rounded-md"
              />
            </div>
            <div>
              <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-secondary">预期结果</label>
              <RichTextEditor
                id="qa-text-result-editor"
                editable={isEditing}
                placeholder='请输入预期结果'
                initialValue={localTextResult ?? ""}
                value={isEditing ? undefined : (localTextResult ?? "")}
                workspaceSlug={workspaceSlug ?? ""}
                workspaceId={workspaceId ?? ""}
                projectId={projectId ?? ""}
                onChange={(_: any, val: string) => setLocalTextResult(val)}
                uploadFile={handleUploadFile}
                duplicateFile={handleDuplicateFile}
                searchMentionCallback={async (payload) =>
                  await workspaceService.searchEntity(workspaceSlug?.toString() ?? "", {
                    ...payload,
                    project_id: projectId?.toString() ?? "",
                  })
                }
                containerClassName="min-h-[100px] rounded-md"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-6">
              <label className="flex items-center gap-2 text-sm font-semibold text-secondary">测试步骤</label>
              <Dropdown
                trigger={["click"]}
                overlayStyle={{ zIndex: 1200 }}
                menu={{
                  selectable: true,
                  selectedKeys: [localMode === 1 ? "text" : "step"],
                  items: [
                    { key: "step", label: "步骤描述" },
                    { key: "text", label: "文本描述" },
                  ],
                  onClick: ({ key }) => {
                    setLocalMode(key === "text" ? 1 : 0);
                  },
                }}
              >
                <Button
                  type="text"
                  size="small"
                  className="px-0 text-sm font-medium text-tertiary hover:text-secondary"
                >
                  更改类型 <DownOutlined />
                </Button>
              </Dropdown>
            </div>
            <StepsEditor value={localSteps} onChange={setLocalSteps} editable={isEditing} aria-label="测试步骤" />
          </>
        )}
      </div>
      <div>
        <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-secondary">
          备注
        </label>
        <RichTextEditor
          id="qa-remark-editor"
          editable={isEditing}
          placeholder='请输入备注'
          initialValue={localRemark ?? ""}
          value={isEditing ? undefined : (localRemark ?? "")}
          workspaceSlug={workspaceSlug ?? ""}
          workspaceId={workspaceId ?? ""}
          projectId={projectId ?? ""}
          onChange={(_: any, val: string) => setLocalRemark(val)}
          uploadFile={handleUploadFile}
          duplicateFile={handleDuplicateFile}
          searchMentionCallback={async (payload) =>
            await workspaceService.searchEntity(workspaceSlug?.toString() ?? "", {
              ...payload,
              project_id: projectId?.toString() ?? "",
            })
          }
          containerClassName="min-h-[100px] rounded-md"
        />
        {isEditing && (
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSave}>
              保存
            </Button>
          </div>
        )}
      </div>
      {activityContent && <section className="transition-colors">{activityContent}</section>}
    </div>
  );
}
