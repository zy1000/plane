/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TDataScope, TDataScopeEntry, TDataScopeMode } from "@plane/types";
import { Spinner } from "@plane/ui";
import { dataScopeEntryHasConditions, useDataScopePreview } from "@/hooks/store/use-data-scope-editor";
import { DATA_SCOPE_MODE_LABELS } from "../helpers";
import { PermissionGroupSegmented } from "../ui";
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

/** 一段白名单：左边标题 + 当前命中数，右边「全部 / 指定 / 按条件」和对应的内容 */
function DataScopeSection(props: {
  workspaceSlug: string;
  kind: "projects" | "products";
  entry: TDataScopeEntry;
  onChange: (entry: TDataScopeEntry) => void;
  readOnly?: boolean;
}) {
  const { workspaceSlug, kind, entry, onChange, readOnly } = props;
  const { t } = useTranslation();
  const { preview, isLoading, error } = useDataScopePreview(workspaceSlug, kind, entry);
  const FilterBuilder = kind === "projects" ? ProjectScopeFilterBuilder : ProductScopeFilterBuilder;
  const noCondition = entry.mode === "filter" && !dataScopeEntryHasConditions(entry.filter);
  const count = entry.mode === "selected" ? entry.ids.length : noCondition ? null : preview?.count;

  return (
    <section className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-xl border border-subtle bg-surface-1 px-7 py-6 md:grid-cols-[180px_minmax(0,1fr)]">
      <div>
        <h3 className="text-16 font-semibold text-primary">{t(`${I18N}.${kind}`)}</h3>
        <div className="mt-4 flex items-center gap-2 text-32 leading-tight font-semibold text-primary tabular-nums">
          {count ?? "—"}
          {isLoading && <Spinner height="16px" width="16px" />}
        </div>
        <p className="mt-0.5 text-13 text-tertiary">{kind === "projects" ? "个项目可见" : "个产品可见"}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <PermissionGroupSegmented<TDataScopeMode>
          items={MODES.map((mode) => ({ key: mode, label: DATA_SCOPE_MODE_LABELS[mode] }))}
          value={entry.mode}
          onChange={(mode) => onChange(withMode(entry, mode))}
          disabled={readOnly}
          size="lg"
        />

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
          <FilterBuilder
            workspaceSlug={workspaceSlug}
            value={entry.filter}
            onChange={(filter) => onChange({ mode: "filter", filter })}
            readOnly={readOnly}
          />
        )}
        {noCondition ? (
          <p className="text-13 text-placeholder">{t(`${I18N}.no_condition`)}</p>
        ) : (
          <DataScopePreview kind={kind} mode={entry.mode} preview={preview} error={error} />
        )}
      </div>
    </section>
  );
}

/** 权限组详情「数据权限」页签：项目、产品两段白名单，各自「全部 / 指定 / 按条件」 */
export function DataScopeTab({ workspaceSlug, value, onChange, readOnly }: Props) {
  return (
    <div className="flex flex-col gap-4">
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
