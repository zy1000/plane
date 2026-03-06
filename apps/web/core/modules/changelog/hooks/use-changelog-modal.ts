import { useEffect, useMemo, useState } from "react";
import { changelogService } from "../services/changelog.service";
import type { IChangelogItem } from "../types";

type Props = {
  userId?: string;
};

export const useChangelogModal = ({ userId }: Props) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [latest, setLatest] = useState<IChangelogItem | null>(null);

  const storageKey = useMemo(() => (userId ? `changelog_read_${userId}` : null), [userId]);

  useEffect(() => {
    if (!userId || !storageKey) {
      setIsLoading(false);
      return;
    }

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        const latestChangelog = await changelogService.getLatestChangelog();
        if (!latestChangelog?.id) {
          setIsLoading(false);
          return;
        }

        setLatest(latestChangelog);
        const localReadId = window.localStorage.getItem(storageKey);
        const shouldOpen = localReadId !== latestChangelog.id && !latestChangelog.is_read;

        if (shouldOpen) {
          timerId = setTimeout(() => {
            setIsOpen(true);
          }, 2000);
        }
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [storageKey, userId]);

  const markAsRead = async () => {
    if (!latest?.id || !storageKey) return;
    await changelogService.markChangelogAsRead(latest.id);
    window.localStorage.setItem(storageKey, latest.id);
  };

  const closeModal = async () => {
    await markAsRead();
    setIsOpen(false);
  };

  return { isLoading, isOpen, latest, closeModal, markAsRead };
};
