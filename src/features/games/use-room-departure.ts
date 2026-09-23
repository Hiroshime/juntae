"use client";

import { useCallback, useEffect, useRef } from "react";

export function useRoomDeparture(actionsUrl: string, enabled: boolean) {
  const enabledRef = useRef(enabled);
  const departureSent = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const markDeparted = useCallback(() => {
    departureSent.current = true;
  }, []);

  const depart = useCallback(() => {
    if (!enabledRef.current || departureSent.current) return;
    departureSent.current = true;
    const body = JSON.stringify({ action: "LEAVE" });
    const payload = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(actionsUrl, payload)) return;
    void fetch(actionsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  }, [actionsUrl]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin !== current.origin ||
        destination.pathname !== current.pathname ||
        destination.search !== current.search
      )
        depart();
    };
    const onPageHide = () => depart();
    const onHistoryNavigation = () => depart();
    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("popstate", onHistoryNavigation);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("popstate", onHistoryNavigation);
    };
  }, [depart]);

  return { markDeparted };
}
