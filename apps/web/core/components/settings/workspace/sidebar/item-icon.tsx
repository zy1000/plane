/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import {
  ArrowUpToLine,
  BadgeCheck,
  BookText,
  Building,
  FolderKanban,
  Layers,
  Plug,
  ScrollText,
  ShieldCheck,
  UsersRound,
  Users,
  Webhook,
} from "lucide-react";
// plane imports
import { RequirementIcon } from "@plane/propel/icons";
import type { ISvgIcons } from "@plane/propel/icons";
import type { TWorkspaceSettingsTabs } from "@plane/types";

export const WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, LucideIcon | React.FC<ISvgIcons>> = {
  "my-access": BadgeCheck,
  general: Building,
  members: Users,
  groups: UsersRound,
  roles: ShieldCheck,
  templates: FolderKanban,
  export: ArrowUpToLine,
  webhooks: Webhook,
  integrations: Plug,
  "issue-type-categories": Layers,
  "requirement-types": RequirementIcon,
  "data-dictionaries": BookText,
  changelog: ScrollText,
};
