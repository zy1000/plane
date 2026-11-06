/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { ProfileInitiatedView } from "@/components/profile/work/initiated-view";

export default function ProfileInitiatedPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHead title={`${t("profile.page_label")} · ${t("profile.tabs.initiated")}`} />
      <ProfileInitiatedView />
    </>
  );
}
