import { Calendar, ChevronDown, Table2 } from "lucide-react";
import { cn } from "@plane/utils";
import type { TStructuredField } from "@/services/requirement-structure.service";

const controlBase =
  "flex h-8 w-full items-center rounded-md border border-subtle bg-surface-1 px-2.5 text-11 text-placeholder";

function MockControl({ field }: { field: TStructuredField }) {
  switch (field.field_type) {
    case "auto_id": {
      const prefix = String(field.config.prefix || "PR").toUpperCase();
      return (
        <span className="font-mono inline-flex items-center gap-1.5 rounded-md bg-accent-primary/10 px-2 py-1 text-11 text-accent-primary">
          {prefix}1 · 自动发号
        </span>
      );
    }
    case "boolean":
      return (
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-subtle bg-surface-1 px-2.5 py-1 text-11 text-secondary">是</span>
          <span className="rounded-md border border-subtle bg-surface-1 px-2.5 py-1 text-11 text-placeholder">否</span>
        </div>
      );
    case "date":
      return (
        <div className={cn(controlBase, "justify-between")}>
          <span>选择日期</span>
          <Calendar className="size-3.5" />
        </div>
      );
    case "number":
    case "number_range": {
      const unit = field.config.unit ? ` ${String(field.config.unit)}` : "";
      return (
        <div className={controlBase}>{field.field_type === "number_range" ? `最小值 ~ 最大值${unit}` : `数值${unit}`}</div>
      );
    }
    case "select": {
      const options = field.options.options ?? [];
      const multiple = field.config.selection_mode === "multiple";
      if (options.length === 0) return <div className={controlBase}>未配置选项</div>;
      if (multiple)
        return (
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <span
                key={option.key}
                className="rounded-md border border-subtle bg-surface-1 px-2 py-0.5 text-10 text-secondary"
              >
                {option.label}
              </span>
            ))}
          </div>
        );
      return (
        <div className={cn(controlBase, "justify-between")}>
          <span>{options[0]?.label ?? "请选择"}</span>
          <ChevronDown className="size-3.5" />
        </div>
      );
    }
    case "text":
      if (field.config.multiline)
        return <div className={cn(controlBase, "h-12 items-start py-1.5")}>多行文本…</div>;
      return <div className={controlBase}>请输入</div>;
    default:
      return <div className={controlBase}>请输入</div>;
  }
}

type Props = {
  fields: TStructuredField[];
};

export function RequirementTemplatePreview(props: Props) {
  const { fields } = props;
  const activeFields = fields.filter((field) => field.is_active !== false);
  const rootFields = activeFields.filter((field) => !field.parent_key);
  const valueFields = rootFields.filter((field) => field.field_type !== "table");
  const tableFields = rootFields.filter((field) => field.field_type === "table");

  if (rootFields.length === 0) {
    return (
      <div className="grid place-items-center rounded-lg border border-dashed border-subtle bg-layer-1 px-4 py-8 text-center">
        <p className="text-11 text-tertiary">添加字段后，这里会实时预览需求录入时的样子。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {valueFields.map((field) => (
        <div key={field.key}>
          <div className="mb-1 flex items-center gap-1 text-11 font-medium text-primary">
            <span className="truncate">{field.name || "未命名字段"}</span>
            {field.is_required && <span className="text-danger-primary">*</span>}
          </div>
          {field.description ? <p className="mb-1.5 text-10 leading-4 text-tertiary">{field.description}</p> : null}
          <MockControl field={field} />
        </div>
      ))}

      {tableFields.map((tableField) => {
        const childFields = activeFields.filter((field) => field.parent_key === tableField.key);
        return (
          <div key={tableField.key}>
            <div className="mb-1.5 flex items-center gap-1.5 text-11 font-medium text-primary">
              <Table2 className="size-3.5 text-accent-primary" />
              <span className="truncate">{tableField.name || "未命名子表"}</span>
              {tableField.is_required && <span className="text-danger-primary">*</span>}
            </div>
            <div className="overflow-hidden rounded-md border border-subtle">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-10">
                  <thead className="bg-layer-1 text-tertiary">
                    <tr>
                      {childFields.length === 0 ? (
                        <th className="px-2 py-1.5 font-medium">（未定义子字段）</th>
                      ) : (
                        childFields.map((child) => (
                          <th key={child.key} className="whitespace-nowrap px-2 py-1.5 font-medium">
                            {child.name || "字段"}
                            {child.config.unit ? (
                              <span className="font-normal text-placeholder"> ({String(child.config.unit)})</span>
                            ) : null}
                            {child.is_required ? <span className="text-danger-primary"> *</span> : null}
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-subtle text-placeholder">
                      {childFields.length === 0 ? (
                        <td className="px-2 py-1.5">—</td>
                      ) : (
                        childFields.map((child) => (
                          <td key={child.key} className="px-2 py-1.5">
                            …
                          </td>
                        ))
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
