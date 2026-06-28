/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { useParams } from "next/navigation";

// ui
import { useTranslation } from "@plane/i18n";
import { UserCirclePropertyIcon, CreateIcon, LayerStackIcon, OverdueDatePropertyIcon } from "@plane/propel/icons";
import type { IUserProfileData } from "@plane/types";
import { Loader } from "@plane/ui";
// types

type Props = {
  userProfile: IUserProfileData | undefined;
};

export function ProfileStats({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();

  const { t } = useTranslation();

  const overviewCards = [
    {
      icon: CreateIcon,
      route: "created",
      i18n_title: "profile.stats.created",
      value: userProfile?.created_issues ?? "...",
    },
    {
      icon: UserCirclePropertyIcon,
      route: "assigned",
      i18n_title: "profile.stats.assigned",
      value: userProfile?.assigned_issues ?? "...",
    },
    {
      icon: LayerStackIcon,
      route: "subscribed",
      i18n_title: "profile.stats.subscribed",
      value: userProfile?.subscribed_issues ?? "...",
    },
    {
      icon: OverdueDatePropertyIcon,
      route: "overdue",
      i18n_title: "profile.stats.overdue",
      value: userProfile?.overdue_issues ?? "...",
    },
  ];

  return (
    <section className="rounded-2xl border border-subtle bg-surface-1 p-5">
      <h3 className="text-16 font-medium">{t("profile.stats.overview")}</h3>
      {userProfile ? (
        <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-subtle bg-surface-2 md:grid-cols-2">
          {overviewCards.map((card) => (
            <Link
              key={card.i18n_title}
              href={`/${workspaceSlug}/profile/${userId}/${card.route}`}
              className="flex items-center gap-3 bg-surface-1 p-4 transition-colors hover:bg-surface-2"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2">
                <card.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-12 text-placeholder">{t(card.i18n_title)}</p>
                <p className="text-18 font-semibold text-primary">{card.value}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Loader className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Loader.Item height="72px" />
          <Loader.Item height="72px" />
          <Loader.Item height="72px" />
          <Loader.Item height="72px" />
        </Loader>
      )}
    </section>
  );
}
