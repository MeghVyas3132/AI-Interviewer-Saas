"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirmEnd: () => Promise<void> | void;
  busy?: boolean;
};

export default function ProctorExitConfirmModal({
  open,
  onClose,
  onConfirmEnd,
  busy,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val && !busy) onClose();
      }}
    >
      <DialogContent
        aria-describedby="proctor-exit-description"
        className="sm:max-w-[425px]"
        onEscapeKeyDown={(e) => {
          // Prevent closing modal with Escape key in proctored mode
          e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          // Prevent closing modal by clicking outside in proctored mode
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          // Prevent closing modal by clicking outside in proctored mode
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Confirm action</DialogTitle>
        </DialogHeader>
        <p
          id="proctor-exit-description"
          className="mt-2 text-sm text-muted-foreground"
        >
          Are you sure you want to end the interview? Your responses will be
          submitted and you will not be able to continue.
        </p>
        <DialogFooter className="mt-4 flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={busy}
            aria-label="Continue Interview"
          >
            Continue Interview
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirmEnd}
            disabled={busy}
            aria-label="End Interview"
          >
            {busy ? "Ending..." : "End Interview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


