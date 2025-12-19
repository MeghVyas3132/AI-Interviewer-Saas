"use client";

import { useEffect, useRef, useCallback } from 'react';

interface UseIdleDetectionOptions {
  timeout: number; // in milliseconds
  onIdle: () => void;
  events?: string[]; // events to listen for
  enabled?: boolean; // whether idle detection is enabled
}

const DEFAULT_EVENTS = [
  'mousedown',
  'mousemove',
  'keypress',
  'scroll',
  'touchstart',
  'click',
  'keydown',
];

export function useIdleDetection({
  timeout,
  onIdle,
  events = DEFAULT_EVENTS,
  enabled = true,
}: UseIdleDetectionOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isIdleRef = useRef(false);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      if (!isIdleRef.current) {
        isIdleRef.current = true;
        onIdle();
      }
    }, timeout);
  }, [timeout, onIdle, enabled]);

  const handleActivity = useCallback(() => {
    if (!enabled) return;
    
    isIdleRef.current = false;
    resetTimer();
  }, [enabled, resetTimer]);

  useEffect(() => {
    if (!enabled) return;

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Start the timer
    resetTimer();

    // Cleanup function
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [events, handleActivity, resetTimer, enabled]);

  // Reset idle state when enabled changes
  useEffect(() => {
    if (enabled) {
      isIdleRef.current = false;
      resetTimer();
    } else {
      isIdleRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }
  }, [enabled, resetTimer]);

  return {
    resetTimer,
    isIdle: isIdleRef.current,
  };
}
