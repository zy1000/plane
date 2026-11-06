/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { ProfilePendingView } from "@/components/profile/work/pending-view";

export default function ProfilePendingPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHead title={`${t("profile.page_label")} · ${t("profile.tabs.pending")}`} />
      <ProfilePendingView />
    </>
  );
}
