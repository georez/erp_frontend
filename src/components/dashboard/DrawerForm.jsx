'use client';

import {
  AppBar, Box, Divider, Drawer, IconButton,
  List, ListItem, ListItemButton, ListItemIcon,
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
          aria-label="open drawer"
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
        {[
          { linkText: 'ادخال الحسابات', linkAddr: `/dashboard/form?schemaName=accounts&formTitle=${encodeURIComponent('ادخال الحسابات')}` },
          { linkText: 'ادخال العملاء', linkAddr: `/dashboard/form?schemaName=customers&formTitle=${encodeURIComponent('ادخال العملاء')}` },
          { linkText: 'ادخال تصنيف العملاء', linkAddr: `/dashboard/form?schemaName=customer_categories&formTitle=${encodeURIComponent('ادخال تصنيف العملاء')}` },
          { linkText: 'تقرير تصنيف العملاء', linkAddr: `/dashboard/report?reportName=customerCategoriesReport&formTitle=${encodeURIComponent('تقرير تصنيف العملاء')}` },
          { linkText: 'تقرير العملاء', linkAddr: `/dashboard/report?reportName=customersReport&formTitle=${encodeURIComponent('تقرير العملاء')}` },
          { linkText: 'ادخال الموردين', linkAddr: `/dashboard/form?schemaName=suppliers&formTitle=${encodeURIComponent('ادخال الموردين')}` },
          { linkText: 'ادخال تصنيف الموردين', linkAddr: `/dashboard/form?schemaName=supplier_categories&formTitle=${encodeURIComponent('ادخال تصنيف الموردين')}` },
          { linkText: 'تقرير تصنيف الموردين', linkAddr: `/dashboard/report?reportName=supplierCategoriesReport&formTitle=${encodeURIComponent('تقرير تصنيف الموردين')}` },
          { linkText: 'تقرير الموردين', linkAddr: `/dashboard/report?reportName=suppliersReport&formTitle=${encodeURIComponent('تقرير الموردين')}` },
          { linkText: 'ادخال الأصناف', linkAddr: `/dashboard/form?schemaName=products&formTitle=${encodeURIComponent('ادخال الأصناف')}` },
          { linkText: 'تقرير الأصناف', linkAddr: `/dashboard/report?reportName=productsReport&formTitle=${encodeURIComponent('تقرير الأصناف')}` },
          { linkText: 'ادخال تصنيف الأصناف', linkAddr: `/dashboard/form?schemaName=product_categories&formTitle=${encodeURIComponent('ادخال تصنيف الأصناف')}` },
          { linkText: 'ادخال المخازن', linkAddr: `/dashboard/form?schemaName=warehouses&formTitle=${encodeURIComponent('ادخال المخازن')}` },
          { linkText: 'فاتورة مشتريات', linkAddr: `/dashboard/purchase-invoice?formTitle=${encodeURIComponent('فاتورة مشتريات')}` },
          { linkText: 'تقرير فواتير المشتريات', linkAddr: `/dashboard/report?reportName=purchaseInvoicesReport&formTitle=${encodeURIComponent('تقرير فواتير المشتريات')}` },
          { linkText: 'مرتجع مشتريات', linkAddr: `/dashboard/purchase-return?formTitle=${encodeURIComponent('مرتجع مشتريات')}` },
          { linkText: 'تقرير مرتجعات المشتريات', linkAddr: `/dashboard/report?reportName=purchaseReturnsReport&formTitle=${encodeURIComponent('تقرير مرتجعات المشتريات')}` },
          { linkText: 'رصيد افتتاحي للمخزون', linkAddr: `/dashboard/opening-balance?formTitle=${encodeURIComponent('رصيد افتتاحي للمخزون')}` },
          { linkText: 'تقرير الأرصدة الافتتاحية', linkAddr: `/dashboard/report?reportName=openingBalancesReport&formTitle=${encodeURIComponent('تقرير الأرصدة الافتتاحية')}` },
          { linkText: 'تسوية مخزون', linkAddr: `/dashboard/stock-adjustment?formTitle=${encodeURIComponent('تسوية مخزون')}` },
          { linkText: 'تقرير أرصدة المخزون', linkAddr: `/dashboard/report?reportName=stockBalancesReport&formTitle=${encodeURIComponent('تقرير أرصدة المخزون')}` },
          { linkText: 'تقرير تسويات المخزون', linkAddr: `/dashboard/report?reportName=stockAdjustmentsReport&formTitle=${encodeURIComponent('تقرير تسويات المخزون')}` },
          { linkText: 'تقرير التشغيلات والصلاحية', linkAddr: `/dashboard/report?reportName=stockBatchesReport&formTitle=${encodeURIComponent('تقرير التشغيلات والصلاحية')}` },
          { linkText: 'تقرير حركات المخزون', linkAddr: `/dashboard/report?reportName=stockMovementsReport&formTitle=${encodeURIComponent('تقرير حركات المخزون')}` },
        ].map(({ linkText, linkAddr }, index) => (
          // Opens like the report grid's links: a dashboard window or a new tab (see useOpenLink)
          <ListItem key={index} disablePadding>
            <ListItemButton
              component="a"
              href={linkAddr}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => openLinkOnPlainClick(event, openLink, linkAddr, linkText)}
            >
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
        sx={{ flexGrow: 1, height: '100vh', overflow: 'auto', ...{ bgcolor: backgroundColor ? backgroundColor : null } }}
      >
        <Toolbar variant="dense" />
        {children}
      </Box>
    </Box>
  );
}
