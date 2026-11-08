'use client';

import CloseIcon from '@mui/icons-material/Close';
import { Box, IconButton, Paper, Typography } from '@mui/material';
import { createContext, useContext, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Rnd } from 'react-rnd';

/*
 * A panel floating over a form: dragged by its title bar, resized from its edges. In a dashboard window it's put in
 * the window's floating layer (DraggableForm), so it stacks with its window: over every window while its window is in
 * front, behind the one in front otherwise, and a press on it brings its window to the front. In a browser tab of its
 * own, the form's page, it floats over the page.
 */

/**
 * The element of the window's floating layer, for its form's panels: null until the window has it, undefined outside
 * a dashboard window.
 */
export const FloatingLayerContext = createContext(undefined);

// Over the form's page when there's no window (the window's layer stacks with the window instead)
const PAGE_Z_INDEX = 1300;

const subscribeToNothing = () => () => {};

/** False on the server and while the page is hydrated, which has no document.body to put a panel in; true after. */
const useIsClient = () => useSyncExternalStore(subscribeToNothing, () => true, () => false);

/**
 * @param title       the title bar's text
 * @param defaultBox  where it's first shown and its size ({ x, y, width, height }), in the window
 * @param visible     hidden, it keeps where it was dragged to for when it's shown again
 * @param onClose     the title bar's close button
 */
export default function FloatingPanel({ title, defaultBox, visible, onClose, children }) {
  const windowLayer = useContext(FloatingLayerContext);
  const isClient = useIsClient();
  const outsideAWindow = windowLayer === undefined;
  const target = outsideAWindow && isClient ? document.body : windowLayer;
  if (!target) {
    return null;
  }

  const panel = <Rnd
    default={defaultBox}
    minWidth={220}
    minHeight={120}
    dragHandleClassName="floating-panel-handle"
    // Hidden, not display: none, which would leave Rnd nothing to measure its position from when it's mounted hidden
    style={{ visibility: visible ? 'visible' : 'hidden', zIndex: outsideAWindow ? PAGE_Z_INDEX : undefined }}
  >
    <Paper elevation={8} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      overflow: 'hidden' }}>
      <Box className="floating-panel-handle" sx={{
        cursor: 'move', backgroundColor: 'primary.light', display: 'flex', alignItems: 'center', gap: 0.5, px: 1,
        flexShrink: 0,
      }}>
        <Typography variant="subtitle2" component="div" noWrap sx={{ flex: 1 }}>{title}</Typography>
        <IconButton aria-label="إخفاء" size="small" onClick={onClose} onMouseDown={(event) => event.stopPropagation()}>
          <CloseIcon fontSize="inherit" />
        </IconButton>
      </Box>
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {children}
      </Box>
    </Paper>
  </Rnd>;
  return createPortal(panel, target);
}
