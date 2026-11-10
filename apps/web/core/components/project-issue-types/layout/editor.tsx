import { useMemo, useState } from "react";
import { Button } from "@plane/propel/button";
import type { TLayoutSave } from "@/hooks/use-issue-type-layout-editor";
import type { TIssueType, TTypeExtraField } from "@/services/project/project-issue-type.service";
import { countLayoutGroups, resolveIssueTypeLayout } from "@/utils/issue-type-layout";
import { LayoutCanvas } from "./canvas";
import { IssueTypeLayoutDesigner } from "./designer";
import { LayoutPreview } from "./preview";

type TProps = {
  issueType: TIssueType;
  fields: TTypeExtraField[];
  canEdit: boolean;
  onSave: TLayoutSave;
  onDirtyChange?: (dirty: boolean) => void;
};

/** 「布局」页签：只读展示当前布局；编辑在全屏设计器里进行，不占用这块窄区域 */
export function IssueTypeLayoutEditor({ issueType, fields, canEdit, onSave, onDirtyChange }: TProps) {
  const layout = useMemo(
    () => resolveIssueTypeLayout(issueType.field_layout, fields),
    [issueType.field_layout, fields]
  );
  const [designing, setDesigning] = useState(false);
  const [preview, setPreview] = useState(false);

  if (!fields.length) return <p className="py-10 text-center text-13 text-tertiary">当前类型暂无自定义字段</p>;
  const stats = [
    { label: "每行字段", value: layout.columns },
    { label: "分组", value: countLayoutGroups(layout) },
    { label: "页面", value: layout.pages.length },
  ];
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {stats.map((item) => (
          <span key={item.label} className="text-13 text-tertiary">
            {item.label}
            <span className="ml-1.5 text-14 font-semibold text-primary tabular-nums">{item.value}</span>
          </span>
        ))}
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="xl" className="px-3" onClick={() => setPreview(true)}>
            预览
          </Button>
          {canEdit && (
            <Button variant="primary" size="xl" className="px-3" onClick={() => setDesigning(true)}>
              编辑布局
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-2">
        <div className="min-w-[640px] px-6 pt-[22px] pb-6">
          <LayoutCanvas layout={layout} fields={fields} />
        </div>
      </div>
      {preview && <LayoutPreview layout={layout} fields={fields} onClose={() => setPreview(false)} />}
      {designing && (
        <IssueTypeLayoutDesigner
          issueType={issueType}
          fields={fields}
          onSave={onSave}
          onClose={() => setDesigning(false)}
          onDirtyChange={onDirtyChange}
        />
      )}
    </div>
  );
}
