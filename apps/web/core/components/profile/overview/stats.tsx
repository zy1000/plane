/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ui
import { useTranslation } from "@plane/i18n";
import {
  UserCirclePropertyIcon,
  CreateIcon,
  DueDatePropertyIcon,
  LayerStackIcon,
  OverdueDatePropertyIcon,
} from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { IUserProfileData } from "@plane/types";
import { Loader, Card, ECardSpacing, ECardDirection, ECardVariant } from "@plane/ui";
import { cn } from "@plane/utils";
// types

type Props = {
  userProfile: IUserProfileData | undefined;
};

type TOverviewCard = {
  description?: string;
  icon: ComponentType<{ className?: string }>;
  route?: string;
  title: string;
  tone: "accent" | "danger" | "neutral" | "warning";
  value: number;
};

const toneClasses: Record<TOverviewCard["tone"], string> = {
  accent: "bg-accent-subtle text-accent-primary",
  danger: "bg-danger-subtle text-danger-primary",
  neutral: "bg-surface-2 text-secondary",
  warning: "bg-warning-subtle text-warning-primary",
};

export function ProfileStats({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();

  const { t } = useTranslation();

  const overviewCards: TOverviewCard[] = [
    {
      description: t("profile.stats.today_pending_description"),
      icon: DueDatePropertyIcon,
      title: t("profile.stats.today_pending"),
      tone: (userProfile?.today_pending_issues ?? 0) > 0 ? "danger" : "neutral",
      value: userProfile?.today_pending_issues ?? 0,
    },
    {
      description: t("profile.stats.week_pending_description"),
      icon: DueDatePropertyIcon,
      title: t("profile.stats.week_pending"),
      tone: (userProfile?.week_pending_issues ?? 0) > 0 ? "warning" : "neutral",
      value: userProfile?.week_pending_issues ?? 0,
    },
    {
      icon: OverdueDatePropertyIcon,
      route: "overdue",
      title: t("profile.stats.overdue"),
      tone: (userProfile?.overdue_issues ?? 0) > 0 ? "danger" : "neutral",
      value: userProfile?.overdue_issues ?? 0,
    },
    {
      icon: UserCirclePropertyIcon,
      route: "assigned",
      title: t("profile.stats.assigned"),
      tone: "accent",
      value: userProfile?.assigned_issues ?? 0,
    },
    {
      icon: CreateIcon,
      route: "created",
      title: t("profile.stats.created"),
      tone: "neutral",
      value: userProfile?.created_issues ?? 0,
    },
    {
      icon: LayerStackIcon,
      route: "subscribed",
      title: t("profile.stats.subscribed"),
      tone: "neutral",
      value: userProfile?.subscribed_issues ?? 0,
    },
  ];

  const renderCard = (card: TOverviewCard): ReactNode => (
    <Card
      direction={ECardDirection.ROW}
      spacing={ECardSpacing.SM}
      variant={card.route ? ECardVariant.WITH_SHADOW : ECardVariant.WITHOUT_SHADOW}
      className={cn("h-full min-h-24 items-center", card.route && "transition-colors hover:bg-surface-2")}
    >
      <div className={cn("grid size-11 shrink-0 place-items-center rounded-md", toneClasses[card.tone])}>
        <card.icon className="size-5" />
      </div>
      <div className="min-w-0 space-y-1">
        {card.description ? (
          <Tooltip tooltipContent={card.description} position="top-start">
            <p className="w-fit truncate text-13 text-placeholder">{card.title}</p>
          </Tooltip>
        ) : (
          <p className="truncate text-13 text-placeholder">{card.title}</p>
        )}
        <p className="text-20 font-semibold tracking-tight text-primary">{card.value}</p>
      </div>
    </Card>
  );

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.overview")}</h3>
      {userProfile ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {overviewCards.map((card) => (
            <div key={card.title} className="h-full">
              {card.route ? (
                <Link
                  href={`/${workspaceSlug}/profile/${userId}/${card.route}`}
                  className="focus-visible:ring-accent-primary block h-full rounded-lg outline-none focus-visible:ring-2"
                >
                  {renderCard(card)}
                </Link>
              ) : (
                renderCard(card)
              )}
            </div>
          ))}
        </div>
      ) : (
        <Loader className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Loader.Item height="96px" />
          <Loader.Item height="96px" />
          <Loader.Item height="96px" />
          <Loader.Item height="96px" />
          <Loader.Item height="96px" />
          <Loader.Item height="96px" />
        </Loader>
      )}
    </div>
  );
}
