'use client';

import {
  AppBar, Box, Divider, Drawer, IconButton,
  List, ListItem, ListItemButton,
  ListItemText, Toolbar, Typography,
} from "@mui/material";
import { useContext, useState } from "react";
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import { jwtDecode } from "jwt-decode";
import { AuthContext } from "../AuthProvider";
import { deleteJwtCookiesAction } from "@/actions/deleteJwtCookieAction";
import { useRouter } from "next/navigation";
import { openLinkOnPlainClick, useOpenLink } from "@/utils/useOpenLink";
import { MENU_LINKS } from "./menuLinks";

const drawerWidth = 240;

function useLogout() {
  const { csrfFetch } = useContext(AuthContext);
  const router = useRouter();
  return async () => {
    // Ends the session on the server (its refresh tokens stop working) and clears the auth cookies
    let loggedOut = false;
    try {
      const res = await csrfFetch('/api/login/logout', {
        method: 'POST',
        credentials: 'include',
      });
      loggedOut = res.ok;
    } catch {
      loggedOut = false;
    }
    if (!loggedOut) {
      // Backend unreachable or request rejected: at least remove the cookies from this browser
      await deleteJwtCookiesAction();
    }
    router.push('/login');
  };
}

function useUsername() {
  const { accessToken } = useContext(AuthContext);
  const { sub: username } = accessToken ? jwtDecode(accessToken) : {};
  return username;
}

export default function DrawerForm({ children, backgroundColor }) {
  const username = useUsername();
  const logout = useLogout();
  const openLink = useOpenLink();

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
          aria-label="log out"
          edge="start"
          onClick={logout}
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
        {MENU_LINKS.map(({ text, url }) => (
          // Opens like the report grid's links: a dashboard window or a new tab (see useOpenLink)
          <ListItem key={url} disablePadding>
            <ListItemButton
              component="a"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => openLinkOnPlainClick(event, openLink, url, text)}
            >
              <ListItemText primary={text} />
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
        sx={{ flexGrow: 1, height: '100vh', overflow: 'auto', bgcolor: backgroundColor ?? null }}
      >
        <Toolbar variant="dense" />
        {children}
      </Box>
    </Box>
  );
}
