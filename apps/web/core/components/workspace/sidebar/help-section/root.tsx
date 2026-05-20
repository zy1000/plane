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
import { cn } from "@plane/utils";
import { DOCS_URL } from "@plane/constants";
// ui
import { CustomMenu } from "@plane/ui";
// hooks
import { useChatSupport } from "@/hooks/use-chat-support";
import packageJson from "package.json";

type HelpMenuRootProps = {
  showLabel?: boolean;
};

export const HelpMenuRoot = observer(function HelpMenuRoot({ showLabel = false }: HelpMenuRootProps) {
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
        className={showLabel ? "relative w-full" : undefined}
        customButtonClassName={cn(
          showLabel &&
            "group relative flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md px-2 py-1 outline-none",
          showLabel &&
            (isNeedHelpOpen
              ? "!bg-layer-transparent-active text-primary"
              : "text-secondary hover:bg-layer-transparent-hover active:bg-layer-transparent-active")
        )}
        customButton={
          showLabel ? (
            <div className="flex min-w-0 items-center gap-1.5 py-[1px]">
              <HelpCircle className="size-5 shrink-0" />
              <p className="truncate text-13 leading-5 font-medium">{t("sidebar.help")}</p>
            </div>
          ) : (
            <div
              className={cn("flex items-center justify-center gap-2 size-8 rounded-md text-tertiary", {
                "bg-layer-transparent-selected text-secondary !text-icon-primary": isNeedHelpOpen,
                "group-hover:text-icon-secondary group-hover:bg-layer-transparent-hover !text-icon-tertiary":
                  !isNeedHelpOpen,
              })}
            >
              <HelpCircle className="size-5" />
            </div>
          )
        }
        menuButtonOnClick={() => !isNeedHelpOpen && setIsNeedHelpOpen(true)}
        onMenuClose={() => setIsNeedHelpOpen(false)}
        placement="bottom-end"
        maxHeight="lg"
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={() => window.open(DOCS_URL, "_blank", "noopener,noreferrer")}>
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
