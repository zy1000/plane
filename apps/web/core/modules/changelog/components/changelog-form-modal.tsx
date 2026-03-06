import { useEffect, useMemo, useState } from "react";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { RichTextEditor } from "@/components/editor/rich-text";
import type { IChangelogFormPayload, IChangelogItem, TChangelogUpdateType } from "../types";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  workspaceId?: string;
  initialValue?: IChangelogItem | null;
  onClose: () => void;
  onSubmit: (payload: IChangelogFormPayload) => Promise<void>;
};

const DEFAULT_FORM: IChangelogFormPayload = {
  title: "",
  summary: "",
  description: "",
  content: "",
  version: "",
  links: [],
  screenshots: [],
  release_date: null,
  update_type: "improved",
  is_pinned: false,
  is_active: true,
};

const toDateTimeLocal = (date: string | null) => {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const ChangelogFormModal = ({ isOpen, workspaceSlug, workspaceId, initialValue, onClose, onSubmit }: Props) => {
  const [form, setForm] = useState<IChangelogFormPayload>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linksText, setLinksText] = useState("");
  const [screenshotsText, setScreenshotsText] = useState("");
  const isEdit = useMemo(() => Boolean(initialValue?.id), [initialValue?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (!initialValue) {
      setForm(DEFAULT_FORM);
      setLinksText("");
      setScreenshotsText("");
      return;
    }

    setForm({
      title: initialValue.title,
      summary: initialValue.summary,
      description: initialValue.description,
      content: initialValue.content || initialValue.description,
      version: initialValue.version,
      links: initialValue.links ?? [],
      screenshots: initialValue.screenshots ?? [],
      release_date: initialValue.release_date,
      update_type: initialValue.update_type,
      is_pinned: initialValue.is_pinned,
      is_active: initialValue.is_active,
    });
    setLinksText((initialValue.links ?? []).join("\n"));
    setScreenshotsText((initialValue.screenshots ?? []).join("\n"));
  }, [initialValue, isOpen]);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...form,
        links: linksText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        screenshots: screenshotsText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        release_date: form.release_date ? new Date(form.release_date).toISOString() : null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <div className="max-h-[80vh] overflow-y-auto p-5">
        <h3 className="text-lg font-semibold text-custom-text-100">{isEdit ? "编辑更新日志" : "新增更新日志"}</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            value={form.version}
            onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))}
            placeholder="版本号"
          />
          <Input
            type="datetime-local"
            value={toDateTimeLocal(form.release_date)}
            onChange={(e) => setForm((prev) => ({ ...prev, release_date: e.target.value }))}
          />
          <select
            className="h-9 rounded border border-custom-border-200 bg-custom-background-100 px-2 text-sm text-custom-text-200"
            value={form.update_type}
            onChange={(e) => setForm((prev) => ({ ...prev, update_type: e.target.value as TChangelogUpdateType }))}
          >
            <option value="added">新增</option>
            <option value="fixed">修复</option>
            <option value="improved">优化</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-custom-text-200">
            <input
              type="checkbox"
              checked={form.is_pinned}
              onChange={(e) => setForm((prev) => ({ ...prev, is_pinned: e.target.checked }))}
            />
            是否置顶
          </label>
        </div>
        <div className="mt-3 space-y-3">
          <Input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="标题"
          />
          <TextArea
            value={form.summary}
            onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
            placeholder="摘要"
          />
          <div className="rounded border border-custom-border-200 p-2">
            <RichTextEditor
              id="changelog-rich-editor"
              editable
              initialValue={form.content}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId ?? ""}
              onChange={(_, value) => setForm((prev) => ({ ...prev, content: value, description: value }))}
              uploadFile={async () => ""}
              duplicateFile={async () => ""}
              searchMentionCallback={async () => ({})}
              placeholder="输入更新详情"
            />
          </div>
          <TextArea
            value={linksText}
            onChange={(e) => setLinksText(e.target.value)}
            placeholder="链接（每行一个）"
          />
          <TextArea
            value={screenshotsText}
            onChange={(e) => setScreenshotsText(e.target.value)}
            placeholder="截图 URL（每行一个）"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-custom-border-200 px-3 py-1.5 text-sm text-custom-text-200"
            onClick={onClose}
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded bg-custom-primary-100 px-3 py-1.5 text-sm text-white disabled:opacity-60"
            onClick={handleSave}
            disabled={isSubmitting || !form.title || !form.version}
          >
            {isSubmitting ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </ModalCore>
  );
};
