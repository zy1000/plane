"use client";

import { useRef, useState } from "react";
import { Button } from "@plane/propel/button";
import { Card } from "@plane/ui";
import type { EditorRefApi } from "@plane/editor";
import { isCommentEmpty } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
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
  const [html, setHtml] = useState<string>(summaryHtml || "<p></p>");
  const [json, setJson] = useState<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    try {
      setSaving(true);
      await onSave(html, json);
      setDirty(false);
      qaCaseSetToastSuccess("报告总结已保存");
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-primary">报告总结</h3>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={saving}
          disabled={saving || !dirty || isCommentEmpty(html)}
        >
          保存
        </Button>
      </div>
      <LiteTextEditor
        editable
        ref={editorRef}
        id={`test_report_summary_${reportId}`}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        value={summaryHtml || "<p></p>"}
        initialValue={summaryHtml || "<p></p>"}
        placeholder="请输入报告总结..."
        showAccessSpecifier={false}
        showToolbarInitially
        containerClassName="!p-0"
        parentClassName="border-none"
        displayConfig={{ fontSize: "small-font" }}
        onChange={(comment_json, comment_html) => {
          setHtml(comment_html);
          setJson(comment_json);
          setDirty(comment_html !== (summaryHtml || "<p></p>"));
        }}
      />
    </Card>
  );
};
