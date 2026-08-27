/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { PageHead } from "@/components/core/page-title";
import { ProfileRequirementsPage } from "@/components/profile/requirements/profile-requirements-page";

export default function ProfileRequirementsTabPage() {
  return (
    <>
      <PageHead title="Profile - Requirements" />
      <ProfileRequirementsPage />
    </>
  );
}
