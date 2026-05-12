/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TIssueTypeCategory = {
  id: string;
  workspace: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
};
