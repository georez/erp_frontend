'use client';

import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import {
  Alert, Box, Checkbox, Collapse, FormControlLabel, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';

/** Every permission of a screen, of a module. */
const screenPermissions = (screen) => Object.keys(screen.permissions);
const modulePermissions = (module) => module.screens.flatMap(screenPermissions);

/**
 * The permissions to choose from (GET /api/permissions), as checkboxes: module, then screen, then one per permission
 * (one per endpoint). A module's and a screen's own checkbox selects all of theirs. A search narrows the screens to
 * those whose title or a permission's label has the text.
 *
 * @param catalog  [{ title, screens: [{ title, permissions: { permission: label } }] }]
 * @param selected the permissions chosen (a Set)
 * @param onChange called with the new Set
 * @param fromRole the user's role's permissions (a Set): shown ticked and fixed, "من الدور"
 * @param disabled nothing can be changed
 */
export default function PermissionTree({ catalog, selected, onChange, fromRole = new Set(), disabled = false }) {
  const [search, setSearch] = useState('');
  const [openModules, setOpenModules] = useState(() => new Set());

  const has = (permission) => selected.has(permission) || fromRole.has(permission);
  const everyPermission = catalog.flatMap(modulePermissions);
  const chosen = everyPermission.filter(has).length;

  // The screens the search finds, by module; every screen without one
  const text = search.trim();
  const shownModules = catalog
    .map((module) => ({
      ...module,
      screens: text === '' ? module.screens : module.screens.filter((screen) => screen.title.includes(text)
        || module.title.includes(text) || Object.values(screen.permissions).some((label) => label.includes(text))),
    }))
    .filter((module) => module.screens.length > 0);

  /** Ticks or unticks the permissions together: all of them when any isn't ticked yet. Not the role's. */
  const toggleAll = (permissions) => {
    const own = permissions.filter((permission) => !fromRole.has(permission));
    const next = new Set(selected);
    if (own.every((permission) => selected.has(permission))) {
      own.forEach((permission) => next.delete(permission));
    } else {
      own.forEach((permission) => next.add(permission));
    }
    onChange(next);
  };

  const groupCheckbox = (permissions, label) => {
    const ticked = permissions.filter(has).length;
    const own = permissions.filter((permission) => !fromRole.has(permission));
    return <Checkbox size="small" checked={ticked === permissions.length && ticked > 0}
      indeterminate={ticked > 0 && ticked < permissions.length} disabled={disabled || own.length === 0}
      onChange={() => toggleAll(permissions)} slotProps={{ input: { 'aria-label': label } }} />;
  };

  const toggleModule = (title) => setOpenModules((current) => {
    const next = new Set(current);
    if (next.has(title)) {
      next.delete(title);
    } else {
      next.add(title);
    }
    return next;
  });

  return <Stack spacing={1}>
    <Alert severity="info" sx={{ py: 0 }}>
      كل صلاحية هنا طلب واحد إلى الخادم. تحتاج أغلب الشاشات أيضاً إلى «الإعدادات: عرض الإعدادات وبيانات الشركة»
      و«عرض الشعار» للطباعة، وإلى قوائم «القوائم المشتركة» التي تختار منها حقولها (العملاء، الأصناف، المخازن...).
    </Alert>
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <TextField size="small" label="بحث في الصلاحيات" value={search} sx={{ flex: 1, maxWidth: 320 }}
        onChange={(event) => setSearch(event.target.value)} />
      <Typography variant="body2" color="text.secondary">
        المحدد: <bdi>{chosen}</bdi> من <bdi>{everyPermission.length}</bdi>
      </Typography>
    </Stack>
    {shownModules.length === 0 && <Typography color="text.secondary">لا توجد صلاحية بهذا النص.</Typography>}
    {shownModules.map((module) => {
      // Searching opens every module it finds something in
      const isOpen = text !== '' || openModules.has(module.title);
      const permissions = modulePermissions(module);
      return <Box key={module.title} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Stack direction="row" sx={{ alignItems: 'center', pr: 1 }}>
          {groupCheckbox(permissions, module.title)}
          <Typography sx={{ fontWeight: 'bold', flex: 1, cursor: 'pointer' }}
            onClick={() => toggleModule(module.title)}>
            {module.title}
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              {' '}(<bdi>{permissions.filter(has).length}</bdi>/<bdi>{permissions.length}</bdi>)
            </Typography>
          </Typography>
          <IconButton size="small" aria-expanded={isOpen} aria-label={module.title}
            onClick={() => toggleModule(module.title)}>
            {isOpen ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Stack>
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <Stack spacing={0.5} sx={{ pl: 4, pb: 1 }}>
            {module.screens.map((screen) => <Box key={screen.title}>
              <Stack direction="row" sx={{ alignItems: 'center' }}>
                {groupCheckbox(screenPermissions(screen), screen.title)}
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{screen.title}</Typography>
              </Stack>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, pl: 4 }}>
                {Object.entries(screen.permissions).map(([permission, label]) => {
                  const ofRole = fromRole.has(permission);
                  return <FormControlLabel key={permission} title={permission}
                    control={<Checkbox size="small" checked={has(permission)} disabled={disabled || ofRole}
                      onChange={() => toggleAll([permission])} />}
                    label={<Typography variant="body2">
                      {label}
                      {ofRole && <Typography component="span" variant="caption" color="text.secondary">
                        {' '}(من الدور)
                      </Typography>}
                    </Typography>} />;
                })}
              </Box>
            </Box>)}
          </Stack>
        </Collapse>
      </Box>;
    })}
  </Stack>;
}
