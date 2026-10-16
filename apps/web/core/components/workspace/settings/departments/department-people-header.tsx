import { useTranslation } from "@plane/i18n";
import { DEPARTMENTS_I18N as I18N } from "./helpers";
import type { TDepartmentSelection } from "./helpers";

type Props = {
  selection: TDepartmentSelection;
  onSelect: (department: string | null) => void;
};

/** 右栏头部：四级显示父级面包屑；三级显示子部门 chip；未分配部门给一句来由 */
export function DepartmentPeopleHeader(props: Props) {
  const { selection, onSelect } = props;
  const { t } = useTranslation();

  const title =
    selection.kind === "all"
      ? t(`${I18N}.tree.all`)
      : selection.kind === "unassigned"
        ? t(`${I18N}.tree.unassigned`)
        : selection.node.name;
  const count = selection.kind === "all" || selection.kind === "unassigned" ? selection.count : selection.node.count;
  const countLabel =
    selection.kind === "center" && selection.node.children.length > 0
      ? t(`${I18N}.people.center_count`, { count, departments: selection.node.children.length })
      : t(`${I18N}.people.count`, { count });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {selection.kind === "department" && (
          <div className="flex items-center gap-1.5 text-12 text-tertiary">
            <button type="button" onClick={() => onSelect(selection.parent.id)} className="text-secondary hover:text-primary hover:underline">
              {selection.parent.name}
            </button>
            <span>/</span>
          </div>
        )}
        <div className="flex items-baseline gap-3">
          <h2 className="text-18 font-semibold text-primary">{title}</h2>
          <span className="text-14 text-secondary">{countLabel}</span>
        </div>
      </div>
      {selection.kind === "center" && selection.node.children.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selection.node.children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => onSelect(child.id)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-subtle bg-surface-1 px-3 text-13 text-secondary transition-colors hover:border-strong hover:text-primary"
            >
              {child.name}
              <span className="tabular-nums text-tertiary">{child.count}</span>
            </button>
          ))}
        </div>
      )}
      {selection.kind === "unassigned" && <p className="text-13 text-tertiary">{t(`${I18N}.people.unassigned_hint`)}</p>}
    </div>
  );
}
