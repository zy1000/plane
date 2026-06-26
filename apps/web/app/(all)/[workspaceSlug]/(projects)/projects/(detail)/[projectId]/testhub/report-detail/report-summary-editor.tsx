"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Button } from "@plane/propel/button";
import { Card } from "@plane/ui";
import type { EditorRefApi } from "@plane/editor";
import { EFileAssetType } from "@plane/types";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { WorkspaceService } from "@/services/workspace.service";
import { useTranslation } from "@plane/i18n";
import { qaCaseSetToastError, qaCaseSetToastSuccess } from "@/utils/qa-case-error";

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  reportId: string;
  summaryHtml: string;
  onSave: (summaryHtml: string, summaryJson: unknown) => Promise<void>;
};

const EMPTY_RICH_TEXT_HTML = "<p></p>";
const MEDIA_CONTENT_REGEX =
  /<(img|image-component|video|iframe|embed|object|svg|audio)\b|data-type=["'](image|imageComponent|video)["']/i;

const normalizeRichTextHtml = (html?: string | null): string => (html && html.trim() ? html : EMPTY_RICH_TEXT_HTML);

const isEmptyRichText = (html?: string | null): boolean => {
  if (!html) return true;
  const trimmed = html.trim();
  if (!trimmed) return true;
  if (MEDIA_CONTENT_REGEX.test(trimmed)) return false;
  const text = trimmed
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return text.length === 0;
};

export const ReportSummaryEditor = ({
  workspaceId,
  workspaceSlug,
  projectId,
  reportId,
  summaryHtml,
  onSave,
}: Props) => {
  const { t } = useTranslation();
  const editorRef = useRef<EditorRefApi>(null);
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const workspaceService = useMemo(() => new WorkspaceService(), []);
  const normalizedSummaryHtml = useMemo(() => normalizeRichTextHtml(summaryHtml), [summaryHtml]);
  const hasSummaryContent = useMemo(() => !isEmptyRichText(summaryHtml), [summaryHtml]);
  const [isOpen, setIsOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [html, setHtml] = useState<string>(normalizedSummaryHtml);
  const [json, setJson] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const isDirty = html !== normalizedSummaryHtml;

  const handleUploadFile = useCallback(
    async (blockId: string | undefined, file: File) => {
      if (!workspaceSlug || !projectId) throw new Error("Missing context");
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
    },
    [projectId, uploadEditorAsset, workspaceSlug]
  );

  const handleDuplicateFile = useCallback(
    async (assetId: string) => {
      if (!workspaceSlug || !projectId) throw new Error("Missing context");
      const { asset_id } = await duplicateEditorAsset({
        assetId,
        entityId: projectId,
        entityType: EFileAssetType.PROJECT_DESCRIPTION,
        projectId,
        workspaceSlug,
      });
      return asset_id;
    },
    [duplicateEditorAsset, projectId, workspaceSlug]
  );

  const handleOpen = () => {
    setHtml(normalizedSummaryHtml);
    setJson(null);
    setEditorKey((prev) => prev + 1);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (saving) return;
    setIsOpen(false);
  };

  const handleSave = async () => {
    if (saving || !isDirty) return;
    try {
      setSaving(true);
      await onSave(html, json);
      qaCaseSetToastSuccess("报告总结已保存");
      setIsOpen(false);
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="flex h-[min(48vh,30rem)] min-h-[16rem] flex-col p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-primary">报告总结</h3>
          <Button variant="link-neutral" className="text-xs" onClick={handleOpen}>
            编辑
          </Button>
        </div>
        {hasSummaryContent ? (
          <div className="vertical-scrollbar mt-3 scrollbar-sm min-h-0 flex-1 overflow-y-auto">
            <RichTextEditor
              id={`test-report-summary-preview-${reportId}`}
              editable={false}
              initialValue={normalizedSummaryHtml}
              value={normalizedSummaryHtml}
              onChange={() => {}}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              containerClassName="!h-full !pb-0 !pl-0 text-sm leading-relaxed text-secondary"
            />
          </div>
        ) : (
          <div className="mt-3 grid min-h-0 flex-1 place-items-center text-sm text-placeholder">
            暂无报告总结，点击右上角编辑添加。
          </div>
        )}
      </Card>

      <Transition.Root show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[100]" onClose={handleClose}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-backdrop transition-opacity" />
          </Transition.Child>
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-surface-1 text-left shadow-overlay-100 transition-all sm:my-8 sm:w-full sm:max-w-4xl lg:max-w-5xl">
                  <div className="flex max-h-[min(85vh,56rem)] min-h-0 flex-col">
                    <div className="shrink-0 px-5 pt-4">
                      <h3 className="text-lg font-medium text-primary">编辑报告总结</h3>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden px-5 pt-3">
                      <div className="vertical-scrollbar scrollbar-sm h-full max-h-[min(64vh,720px)] min-h-0 overflow-x-auto overflow-y-auto rounded-md border border-subtle">
                        <RichTextEditor
                          key={`${reportId}-${editorKey}`}
                          ref={editorRef}
                          id={`test-report-summary-editor-${reportId}`}
                          editable
                          initialValue={normalizedSummaryHtml}
                          placeholder="请输入报告总结..."
                          workspaceSlug={workspaceSlug}
                          workspaceId={workspaceId}
                          projectId={projectId}
                          onChange={(commentJson, commentHtml) => {
                            setHtml(commentHtml);
                            setJson(commentJson);
                          }}
                          uploadFile={handleUploadFile}
                          duplicateFile={handleDuplicateFile}
                          searchMentionCallback={async (payload) =>
                            await workspaceService.searchEntity(workspaceSlug, {
                              ...payload,
                              project_id: projectId,
                            })
                          }
                          containerClassName="min-h-[260px] !pb-0"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex shrink-0 justify-end gap-2 px-5 pb-4">
                      <Button variant="secondary" onClick={handleClose} disabled={saving}>
                        取消
                      </Button>
                      <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving || !isDirty}>
                        确定
                      </Button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
};
