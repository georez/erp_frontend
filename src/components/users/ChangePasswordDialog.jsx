'use client';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { useContext, useState } from 'react';
import { AuthContext } from '@/components/AuthProvider';
import { readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';
import { newPasswordProblem } from './passwords';

/**
 * The signed-in user changes their own password (PUT /api/me/password): the current one, then the new one twice.
 * Their sessions on other computers end; this one stays signed in.
 */
export default function ChangePasswordDialog({ open, onClose }) {
  const { csrfFetch } = useContext(AuthContext);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [changed, setChanged] = useState(false);

  const problem = newPasswordProblem(password, again);
  const ready = current !== '' && password !== '' && again !== '' && problem == null;

  const close = () => {
    setCurrent('');
    setPassword('');
    setAgain('');
    setError(null);
    setChanged(false);
    onClose();
  };

  const change = async () => {
    setError(null);
    setSending(true);
    try {
      const response = await sendOrShowError(() => csrfFetch('/api/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      }), setError);
      if (!response) {
        return;
      }
      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }
      setChanged(true);
    } finally {
      setSending(false);
    }
  };

  return <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
    <DialogTitle>تغيير كلمة المرور</DialogTitle>
    <DialogContent>
      {changed
        ? <Alert severity="success">
          تم تغيير كلمة المرور. انتهت جلساتك على الأجهزة الأخرى، وتبقى مسجلاً هنا.
        </Alert>
        : <Stack component="form" spacing={2} sx={{ pt: 1 }} onSubmit={(event) => {
          event.preventDefault();
          if (ready && !sending) {
            change();
          }
        }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="كلمة المرور الحالية" type="password" autoComplete="current-password" autoFocus
            value={current} onChange={(event) => setCurrent(event.target.value)} />
          <TextField label="كلمة المرور الجديدة" type="password" autoComplete="new-password" value={password}
            onChange={(event) => setPassword(event.target.value)} />
          <TextField label="تأكيد كلمة المرور الجديدة" type="password" autoComplete="new-password" value={again}
            onChange={(event) => setAgain(event.target.value)} error={problem != null}
            helperText={problem ?? ' '} />
          {/* Enter in any field submits */}
          <button type="submit" hidden />
        </Stack>}
    </DialogContent>
    <DialogActions>
      <Button onClick={close}>{changed ? 'إغلاق' : 'إلغاء'}</Button>
      {!changed && <Button variant="contained" disabled={!ready || sending} onClick={change}>تغيير</Button>}
    </DialogActions>
  </Dialog>;
}
