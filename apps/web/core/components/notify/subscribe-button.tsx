/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useUser } from "@/hooks/store/user";
import { useNotifySubscribers } from "@/hooks/use-notify-subscribers";
import type { TNotifyEntityType } from "@/types/notify";

type Props = {
  workspaceSlug: string;
  projectId: string;
  entityType: TNotifyEntityType;
  entityId: string;
};

/** 页头的「订阅 / 取消订阅」：把自己加进这个对象的订阅人（默认每日摘要），或者移除 */
export const NotifySubscribeButton = observer(function NotifySubscribeButton(props: Props) {
  const { workspaceSlug, projectId, entityType, entityId } = props;
  const { data: currentUser } = useUser();
  const { subscribers, isLoading, addSubscribers, removeSubscriber } = useNotifySubscribers(
    workspaceSlug,
    projectId,
    entityType,
    entityId
  );
  const [isBusy, setIsBusy] = useState(false);
  const mine = subscribers.find((subscriber) => subscriber.subscriber_id === currentUser?.id);

  const handleClick = async () => {
    if (!currentUser?.id) return;
    setIsBusy(true);
    try {
      if (mine) await removeSubscriber(mine.id);
      else await addSubscribers([currentUser.id], "digest");
      setToast({ type: TOAST_TYPE.SUCCESS, title: mine ? "已取消订阅" : "已订阅" });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: "请稍后重试" });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Button variant="secondary" size="lg" disabled={isLoading} loading={isBusy} onClick={() => void handleClick()}>
      {mine ? "取消订阅" : "订阅"}
    </Button>
  );
});
