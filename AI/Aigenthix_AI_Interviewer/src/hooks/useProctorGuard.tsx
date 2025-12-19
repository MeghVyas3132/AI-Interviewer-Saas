"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Options = {
  isProctored: boolean;
  token?: string;
  onConfirmEnd: () => Promise<void> | void;
  anyKeyTriggersConfirmation?: boolean; // optional admin toggle
  triggerKeys?: string[]; // default ['Escape']
  visibilityGraceSeconds?: number; // optional auto-pause grace
};

export function useProctorGuard({
  isProctored,
  token,
  onConfirmEnd,
  anyKeyTriggersConfirmation = false,
  triggerKeys = ["Escape"],
  visibilityGraceSeconds = 10,
}: Options) {
  const [isModalOpen, setModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const lastShownRef = useRef(0);
  const visibilityTimerRef = useRef<number | null>(null);
  const cooldownMs = 3000;

  // Log event to server (non-blocking)
  const logEvent = useCallback(
    (event: string, reason: string) => {
      if (!token) return;

      try {
        const payload = JSON.stringify({
          token,
          event,
          reason,
          timestamp: new Date().toISOString(),
        });

        // Use sendBeacon for non-blocking logging
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], {
            type: "application/json",
          });
          navigator.sendBeacon("/api/interview/log-proctor-event", blob);
        } else {
          // Fallback to fetch with keepalive
          fetch("/api/interview/log-proctor-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {
            // Silently fail - logging is non-critical
          });
        }
      } catch (error) {
        // Silently fail - logging is non-critical
        console.debug("Failed to log proctor event:", error);
      }
    },
    [token]
  );

  const shouldIgnoreEvent = useCallback(
    (e?: Event | KeyboardEvent) => {
      // Ignore if typing in inputs unless anyKeyTriggersConfirmation is true
      if (!anyKeyTriggersConfirmation && e instanceof KeyboardEvent) {
        const active = document.activeElement;
        if (active) {
          const tag = (active.tagName || "").toLowerCase();
          const editable = (active as HTMLElement).isContentEditable;

          // Ignore if in input, textarea, or contenteditable
          if (tag === "input" || tag === "textarea" || editable) {
            return true;
          }

          // Ignore if user is typing modifier keys with other keys (e.g., Ctrl+C)
          if (e.ctrlKey || e.metaKey || e.altKey) {
            return true;
          }
        }
      }

      return false;
    },
    [anyKeyTriggersConfirmation]
  );

  const tryShowModal = useCallback(
    (reason: string) => {
      const now = Date.now();
      if (now - lastShownRef.current < cooldownMs) {
        return; // Cooldown period - ignore
      }

      lastShownRef.current = now;
      setModalOpen(true);
      logEvent("proctor_modal_shown", reason);
    },
    [cooldownMs, logEvent]
  );

  useEffect(() => {
    if (!isProctored) return; // Only attach when proctored

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreEvent(e)) return;

      if (anyKeyTriggersConfirmation) {
        tryShowModal("any-key");
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (triggerKeys.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        tryShowModal(`key-${e.key.toLowerCase()}`);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        tryShowModal("visibility-hidden");
        logEvent("visibility_change", "tab_switch");

        if (visibilityGraceSeconds > 0) {
          visibilityTimerRef.current = window.setTimeout(() => {
            // Optional: Auto-pause after grace period
            // This could trigger an API call to pause the session
            logEvent("visibility_grace_expired", "auto_pause_triggered");
          }, visibilityGraceSeconds * 1000);
        }
      } else {
        // Tab became visible again - clear any pending auto-pause
        if (visibilityTimerRef.current) {
          clearTimeout(visibilityTimerRef.current);
          visibilityTimerRef.current = null;
        }
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Show native browser warning
      const message =
        "You have an ongoing proctored interview. Are you sure you want to leave?";
      e.returnValue = message;
      logEvent("beforeunload_prompt", "page_close_attempt");
      return message;
    };

    // Attach event listeners with capture phase for keydown to catch early
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current);
        visibilityTimerRef.current = null;
      }
    };
  }, [
    isProctored,
    token,
    anyKeyTriggersConfirmation,
    triggerKeys,
    visibilityGraceSeconds,
    shouldIgnoreEvent,
    tryShowModal,
    logEvent,
  ]);

  const confirmEnd = useCallback(async () => {
    if (isBusy) return;

    try {
      setIsBusy(true);
      logEvent("proctor_end_confirmed", "user_confirmed_end");
      await Promise.resolve(onConfirmEnd());
    } catch (error) {
      console.error("Error ending interview:", error);
      setIsBusy(false);
      // Don't close modal on error - let user try again
    }
  }, [isBusy, onConfirmEnd, logEvent]);

  const closeModal = useCallback(() => {
    if (isBusy) return; // Prevent closing while busy
    setModalOpen(false);
    logEvent("proctor_modal_dismissed", "user_continued");
  }, [isBusy, logEvent]);

  return {
    isModalOpen,
    isBusy,
    openModal: () => setModalOpen(true),
    closeModal,
    confirmEnd,
  };
}

