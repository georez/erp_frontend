'use client';

import { Alert, AlertTitle, Snackbar, Stack } from '@mui/material';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

// Long enough to read a message while typing on; the timer stops while the mouse is over the toast
const SHOWN_FOR_MS = 10 * 1000;

/**
 * The dashboard's toasts: error messages shown over the page's corner, so a form's fields don't move while the user
 * types on (a document's refused line, say). One for the whole page (the dashboard layout), opened through
 * {@link useToast}. Each one goes after a while, or when closed; those shown together stack.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const showError = useCallback((title, message) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((shown) => [...shown, { id, title, message }]);
  }, []);

  const close = (id) => setToasts((shown) => shown.filter((toast) => toast.id !== id));

  return <ToastContext.Provider value={showError}>
    {children}
    <Stack spacing={1} sx={{
      position: 'fixed', bottom: 16, insetInlineEnd: 16, zIndex: (theme) => theme.zIndex.snackbar,
      width: 'min(420px, calc(100vw - 32px))',
    }}>
      {toasts.map((toast) => (
        // Only the timer closes it, not a click elsewhere or Esc: those belong to the form being typed in
        <Snackbar key={toast.id} open autoHideDuration={SHOWN_FOR_MS} sx={{ position: 'static', transform: 'none' }}
          onClose={(event, reason) => reason === 'timeout' && close(toast.id)}>
          <Alert severity="error" variant="filled" onClose={() => close(toast.id)} sx={{ width: '100%' }}>
            {toast.title && <AlertTitle>{toast.title}</AlertTitle>}
            {toast.message}
          </Alert>
        </Snackbar>
      ))}
    </Stack>
  </ToastContext.Provider>;
}

/**
 * The function that shows an error as a toast: showError(title, message), the title being where it comes from (the
 * form's window, e.g. "فاتورة مبيعات"; may be empty).
 *
 * @returns {(title: string, message: string) => void}
 */
export function useToast() {
  const showError = useContext(ToastContext);
  if (showError == null) {
    throw new Error('useToast needs a ToastProvider above it (the dashboard layout)');
  }
  return showError;
}
