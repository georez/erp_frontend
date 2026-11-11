'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

/**
 * The dashboard's confirmation dialog, in place of the browser's window.confirm: one for the whole page (the dashboard
 * layout), opened through {@link useConfirm}. A question asked while another is open replaces it, which then counts
 * as cancelled.
 */
export function ConfirmProvider({ children }) {
  // The question stays while the dialog closes, so its text doesn't vanish during the closing animation
  const [question, setQuestion] = useState(null);
  const [open, setOpen] = useState(false);
  const resolveRef = useRef(null);
  const answerRef = useRef(false);
  const confirmRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolveRef.current?.(false);
    resolveRef.current = resolve;
    setQuestion(options);
    setOpen(true);
  }), []);

  const answer = (confirmed) => {
    answerRef.current = confirmed;
    setOpen(false);
  };

  // Answered once the dialog has closed and given the focus back to where it was before (its focus trap does that as
  // it closes), so the caller may move it after: the entry row's product, once a line is sent
  useEffect(() => {
    if (!open && resolveRef.current) {
      resolveRef.current(answerRef.current);
      resolveRef.current = null;
    }
  }, [open]);

  return <ConfirmContext.Provider value={confirm}>
    {children}
    {/*
      * The confirming button is focused once the dialog has opened, as well as by autoFocus: in development React
      * mounts the dialog's focus trap twice, and the second mount focuses the dialog itself, after autoFocus
      */}
    <Dialog open={open} onClose={() => answer(false)} fullWidth maxWidth="xs"
      slotProps={{ transition: { onEntered: () => confirmRef.current?.focus() } }}>
      <DialogTitle>{question?.title}</DialogTitle>
      {question?.message && <DialogContent>
        {/* Lines of the message (a list of products) stay on lines of their own */}
        <DialogContentText sx={{ whiteSpace: 'pre-line' }}>{question.message}</DialogContentText>
      </DialogContent>}
      <DialogActions>
        <Button onClick={() => answer(false)}>إلغاء</Button>
        {/* Focused, as the browser's OK was: Enter confirms, Esc cancels */}
        <Button ref={confirmRef} variant="contained" color={question?.color ?? 'primary'} autoFocus
          onClick={() => answer(true)}>
          {question?.confirmLabel ?? 'تأكيد'}
        </Button>
      </DialogActions>
    </Dialog>
  </ConfirmContext.Provider>;
}

/**
 * The function that asks the user to confirm: confirm({ title, message, confirmLabel, color }) opens the dialog and
 * resolves to true when they confirm, false when they cancel or close it.
 *
 * @returns {(question: { title: string, message?: string, confirmLabel?: string, color?: string }) => Promise<boolean>}
 *   title: the question ("حذف السجل رقم 4؟"); message: what it means, its lines kept; confirmLabel: the confirming
 *   button's text ("تأكيد" by default); color: that button's ("error" for a delete, "success" for posting)
 */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (confirm == null) {
    throw new Error('useConfirm needs a ConfirmProvider above it (the dashboard layout)');
  }
  return confirm;
}
