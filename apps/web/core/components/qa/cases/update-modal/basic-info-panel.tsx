"use client";
import React from "react";
import { useParams } from "next/navigation";
import { Button, Dropdown, Table, Tooltip, Modal } from "antd";
import { DownOutlined, EditOutlined } from "@ant-design/icons";
import * as LucideIcons from "lucide-react";
import { convertBytesToSize, renderFormattedDate } from "@plane/utils";
import { StepsEditor } from "../util";
// plane imports
import { EFileAssetType } from "@plane/types";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { WorkspaceService } from "@/services/workspace.service";

type BasicInfoPanelProps = {
  caseId: string;
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

  attachmentsLoading: boolean;
  caseAttachments: any[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPickAttachments: () => void;
  onFilesChosen: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadAttachment: (attachment: any) => void;
  onRemoveCaseAttachment: (id: string) => void;
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
    attachmentsLoading,
    caseAttachments,
    fileInputRef,
    onPickAttachments,
    onFilesChosen,
    onDownloadAttachment,
    onRemoveCaseAttachment,
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
      <div className="space-y-8 rounded-b-md border-subtle px-6 py-6 transition-colors ring-1 ring-transparent focus-within:border-accent-subtle focus-within:ring-accent-subtle">
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
      <section
        aria-labelledby="attachments-title"
        aria-busy={attachmentsLoading}
        className="transition-colors"
        role="group"
      >
        <div className="mb-3 flex items-center justify-between">
          <span id="attachments-title" className="flex items-center gap-2 text-sm font-semibold text-secondary">
            附件
          </span>
          <Tooltip title="上传文件">
            <Button
              type="text"
              aria-label="上传附件"
              icon={<LucideIcons.Upload size={16} className="text-secondary hover:text-accent-primary" aria-hidden="true" />}
              onClick={onPickAttachments}
            />
          </Tooltip>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          aria-hidden="true"
          onChange={onFilesChosen}
        />
        <div className="mt-2">
          <Table
            size="small"
            loading={attachmentsLoading}
            rowKey={(r: any) => String(r?.id ?? "")}
            dataSource={caseAttachments}
            pagination={false}
            rowClassName={() => "hover:bg-layer-1-hover"}
            onRow={(record: any) => ({
              tabIndex: 0,
              onKeyDown: (e) => {
                if ((e as React.KeyboardEvent).key === "Enter") onDownloadAttachment(record);
              },
            })}
            columns={[
              {
                title: "名称",
                dataIndex: ["attributes", "name"],
                render: (_: any, record: any) => {
                  const name = String(record?.attributes?.name ?? record?.asset ?? "-");
                  const sizeNum = Number(record?.attributes?.size ?? 0);
                  const sizeText = (() => {
                    try {
                      return convertBytesToSize(sizeNum);
                    } catch {
                      return `${(sizeNum / 1024).toFixed(2)}KB`;
                    }
                  })();
                  const mime: string = String(record?.attributes?.type ?? "");
                  const icon = (() => {
                    if (mime.startsWith("image/"))
                      return <LucideIcons.Image size={16} className="text-tertiary" aria-hidden="true" />;
                    if (mime.startsWith("video/"))
                      return <LucideIcons.Video size={16} className="text-tertiary" aria-hidden="true" />;
                    if (mime.startsWith("audio/"))
                      return <LucideIcons.Music size={16} className="text-tertiary" aria-hidden="true" />;
                    if (
                      mime === "text/plain" ||
                      mime === "application/pdf" ||
                      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    )
                      return <LucideIcons.FileText size={16} className="text-tertiary" aria-hidden="true" />;
                    if (
                      [
                        "application/zip",
                        "application/x-zip",
                        "application/x-zip-compressed",
                        "application/x-7z-compressed",
                        "application/x-rar",
                        "application/x-rar-compressed",
                        "application/x-tar",
                        "application/gzip",
                      ].includes(mime)
                    )
                      return <LucideIcons.Archive size={16} className="text-tertiary" aria-hidden="true" />;
                    return <LucideIcons.File size={16} className="text-tertiary" aria-hidden="true" />;
                  })();
                  return (
                    <div className="flex items-center gap-2 min-w-0">
                      {icon}
                      <span className="truncate max-w-[360px] text-sm text-secondary">{name}</span>
                      <span className="text-xs text-tertiary">{sizeText}</span>
                    </div>
                  );
                },
              },
              {
                title: "类型",
                dataIndex: ["attributes", "type"],
                render: (v: any) => {
                  const mime = String(v ?? "");
                  if (mime.startsWith("image/")) return "图片";
                  if (mime.startsWith("video/")) return "视频";
                  if (mime.startsWith("audio/")) return "音频";
                  if (mime === "text/plain") return "文本";
                  if (mime === "application/pdf") return "PDF文档";
                  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "Word";
                  return "-";
                },
              },
              {
                title: "上传时间",
                dataIndex: "created_at",
                render: (v: any) => {
                  const dt = String(v ?? "");
                  try {
                    return renderFormattedDate(dt, "YYYY年MM月DD日");
                  } catch {
                    return dt;
                  }
                },
              },
              {
                title: "操作",
                key: "actions",
                render: (_: any, record: any) => (
                  <div className="flex items-center gap-3">
                    <Tooltip title="下载">
                      <Button
                        type="text"
                        aria-label="下载附件"
                        icon={
                          <LucideIcons.Download
                            size={16}
                            className="text-secondary hover:text-accent-primary"
                            aria-hidden="true"
                          />
                        }
                        onClick={() =>
                          Modal.confirm({
                            title: "下载附件",
                            content: `确认下载：${String(record?.attributes?.name ?? "附件")}`,
                            onOk: () => onDownloadAttachment(record),
                          })
                        }
                      />
                    </Tooltip>
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        danger
                        aria-label="删除附件"
                        icon={
                          <LucideIcons.Trash2
                            size={16}
                            className="text-secondary hover:text-danger-primary"
                            aria-hidden="true"
                          />
                        }
                        onClick={() =>
                          Modal.confirm({
                            title: "删除附件",
                            content: `确认删除：${String(record?.attributes?.name ?? "附件")}`,
                            onOk: () => onRemoveCaseAttachment(String(record?.id ?? "")),
                          })
                        }
                      />
                    </Tooltip>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
