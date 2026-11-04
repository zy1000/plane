/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Search } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Checkbox, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import { ProductService } from "@/services/product.service";

const I18N = "workspace_settings.settings.roles.data_scope";
const productService = new ProductService();

type TOption = { id: string; name: string; identifier: string; archived?: boolean };

type Props = {
  workspaceSlug: string;
  kind: "projects" | "products";
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  readOnly?: boolean;
};

/** 「指定」模式的候选：项目来自已加载的项目表，产品拉一次列表 */
const useScopeOptions = (workspaceSlug: string, kind: "projects" | "products") => {
  const { totalProjectIds, getProjectById } = useProject();
  const [products, setProducts] = useState<TOption[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (kind !== "products") return;
    let cancelled = false;
    setIsLoading(true);
    productService
      .list(workspaceSlug)
      .then((rows) => {
        if (!cancelled)
          setProducts(rows.map((row) => ({ id: row.id, name: row.name, identifier: row.code || row.identifier })));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, kind]);

  const projectOptions = useMemo<TOption[]>(
    () =>
      (totalProjectIds ?? [])
        .map((id) => getProjectById(id))
        .filter((project): project is NonNullable<typeof project> => Boolean(project))
        .map((project) => ({
          id: project.id,
          name: project.name,
          identifier: project.identifier,
          archived: Boolean(project.archived_at),
        })),
    [totalProjectIds, getProjectById]
  );

  return { options: kind === "projects" ? projectOptions : (products ?? []), isLoading: kind === "products" && isLoading };
};

/** 带搜索的多选表格：名称 + 代号，勾选即进白名单 */
export const DataScopeSelectedPicker = observer(function DataScopeSelectedPicker(props: Props) {
  const { workspaceSlug, kind, selectedIds, onChange, readOnly } = props;
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { options, isLoading } = useScopeOptions(workspaceSlug, kind);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const keyword = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const rows = keyword
      ? options.filter(
          (option) =>
            option.name.toLowerCase().includes(keyword) || option.identifier.toLowerCase().includes(keyword)
        )
      : options;
    // 已选的排前面，方便回看
    return [...rows].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)));
  }, [options, keyword, selected]);

  const toggle = (id: string) => {
    if (readOnly) return;
    onChange(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-64 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
          <Search className="size-3.5 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={t(`${I18N}.search`, { kind: t(`${I18N}.${kind}`) })}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="ml-auto text-12 text-tertiary tabular-nums">
          {t(`${I18N}.selected_count`, { count: selectedIds.length })}
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-subtle bg-surface-1">
        {isLoading && options.length === 0 ? (
          <Loader className="flex flex-col gap-2 p-3">
            {[0, 1, 2].map((index) => (
              <Loader.Item key={index} height="28px" />
            ))}
          </Loader>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-13 text-placeholder">{t(`${I18N}.no_match`)}</p>
        ) : (
          visible.map((option) => {
            const isChecked = selected.has(option.id);
            return (
              <label
                key={option.id}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-3 border-b border-subtle px-3 text-13 last:border-b-0 hover:bg-layer-1-hover",
                  readOnly && "cursor-default"
                )}
              >
                <Checkbox checked={isChecked} onChange={() => toggle(option.id)} disabled={readOnly} />
                <span className="min-w-0 flex-1 truncate text-primary">{option.name}</span>
                <span className="shrink-0 text-12 text-tertiary">{option.identifier}</span>
                {option.archived && <span className="shrink-0 text-11 text-placeholder">{t(`${I18N}.archived`)}</span>}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
});
