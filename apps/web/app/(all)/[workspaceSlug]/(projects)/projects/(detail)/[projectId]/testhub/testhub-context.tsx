"use client";

import React, { createContext, useContext, useRef, useState } from "react";

type TTestHubContext = {
  registerOpenNewModal: (fn: () => void) => void;
  triggerOpenNewModal: () => void;
  registerOpenNewPlanModal: (fn: () => void) => void;
  triggerOpenNewPlanModal: () => void;
  registerOpenNewReviewModal: (fn: () => void) => void;
  triggerOpenNewReviewModal: () => void;
  registerOpenNewReportModal: (fn: () => void) => void;
  triggerOpenNewReportModal: () => void;
  registerOverviewSearch: (fn: (query: string) => void) => void;
  triggerOverviewSearch: (query: string) => void;
  overviewSearchValue: string;
  setOverviewSearchValue: (value: string) => void;
  registerPlanSearch: (fn: (query: string) => void) => void;
  triggerPlanSearch: (query: string) => void;
  planSearchValue: string;
  setPlanSearchValue: (value: string) => void;
  registerReviewSearch: (fn: (query: string) => void) => void;
  triggerReviewSearch: (query: string) => void;
  reviewSearchValue: string;
  setReviewSearchValue: (value: string) => void;
  registerReportSearch: (fn: (query: string) => void) => void;
  triggerReportSearch: (query: string) => void;
  reportSearchValue: string;
  setReportSearchValue: (value: string) => void;
};

const TestHubContext = createContext<TTestHubContext>({
  registerOpenNewModal: () => {},
  triggerOpenNewModal: () => {},
  registerOpenNewPlanModal: () => {},
  triggerOpenNewPlanModal: () => {},
  registerOpenNewReviewModal: () => {},
  triggerOpenNewReviewModal: () => {},
  registerOpenNewReportModal: () => {},
  triggerOpenNewReportModal: () => {},
  registerOverviewSearch: () => {},
  triggerOverviewSearch: () => {},
  overviewSearchValue: "",
  setOverviewSearchValue: () => {},
  registerPlanSearch: () => {},
  triggerPlanSearch: () => {},
  planSearchValue: "",
  setPlanSearchValue: () => {},
  registerReviewSearch: () => {},
  triggerReviewSearch: () => {},
  reviewSearchValue: "",
  setReviewSearchValue: () => {},
  registerReportSearch: () => {},
  triggerReportSearch: () => {},
  reportSearchValue: "",
  setReportSearchValue: () => {},
});

export const TestHubProvider = ({ children }: { children: React.ReactNode }) => {
  const openNewModalRef = useRef<(() => void) | null>(null);
  const openNewPlanModalRef = useRef<(() => void) | null>(null);
  const openNewReviewModalRef = useRef<(() => void) | null>(null);
  const openNewReportModalRef = useRef<(() => void) | null>(null);
  const overviewSearchRef = useRef<((query: string) => void) | null>(null);
  const planSearchRef = useRef<((query: string) => void) | null>(null);
  const reviewSearchRef = useRef<((query: string) => void) | null>(null);
  const reportSearchRef = useRef<((query: string) => void) | null>(null);
  const [overviewSearchValue, setOverviewSearchValue] = useState<string>("");
  const [planSearchValue, setPlanSearchValue] = useState<string>("");
  const [reviewSearchValue, setReviewSearchValue] = useState<string>("");
  const [reportSearchValue, setReportSearchValue] = useState<string>("");

  const registerOpenNewModal = (fn: () => void) => {
    openNewModalRef.current = fn;
  };
  const triggerOpenNewModal = () => {
    openNewModalRef.current?.();
  };

  const registerOpenNewPlanModal = (fn: () => void) => {
    openNewPlanModalRef.current = fn;
  };
  const triggerOpenNewPlanModal = () => {
    openNewPlanModalRef.current?.();
  };

  const registerOpenNewReviewModal = (fn: () => void) => {
    openNewReviewModalRef.current = fn;
  };
  const triggerOpenNewReviewModal = () => {
    openNewReviewModalRef.current?.();
  };

  const registerOpenNewReportModal = (fn: () => void) => {
    openNewReportModalRef.current = fn;
  };
  const triggerOpenNewReportModal = () => {
    openNewReportModalRef.current?.();
  };

  const registerOverviewSearch = (fn: (query: string) => void) => {
    overviewSearchRef.current = fn;
  };
  const triggerOverviewSearch = (query: string) => {
    overviewSearchRef.current?.(query);
  };

  const registerPlanSearch = (fn: (query: string) => void) => {
    planSearchRef.current = fn;
  };
  const triggerPlanSearch = (query: string) => {
    planSearchRef.current?.(query);
  };

  const registerReviewSearch = (fn: (query: string) => void) => {
    reviewSearchRef.current = fn;
  };
  const triggerReviewSearch = (query: string) => {
    reviewSearchRef.current?.(query);
  };

  const registerReportSearch = (fn: (query: string) => void) => {
    reportSearchRef.current = fn;
  };
  const triggerReportSearch = (query: string) => {
    reportSearchRef.current?.(query);
  };

  return (
    <TestHubContext.Provider
      value={{
        registerOpenNewModal,
        triggerOpenNewModal,
        registerOpenNewPlanModal,
        triggerOpenNewPlanModal,
        registerOpenNewReviewModal,
        triggerOpenNewReviewModal,
        registerOpenNewReportModal,
        triggerOpenNewReportModal,
        registerOverviewSearch,
        triggerOverviewSearch,
        overviewSearchValue,
        setOverviewSearchValue,
        registerPlanSearch,
        triggerPlanSearch,
        planSearchValue,
        setPlanSearchValue,
        registerReviewSearch,
        triggerReviewSearch,
        reviewSearchValue,
        setReviewSearchValue,
        registerReportSearch,
        triggerReportSearch,
        reportSearchValue,
        setReportSearchValue,
      }}
    >
      {children}
    </TestHubContext.Provider>
  );
};

export const useTestHub = () => useContext(TestHubContext);
