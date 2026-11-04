/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TDataScopeEntry } from "@plane/types";
import { Spinner } from "@plane/ui";
import { dataScopeEntryHasConditions, useDataScopePreview } from "@/hooks/store/use-data-scope-editor";

const I18N = "workspace_settings.settings.roles.data_scope";

type Props = {
  workspaceSlug: string;
  kind: "projects" | "products";
  entry: TDataScopeEntry;
};

/** 「当前命中 N 个」+ 前几条，草稿变了 400ms 后问后端 */
export function DataScopePreview({ workspaceSlug, kind, entry }: Props) {
  const { t } = useTranslation();
  const { preview, isLoading, error } = useDataScopePreview(workspaceSlug, kind, entry);
  const kindLabel = t(`${I18N}.${kind}`);

  if (entry.mode === "all") return null;
  if (entry.mode === "filter" && !dataScopeEntryHasConditions(entry.filter))
    return <p className="text-12 text-placeholder">{t(`${I18N}.no_condition`)}</p>;

  return (
    <div className="flex flex-col gap-1 text-12 leading-4">
      <span className="flex items-center gap-1.5 text-secondary">
        {isLoading && <Spinner height="12px" width="12px" />}
        {error ? (
          <span className="text-danger-primary">{error}</span>
        ) : preview ? (
          <span className="tabular-nums">{t(`${I18N}.matched`, { count: preview.count, kind: kindLabel })}</span>
        ) : null}
      </span>
      {preview && preview.items.length > 0 && (
        <span className="truncate text-placeholder">
          {preview.items
            .slice(0, 6)
            .map((item) => item.name)
            .join("、")}
          {preview.count > 6 ? " …" : ""}
        </span>
      )}
    </div>
  );
}
