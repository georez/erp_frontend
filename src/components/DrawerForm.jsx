'use client';

import {
  AppBar, Box, Divider, Drawer, IconButton,
  List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Typography,
  useMediaQuery,
  useTheme
} from "@mui/material";
import { useContext, useState } from "react";
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import { jwtDecode } from "jwt-decode";
import { AuthContext } from "./AuthProvider";
import { deleteJwtCookiesAction } from "@/actions/deleteJwtCookieAction";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { v4 as uuidv4 } from 'uuid';
import { useUpdateMultipleSearchParams } from "@/utils/useUpdateSearchParams";

const drawerWidth = 240;

function useIsTabletOrSmaller() {
  const theme = useTheme();
  const isTabletOrSmaller = useMediaQuery(theme.breakpoints.down('md'));
  return isTabletOrSmaller;
}

function useOpenForm() {
  const searchParams = useSearchParams();
  const openForms = JSON.parse(searchParams.get('openForms') || '[]');
  const handleFilterChange = useUpdateMultipleSearchParams();
  return (formId, url) => {
    const updatedOpenForms = [...openForms, { formId, url }];
    handleFilterChange({ 'openForms': JSON.stringify(updatedOpenForms), 'focusedForm': formId });
  };
}

function useUsername() {
  const { accessToken, csrfToken } = useContext(AuthContext);
  const { sub: username } = accessToken ? jwtDecode(accessToken) : {};
  return username;
}

export default function DrawerForm({ children }) {
  const username = useUsername();
  const router = useRouter();
  const isTabletOrSmaller = useIsTabletOrSmaller();
  const openFormFn = useOpenForm();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleDrawerClose = () => {
    setIsClosing(true);
    setMobileOpen(false);
  };

  const handleDrawerTransitionEnd = () => {
    setIsClosing(false);
  };

  const handleDrawerToggle = () => {
    if (!isClosing) {
      setMobileOpen(!mobileOpen);
    }
  };

  const drawer = (
    <div>
      <Toolbar variant="dense">
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={() => {
            deleteJwtCookiesAction();
            router.push('/login')
          }}
          sx={{ mr: 2 }}
        >
          <LogoutIcon />
        </IconButton>
        <Typography variant="h6" noWrap component="div">
          {username}
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {[{ linkText: 'عرض الحسابات', linkAddr: "/dashboard/accForm" }].map(({ linkText, linkAddr }, index) => (
          isTabletOrSmaller ?
            <ListItem key={index} disablePadding>
              <ListItemButton component={Link} href={linkAddr}>
                <ListItemText primary={linkText} />
              </ListItemButton>
            </ListItem> :
            <ListItem key={index} disablePadding onClick={() => openFormFn(uuidv4(), linkAddr)}>
              <ListItemButton>
                <ListItemText primary={linkText} />
              </ListItemButton>
            </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
      >
        <Toolbar variant="dense">
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            ERP
          </Typography>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ flexShrink: { sm: 0 } }}
        aria-label="menu items"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onTransitionEnd={handleDrawerTransitionEnd}
          onClose={handleDrawerClose}
          sx={{
            display: 'block',
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          slotProps={{
            root: {
              keepMounted: true, // Better open performance on mobile.
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{ flexGrow: 1, height: '100vh', overflow: 'auto', bgcolor: '#008cff46' }}
      >
        <Toolbar variant="dense" />
        {children}
      </Box>
    </Box>
  );
}
