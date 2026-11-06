/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LayoutList } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TUserWorkType } from "@/types/user-work";
import { ProfileRelationRail } from "../relation-rail";
import { WORK_TYPE_ICON, sortTypes, workTypeLabel } from "./work-types";

export const WORK_TYPE_ALL = "all";

/** 左栏「工作类型」：全部 + 各启用的类型，带条数；复用个人主页原来的分组栏外壳 */
export function WorkTypeRail({
  types,
  counts,
  selected,
  onSelect,
}: {
  types: TUserWorkType[];
  counts: Partial<Record<TUserWorkType, number>>;
  selected: string;
  onSelect: (type: string) => void;
}) {
  const { t } = useTranslation();
  const ordered = sortTypes(types);
  const total = ordered.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
  const items = [
    { id: WORK_TYPE_ALL, name: t("profile.work.all_types"), icon: <LayoutList className="size-4" />, count: total },
    ...ordered.map((type) => {
      const Icon = WORK_TYPE_ICON[type];
      return { id: type, name: workTypeLabel(t, type), icon: <Icon className="size-4" />, count: counts[type] ?? 0 };
    }),
  ];
  return <ProfileRelationRail heading={t("profile.work.type_rail_title")} items={items} selectedId={selected} onSelect={onSelect} />;
}
