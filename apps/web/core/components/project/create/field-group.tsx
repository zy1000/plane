/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { FORM_VARIANT_STYLES } from "@/components/common/form-section";

type Props = {
  title: string;
  /** 整组都是非必填时在组名后挂「可选」标签（如描述） */
  optional?: boolean;
  children: ReactNode;
};

/** 创建弹窗的字段分组：组名靠左一列（与首行控件顶对齐），字段靠右；组与组之间一条分隔线 */
export function ProjectCreateFieldGroup(props: Props) {
  const { title, optional = false, children } = props;
  const { t } = useTranslation();
  const styles = FORM_VARIANT_STYLES["grouped-modal"];
  return (
    <section className="grid grid-cols-1 gap-y-2 border-t border-subtle py-5 md:grid-cols-[104px_minmax(0,1fr)] md:gap-x-6">
      <h3 className={cn(styles.title, "flex items-center gap-1.5 md:h-[38px]")}>
        {title}
        {optional ? <span className={styles.optionalBadge}>{t("optional")}</span> : null}
      </h3>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
