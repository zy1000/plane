/**
 * 评审页的模板视图切换器。
 *
 * 产品需求是多个模板的拼接：每行明细只属于一个模板，字段定义也各自归属模板。把所有
 * 模板的字段并集成一张表，结果是每行只填得满自己那几列、其余全是空洞的超宽表格，而且
 * 各模板都有内置的标题/描述，表头会出现多组同名列。所以这里把模板提为第一级维度：
 * 切模板 = 换一套表头和数据集。
 *
 * 徽标里的计数只算明细行（字段定义组不分页，另有分节展示）。单模板需求不渲染。
 * 变更/对比视图给三态计数，版本快照没有「变更」概念，改用 total 显示行数。
 */
import { useCallback, useRef } from "react";
import { Table2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

export type TChangeTemplateTab = {
  id: string;
  /** 模板已被删除时为空串 */
  title: string;
  created_count?: number;
  updated_count?: number;
  deleted_count?: number;
  /** 快照视图用：该模板的行数 */
  total?: number;
};

type TProps = {
  templates: TChangeTemplateTab[];
  activeTemplateId: string;
  onChange: (templateId: string) => void;
};

const COUNT_TONES = [
  { key: "created_count", marker: "+", className: "text-success-primary" },
  { key: "updated_count", marker: "~", className: "text-warning-primary" },
  { key: "deleted_count", marker: "−", className: "text-danger-primary" },
] as const;

export function ChangeTemplateTabs({ templates, activeTemplateId, onChange }: TProps) {
  const { t } = useTranslation();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + offset + templates.length) % templates.length;
      tabRefs.current[nextIndex]?.focus();
    },
    [templates.length]
  );

  if (templates.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label={t("workspace_products.requirements.change.templates.label")}
      className="flex min-w-0 items-center gap-1 overflow-x-auto"
    >
      {templates.map((template, index) => {
        const isActive = template.id === activeTemplateId;
        return (
          <button
            key={template.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onChange(template.id)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-12 font-medium transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong",
              isActive ? "bg-layer-2 text-primary" : "text-secondary hover:bg-layer-1 hover:text-primary"
            )}
          >
            <Table2 className="size-3.5 shrink-0" />
            <span className="max-w-[160px] truncate">
              {template.title || t("workspace_products.requirements.change.templates.untitled")}
            </span>
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              {template.total !== undefined ? (
                <span className="text-11 text-tertiary">{template.total}</span>
              ) : (
                COUNT_TONES.map(({ key, marker, className }) =>
                  (template[key] ?? 0) > 0 ? (
                    <span key={key} className={cn("text-11", className)}>
                      {marker}
                      {template[key]}
                    </span>
                  ) : null
                )
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
