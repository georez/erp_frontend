'use client';

import AddIcon from '@mui/icons-material/Add';
import {
  Alert, Box, Button, List, ListItemButton, ListItemText, Stack, TextField, Typography,
} from '@mui/material';
import useSWR from 'swr';
import { useContext, useState } from 'react';
import { AuthContext } from '@/components/AuthProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/utils/fetchJson';
import { usePermissions } from '@/utils/usePermissions';
import PermissionTree from './PermissionTree';
import { sendJson } from './sendJson';

const ROLES_URL = '/api/roles';
const NEW = 'new';

/**
 * Roles (الأدوار, /api/roles): the list, and the chosen role's name and permissions. A change to a role applies to
 * its users at their next request. A role some user has can't be deleted.
 */
export default function RolesPage() {
  const permissions = usePermissions();
  const { data: roles, error: rolesError, mutate: reloadRoles } = useSWR(ROLES_URL, fetchJson);
  const { data: catalog, error: catalogError } = useSWR(
    permissions.has('GET /api/permissions') ? '/api/permissions' : null, fetchJson, { revalidateOnFocus: false });
  // The role chosen: its id, NEW for one being added, null for none
  const [chosen, setChosen] = useState(null);

  return <Box sx={{ height: '100%', overflow: 'auto', p: 2, boxSizing: 'border-box' }}>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={1} sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0 }}>
        <Typography variant="h6">الأدوار</Typography>
        {rolesError && <Alert severity="error">{rolesError.message}</Alert>}
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setChosen(NEW)}
          disabled={!permissions.has('POST /api/roles')}>
          دور جديد
        </Button>
        {roles?.length === 0 && <Typography color="text.secondary">لا توجد أدوار بعد.</Typography>}
        <List dense disablePadding>
          {(roles ?? []).map((role) => <ListItemButton key={role.id} selected={chosen === role.id}
            onClick={() => setChosen(role.id)}>
            <ListItemText primary={role.name} secondary={`${role.userCount} مستخدم`} />
          </ListItemButton>)}
        </List>
      </Stack>
      <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
        {catalogError && <Alert severity="error">{catalogError.message}</Alert>}
        {chosen != null && catalog && <RoleEditor key={chosen} roleId={chosen === NEW ? null : chosen}
          catalog={catalog}
          onSaved={async (role) => {
            await reloadRoles();
            setChosen(role.id);
          }}
          onDeleted={async () => {
            await reloadRoles();
            setChosen(null);
          }} />}
        {chosen == null && <Typography color="text.secondary" sx={{ mt: 6 }}>
          اختر دوراً من القائمة، أو أضف دوراً جديداً.
        </Typography>}
      </Box>
    </Stack>
  </Box>;
}

/** A role's name and permissions, to change and save; roleId null for a new role. */
function RoleEditor({ roleId, catalog, onSaved, onDeleted }) {
  const { csrfFetch } = useContext(AuthContext);
  const confirm = useConfirm();
  const permissions = usePermissions();
  const { data: role, error: loadError } = useSWR(roleId == null ? null : `${ROLES_URL}/${roleId}`, fetchJson,
    { revalidateOnFocus: false });
  // What's typed and ticked; until changed, the role's own
  const [name, setName] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const isNew = roleId == null;
  const shownName = name ?? role?.name ?? '';
  const shownSelected = selected ?? new Set(role?.permissions ?? []);
  const maySave = permissions.has(isNew ? 'POST /api/roles' : 'PUT /api/roles/{id}');

  if (!isNew && !role) {
    return loadError ? <Alert severity="error">{loadError.message}</Alert> : null;
  }

  const save = async () => {
    setError(null);
    setSending(true);
    try {
      const saved = await sendJson(csrfFetch, isNew ? ROLES_URL : `${ROLES_URL}/${roleId}`, isNew ? 'POST' : 'PUT',
        { name: shownName, permissions: [...shownSelected] }, setError);
      if (saved) {
        await onSaved(saved);
      }
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!await confirm({ title: `حذف الدور "${role.name}"؟`, confirmLabel: 'حذف', color: 'error' })) {
      return;
    }
    setError(null);
    if (await sendJson(csrfFetch, `${ROLES_URL}/${roleId}`, 'DELETE', undefined, setError)) {
      await onDeleted();
    }
  };

  return <Stack spacing={2}>
    <Typography variant="h6">{isNew ? 'دور جديد' : `الدور: ${role.name}`}</Typography>
    {!isNew && <Typography variant="body2" color="text.secondary">
      لدى {role.userCount} من المستخدمين. ما يُغيَّر هنا يسري عليهم من طلبهم التالي.
    </Typography>}
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
    <TextField size="small" label="اسم الدور" value={shownName} sx={{ maxWidth: 360 }} disabled={!maySave}
      onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
    <Stack direction="row" spacing={1}>
      <Button variant="contained" disabled={!maySave || sending || shownName.trim() === ''} onClick={save}>
        حفظ
      </Button>
      {!isNew && <Button color="error" disabled={!permissions.has('DELETE /api/roles/{id}') || sending}
        onClick={remove}>
        حذف الدور
      </Button>}
    </Stack>
    <PermissionTree catalog={catalog} selected={shownSelected} onChange={setSelected} disabled={!maySave} />
  </Stack>;
}
