import { useEffect, useMemo, useState } from "react";
import { releasenoteService } from "../services/releasenote.service";
import type { IReleasenoteItem } from "../types";

type Props = {
  userId?: string;
};

export const useReleasenoteModal = ({ userId }: Props) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [latest, setLatest] = useState<IReleasenoteItem | null>(null);

  const storageKey = useMemo(() => (userId ? `releasenote_read_${userId}` : null), [userId]);

  useEffect(() => {
    if (!userId || !storageKey) {
      setIsLoading(false);
      return;
    }

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        const latestReleasenote = await releasenoteService.getLatestReleasenote();
        if (!latestReleasenote?.id) {
          setIsLoading(false);
          return;
        }

        setLatest(latestReleasenote);
        const localReadId = window.localStorage.getItem(storageKey);
        const shouldOpen = localReadId !== latestReleasenote.id && !latestReleasenote.is_read;

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
    await releasenoteService.markReleasenoteAsRead(latest.id);
    window.localStorage.setItem(storageKey, latest.id);
  };

  const closeModal = async () => {
    await markAsRead();
    setIsOpen(false);
  };

  return { isLoading, isOpen, latest, closeModal, markAsRead };
};
