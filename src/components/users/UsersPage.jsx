'use client';

import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import dayjs from 'dayjs';
import { jwtDecode } from 'jwt-decode';
import useSWR, { useSWRConfig } from 'swr';
import { useContext, useState } from 'react';
import { AuthContext } from '@/components/AuthProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/utils/fetchJson';
import { usePermissions } from '@/utils/usePermissions';
import PermissionTree from './PermissionTree';
import { newPasswordProblem, PASSWORD_MAX_LENGTH } from './passwords';
import { sendJson } from './sendJson';

const USERS_URL = '/api/users';
const NEW = 'new';
const NO_ROLE = '';

/** A date-time as the backend sends it ("2026-11-16T08:30:00.123"), as DD/MM/YYYY HH:mm. */
const shownDateTime = (value) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '');

/**
 * Users (المستخدمون, /api/users): the list, and the chosen user's role, permissions of their own, password, being
 * disabled and sessions; or a new user. The admin user has every permission and is left as it is.
 */
export default function UsersPage() {
  const permissions = usePermissions();
  const { data: users, error: usersError, mutate: reloadUsers } = useSWR(USERS_URL, fetchJson);
  const { data: catalog, error: catalogError } = useSWR(
    permissions.has('GET /api/permissions') ? '/api/permissions' : null, fetchJson, { revalidateOnFocus: false });
  const { data: roles } = useSWR(permissions.has('GET /api/roles') ? '/api/roles' : null, fetchJson);
  // The user chosen: their id, NEW for one being added, null for none
  const [chosen, setChosen] = useState(null);

  return <Box sx={{ height: '100%', overflow: 'auto', p: 2, boxSizing: 'border-box' }}>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={1} sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0 }}>
        <Typography variant="h6">المستخدمون</Typography>
        {usersError && <Alert severity="error">{usersError.message}</Alert>}
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setChosen(NEW)}
          disabled={!permissions.has('POST /api/users')}>
          مستخدم جديد
        </Button>
        <List dense disablePadding>
          {(users ?? []).map((user) => <ListItemButton key={user.id} selected={chosen === user.id}
            onClick={() => setChosen(user.id)}>
            <ListItemText primary={<>
              {user.username}
              {user.disabledAt && <Chip size="small" color="error" label="موقوف" sx={{ mr: 1 }} />}
            </>} secondary={user.admin ? 'كل الصلاحيات' : (user.roleName ?? 'بدون دور')} />
          </ListItemButton>)}
        </List>
      </Stack>
      <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
        {catalogError && <Alert severity="error">{catalogError.message}</Alert>}
        {chosen === NEW && catalog && <NewUserForm catalog={catalog} roles={roles ?? []}
          onSaved={async (user) => {
            await reloadUsers();
            setChosen(user.id);
          }} />}
        {chosen != null && chosen !== NEW && catalog && <UserEditor key={chosen} userId={chosen} catalog={catalog}
          roles={roles ?? []} onChanged={() => reloadUsers()} />}
        {chosen == null && <Typography color="text.secondary" sx={{ mt: 6 }}>
          اختر مستخدماً من القائمة، أو أضف مستخدماً جديداً.
        </Typography>}
      </Box>
    </Stack>
  </Box>;
}

/** The role's permissions (a Set), for the tree to show as the role's; none for no role. */
function useRolePermissions(roleId, fallback) {
  const permissions = usePermissions();
  const { data: role } = useSWR(roleId != null && permissions.has('GET /api/roles/{id}')
    ? `/api/roles/${roleId}` : null, fetchJson, { revalidateOnFocus: false });
  if (roleId == null) {
    return new Set();
  }
  return new Set(role?.permissions ?? fallback ?? []);
}

/** The roles to choose from, and none. */
function RoleField({ roles, value, onChange, disabled }) {
  return <TextField select size="small" label="الدور" value={value ?? NO_ROLE} sx={{ minWidth: 240 }}
    disabled={disabled} onChange={(event) => onChange(event.target.value === NO_ROLE ? null : event.target.value)}>
    <MenuItem value={NO_ROLE}>بدون دور</MenuItem>
    {roles.map((role) => <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>)}
  </TextField>;
}

/** A new user: name, password typed twice, role, permissions of their own. */
function NewUserForm({ catalog, roles, onSaved }) {
  const { csrfFetch } = useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [roleId, setRoleId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const rolePermissions = useRolePermissions(roleId);

  const problem = newPasswordProblem(password, again);
  const ready = username.trim() !== '' && password !== '' && again === password && problem == null;

  const save = async () => {
    setError(null);
    setSending(true);
    try {
      const user = await sendJson(csrfFetch, USERS_URL, 'POST',
        { username, password, roleId, permissions: [...selected] }, setError);
      if (user) {
        await onSaved(user);
      }
    } finally {
      setSending(false);
    }
  };

  return <Stack spacing={2}>
    <Typography variant="h6">مستخدم جديد</Typography>
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <TextField size="small" label="اسم المستخدم" value={username} autoComplete="off"
        onChange={(event) => setUsername(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
      <TextField size="small" label="كلمة المرور" type="password" autoComplete="new-password" value={password}
        onChange={(event) => setPassword(event.target.value)}
        slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }} />
      <TextField size="small" label="تأكيد كلمة المرور" type="password" autoComplete="new-password" value={again}
        onChange={(event) => setAgain(event.target.value)} error={problem != null} helperText={problem ?? ' '} />
      <RoleField roles={roles} value={roleId} onChange={setRoleId} />
    </Stack>
    <Box>
      <Button variant="contained" disabled={!ready || sending} onClick={save}>إضافة المستخدم</Button>
    </Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>صلاحيات خاصة بالمستخدم (فوق صلاحيات دوره)</Typography>
    <PermissionTree catalog={catalog} selected={selected} onChange={setSelected} fromRole={rolePermissions} />
  </Stack>;
}

/** An existing user: their role and own permissions, password, being disabled, and sessions. */
function UserEditor({ userId, catalog, roles, onChanged }) {
  const { csrfFetch } = useContext(AuthContext);
  const confirm = useConfirm();
  const permissions = usePermissions();
  const url = `${USERS_URL}/${userId}`;
  const { data: user, error: loadError, mutate } = useSWR(url, fetchJson, { revalidateOnFocus: false });
  const { mutate: reload } = useSWRConfig();
  // What's chosen and ticked; until changed, the user's own (undefined: unchanged, the role may be null)
  const [roleId, setRoleId] = useState(undefined);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);

  const shownRoleId = roleId === undefined ? user?.roleId ?? null : roleId;
  // The user's own role's permissions come with them; another role's are read when it's chosen
  const rolePermissions = useRolePermissions(shownRoleId,
    shownRoleId === user?.roleId ? user?.rolePermissions : undefined);

  if (!user) {
    return loadError ? <Alert severity="error">{loadError.message}</Alert> : null;
  }

  const shownSelected = selected ?? new Set(user.permissions);
  const mayChange = !user.admin && permissions.has('PUT /api/users/{id}');

  /** Sends a change whose answer is the user, and shows them. */
  const send = async (path, method, body) => {
    setError(null);
    setSending(true);
    try {
      const changed = await sendJson(csrfFetch, url + path, method, body, setError);
      if (changed && changed !== true) {
        await mutate(changed, { revalidate: false });
        setRoleId(undefined);
        setSelected(null);
        onChanged();
      }
      if (changed) {
        // Setting a password or disabling ends the user's sessions
        reload(`${url}/sessions`);
      }
      return changed;
    } finally {
      setSending(false);
    }
  };

  const toggleDisabled = async () => {
    if (user.disabledAt) {
      await send('/enable', 'POST');
      return;
    }
    if (await confirm({
      title: `إيقاف المستخدم ${user.username}؟`,
      message: 'تنتهي جلساته فوراً، ولا يستطيع الدخول حتى يُعاد تفعيله.',
      confirmLabel: 'إيقاف',
      color: 'error',
    })) {
      await send('/disable', 'POST');
    }
  };

  return <Stack spacing={2}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="h6">{user.username}</Typography>
      {user.disabledAt && <Chip size="small" color="error" label={`موقوف منذ ${shownDateTime(user.disabledAt)}`} />}
    </Stack>
    <Typography variant="body2" color="text.secondary">أُضيف في {shownDateTime(user.createdAt)}</Typography>
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

    {user.admin
      ? <Alert severity="info">
        المستخدم admin لديه كل الصلاحيات دائماً، ولا يمكن إيقافه أو تغيير صلاحياته أو كلمة مروره من هنا: يغيّر كلمة مروره
        بنفسه من زر تغيير كلمة المرور في القائمة.
      </Alert>
      : <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <RoleField roles={roles} value={shownRoleId} onChange={setRoleId} disabled={!mayChange} />
        <Button variant="contained" disabled={!mayChange || sending}
          onClick={() => send('', 'PUT', { roleId: shownRoleId, permissions: [...shownSelected] })}>
          حفظ الدور والصلاحيات
        </Button>
        <Button disabled={!permissions.has('PUT /api/users/{id}/password') || sending}
          onClick={() => setSettingPassword(true)}>
          تعيين كلمة مرور
        </Button>
        <Button color={user.disabledAt ? 'success' : 'error'} onClick={toggleDisabled} disabled={sending
          || !permissions.has(user.disabledAt ? 'POST /api/users/{id}/enable' : 'POST /api/users/{id}/disable')}>
          {user.disabledAt ? 'إعادة تفعيل' : 'إيقاف المستخدم'}
        </Button>
      </Stack>}

    {permissions.has('GET /api/users/{id}/sessions') && <Sessions userId={userId} />}

    {!user.admin && <>
      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
        صلاحيات خاصة بالمستخدم (فوق صلاحيات دوره)
      </Typography>
      <PermissionTree catalog={catalog} selected={shownSelected} onChange={setSelected} fromRole={rolePermissions}
        disabled={!mayChange} />
    </>}

    <SetPasswordDialog open={settingPassword} username={user.username} onClose={() => setSettingPassword(false)}
      onSet={(password) => send('/password', 'PUT', { password })} />
  </Stack>;
}

/**
 * The user's sessions that may still be used, each of which may be ended; the one on this computer says so. Each shows
 * the address it signed in from and the one it was last renewed from.
 */
function Sessions({ userId }) {
  const { csrfFetch, accessToken } = useContext(AuthContext);
  const permissions = usePermissions();
  const url = `${USERS_URL}/${userId}/sessions`;
  const { data: sessions, error: loadError, mutate } = useSWR(url, fetchJson);
  const [error, setError] = useState(null);
  const currentSession = accessToken ? jwtDecode(accessToken).sid : null;
  const mayEnd = permissions.has('DELETE /api/users/{id}/sessions/{sessionId}');

  const end = async (sessionId) => {
    setError(null);
    const left = await sendJson(csrfFetch, `${url}/${sessionId}`, 'DELETE', undefined, setError);
    if (left) {
      await mutate(left, { revalidate: false });
    }
  };

  return <Stack spacing={1}>
    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>الجلسات</Typography>
    {(error ?? loadError?.message) && <Alert severity="error">{error ?? loadError.message}</Alert>}
    {sessions?.length === 0 && <Typography color="text.secondary">لا توجد جلسات مفتوحة.</Typography>}
    {sessions?.length > 0 && <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>الدخول</TableCell>
          <TableCell>IP الدخول</TableCell>
          <TableCell>آخر نشاط</TableCell>
          <TableCell>IP آخر نشاط</TableCell>
          <TableCell>تنتهي</TableCell>
          <TableCell>المتصفح</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {sessions.map((session) => <TableRow key={session.sessionId}>
          <TableCell><bdi dir="ltr">{shownDateTime(session.createdAt)}</bdi></TableCell>
          <TableCell><bdi dir="ltr">{session.ip}</bdi></TableCell>
          {/* A session is renewed every few minutes while it's used: its last renewal, and where it came from */}
          <TableCell><bdi dir="ltr">{shownDateTime(session.lastRefreshedAt)}</bdi></TableCell>
          {/* Bold when the session is used from elsewhere than where it signed in */}
          <TableCell sx={{ fontWeight: session.lastIp !== session.ip ? 'bold' : undefined }}>
            <bdi dir="ltr">{session.lastIp}</bdi>
          </TableCell>
          {/* However active it is: then its user signs in again (a session also ends after a day unused) */}
          <TableCell><bdi dir="ltr">{shownDateTime(session.endsAt)}</bdi></TableCell>
          <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={session.userAgent ?? ''}>
            <bdi dir="ltr">{session.userAgent}</bdi>
          </TableCell>
          <TableCell>
            {session.sessionId === currentSession
              ? <Typography variant="body2" color="text.secondary">هذه الجلسة</Typography>
              : <Button size="small" color="error" disabled={!mayEnd} onClick={() => end(session.sessionId)}>
                إنهاء
              </Button>}
          </TableCell>
        </TableRow>)}
      </TableBody>
    </Table>}
  </Stack>;
}

/** Sets another user's password: typed twice. Their sessions end. */
function SetPasswordDialog({ open, username, onClose, onSet }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const problem = newPasswordProblem(password, again);
  const ready = password !== '' && again === password && problem == null;

  const close = () => {
    setPassword('');
    setAgain('');
    onClose();
  };

  return <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
    <DialogTitle>كلمة مرور جديدة للمستخدم {username}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary">تنتهي جلساته، ويدخل بعدها بكلمة المرور الجديدة.</Typography>
        <TextField label="كلمة المرور" type="password" autoComplete="new-password" autoFocus value={password}
          onChange={(event) => setPassword(event.target.value)} />
        <TextField label="تأكيد كلمة المرور" type="password" autoComplete="new-password" value={again}
          onChange={(event) => setAgain(event.target.value)} error={problem != null} helperText={problem ?? ' '} />
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={close}>إلغاء</Button>
      <Button variant="contained" disabled={!ready} onClick={async () => {
        if (await onSet(password)) {
          close();
        }
      }}>تعيين</Button>
    </DialogActions>
  </Dialog>;
}
