/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TDataScope, TDataScopeEntry, TDataScopeMode } from "@plane/types";
import { cn } from "@plane/utils";
import { ProductScopeFilterBuilder, ProjectScopeFilterBuilder } from "./filter-builder";
import { DataScopePreview } from "./scope-preview";
import { DataScopeSelectedPicker } from "./selected-picker";

const I18N = "workspace_settings.settings.roles.data_scope";
const MODES: TDataScopeMode[] = ["all", "selected", "filter"];

type Props = {
  workspaceSlug: string;
  value: TDataScope;
  onChange: (next: TDataScope) => void;
  readOnly?: boolean;
};

/** 切换模式时尽量保留上次填过的内容（指定的 id / 条件），只换 mode */
const withMode = (entry: TDataScopeEntry, mode: TDataScopeMode): TDataScopeEntry => {
  if (mode === "all") return { mode: "all" };
  if (mode === "selected") return { mode: "selected", ids: entry.mode === "selected" ? entry.ids : [] };
  return { mode: "filter", filter: entry.mode === "filter" ? entry.filter : {} };
};

function DataScopeSection(props: {
  workspaceSlug: string;
  kind: "projects" | "products";
  entry: TDataScopeEntry;
  onChange: (entry: TDataScopeEntry) => void;
  readOnly?: boolean;
}) {
  const { workspaceSlug, kind, entry, onChange, readOnly } = props;
  const { t } = useTranslation();
  const kindLabel = t(`${I18N}.${kind}`);
  const FilterBuilder = kind === "projects" ? ProjectScopeFilterBuilder : ProductScopeFilterBuilder;

  return (
    <section className="rounded-lg border border-subtle bg-surface-1">
      <div className="flex flex-col gap-1 border-b border-subtle px-4 py-3">
        <h3 className="text-14 font-medium text-primary">{kindLabel}</h3>
        <p className="text-12 leading-4 text-tertiary">{t(`${I18N}.${kind}_hint`)}</p>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-5" role="radiogroup">
          {MODES.map((mode) => {
            const isActive = entry.mode === mode;
            return (
              <label
                key={mode}
                className={cn("flex cursor-pointer items-center gap-2 text-13", readOnly && "cursor-default")}
              >
                <input
                  type="radio"
                  name={`data-scope-${kind}`}
                  className="size-3.5 accent-accent-primary"
                  checked={isActive}
                  disabled={readOnly}
                  onChange={() => onChange(withMode(entry, mode))}
                />
                <span className={isActive ? "font-medium text-primary" : "text-secondary"}>
                  {t(`${I18N}.mode_${mode}`)}
                </span>
                <span className="text-12 text-placeholder">{t(`${I18N}.mode_${mode}_hint`, { kind: kindLabel })}</span>
              </label>
            );
          })}
        </div>

        {entry.mode === "selected" && (
          <DataScopeSelectedPicker
            workspaceSlug={workspaceSlug}
            kind={kind}
            selectedIds={entry.ids}
            onChange={(ids) => onChange({ mode: "selected", ids })}
            readOnly={readOnly}
          />
        )}
        {entry.mode === "filter" && (
          <div className="rounded-md border border-subtle bg-layer-1 px-3 py-2">
            <FilterBuilder
              workspaceSlug={workspaceSlug}
              value={entry.filter}
              onChange={(filter) => onChange({ mode: "filter", filter })}
              readOnly={readOnly}
            />
          </div>
        )}
        <DataScopePreview workspaceSlug={workspaceSlug} kind={kind} entry={entry} />
      </div>
    </section>
  );
}

/** 权限组详情「数据权限」页签：项目、产品两段白名单，各自「全部 / 指定 / 按条件」 */
export function DataScopeTab({ workspaceSlug, value, onChange, readOnly }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-13 text-tertiary">{t(`${I18N}.description`)}</p>
      <DataScopeSection
        workspaceSlug={workspaceSlug}
        kind="projects"
        entry={value.projects}
        onChange={(projects) => onChange({ ...value, projects })}
        readOnly={readOnly}
      />
      <DataScopeSection
        workspaceSlug={workspaceSlug}
        kind="products"
        entry={value.products}
        onChange={(products) => onChange({ ...value, products })}
        readOnly={readOnly}
      />
    </div>
  );
}
