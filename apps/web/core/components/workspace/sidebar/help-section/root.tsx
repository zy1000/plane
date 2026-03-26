/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { BookText, HelpCircle, MessagesSquare, Sparkles } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { PageIcon } from "@plane/propel/icons";
// ui
import { CustomMenu } from "@plane/ui";
// components
import { AppSidebarItem } from "@/components/sidebar/sidebar-item";
// hooks
import { useChatSupport } from "@/hooks/use-chat-support";
import packageJson from "package.json";

export const HelpMenuRoot = observer(function HelpMenuRoot() {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = typeof params.workspaceSlug === "string" ? params.workspaceSlug : params.workspaceSlug?.[0];
  // store hooks
  const { t } = useTranslation();
  const { openChatSupport, isEnabled: isChatSupportEnabled } = useChatSupport();
  // states
  const [isNeedHelpOpen, setIsNeedHelpOpen] = useState(false);

  return (
    <CustomMenu
        customButton={
          <AppSidebarItem
            variant="button"
            item={{
              icon: <HelpCircle className="size-5" />,
              isActive: isNeedHelpOpen,
            }}
          />
        }
        // customButtonClassName="relative grid place-items-center rounded-md p-1.5 outline-none"
        menuButtonOnClick={() => !isNeedHelpOpen && setIsNeedHelpOpen(true)}
        onMenuClose={() => setIsNeedHelpOpen(false)}
        placement="bottom-end"
        maxHeight="lg"
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={() => window.open("https://go.plane.so/p-docs", "_blank")}>
          <div className="flex items-center gap-x-2 rounded-sm text-11">
            <PageIcon className="h-3.5 w-3.5 text-secondary" height={14} width={14} />
            <span className="text-11">用户手册</span>
          </div>
        </CustomMenu.MenuItem>
        {workspaceSlug && (
          <CustomMenu.MenuItem
            onClick={() => {
              router.push(`/${workspaceSlug}/releasenote`);
            }}
          >
            <div className="flex items-center gap-x-2 rounded-sm text-11">
              <BookText className="h-3.5 w-3.5 shrink-0 text-secondary" />
              <span className="text-11">更新日志</span>
            </div>
          </CustomMenu.MenuItem>
        )}
        {isChatSupportEnabled && (
          <CustomMenu.MenuItem>
            <button
              type="button"
              onClick={openChatSupport}
              className="flex w-full items-center gap-x-2 rounded-sm text-11 hover:bg-layer-1"
            >
              <MessagesSquare className="h-3.5 w-3.5 text-secondary" />
              <span className="text-11">{t("message_support")}</span>
            </button>
          </CustomMenu.MenuItem>
        )}
        <div className="px-1 pt-2 text-11 text-secondary">
          <div className="flex items-center gap-x-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-secondary" />
            <span>
              最新版本 v{packageJson.version}
            </span>
          </div>
        </div>
      </CustomMenu>
  );
});
