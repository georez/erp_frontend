import { Box, IconButton, Paper, Typography } from "@mui/material";
import { Rnd } from "react-rnd";
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import FilterNoneIcon from '@mui/icons-material/FilterNone';
import { useSearchParams } from "next/navigation";
import { encodeOpenForms, readOpenForms, useUpdateSearchParam } from "@/utils/useUpdateSearchParams";
import { useCallback, useEffect, useState } from "react";

// A maximized window leaves this much room around it (and the app bar above)
const MAXIMIZED_MARGIN = 10;
const MAXIMIZED_TOP = 50;

/** The window's box when maximized: the whole browser window, less a margin. */
const maximizedBox = () => ({
  x: MAXIMIZED_MARGIN,
  y: MAXIMIZED_TOP,
  width: window.innerWidth - 2 * MAXIMIZED_MARGIN,
  height: window.innerHeight - MAXIMIZED_TOP - MAXIMIZED_MARGIN,
});

/**
 * A dashboard window: dragged by its title bar, resized from its edges, maximized, opened in a browser tab of its own,
 * or closed (which removes it from the URL's openForms). The window in front is the URL's focusedForm.
 */
export default function DraggableForm({
  x = 20, y = 60, width = 900, height = 600,
  url, formId, formTitle,
  children
}) {
  const searchParams = useSearchParams();
  const openForms = readOpenForms(searchParams) ?? [];
  const focusedForm = searchParams.get('focusedForm') || null;
  const updateSearchParam = useUpdateSearchParam();

  const initialBox = { x, y, width, height };
  const [box, setBox] = useState(initialBox);
  const [maximized, setMaximized] = useState(false);

  // Brought to the front by a press anywhere in it; one in front stays as it is (no URL change)
  const bringToFront = () => {
    if (focusedForm !== formId) {
      updateSearchParam('focusedForm', formId);
    }
  };

  const close = () => {
    const remaining = openForms.filter((form) => form.formId !== formId);
    updateSearchParam('openForms', encodeOpenForms(remaining));
  };

  const fillWindow = useCallback(() => {
    if (typeof window !== 'undefined') {
      setBox(maximizedBox());
    }
  }, []);

  const maximize = () => {
    fillWindow();
    setMaximized(true);
  };

  const restore = () => {
    setBox(initialBox);
    setMaximized(false);
  };

  // A maximized window follows the browser window's size
  useEffect(() => {
    if (!maximized) {
      return undefined;
    }
    window.addEventListener('resize', fillWindow);
    return () => window.removeEventListener('resize', fillWindow);
  }, [maximized, fillWindow]);

  return <Rnd
    default={initialBox}
    position={{ x: box.x, y: box.y }}
    size={{ width: box.width, height: box.height }}
    onDragStop={(event, dragged) => setBox((previous) => ({ ...previous, x: dragged.x, y: dragged.y }))}
    onResizeStop={(event, direction, element, delta, position) => setBox({
      x: position.x, y: position.y, width: element.offsetWidth, height: element.offsetHeight,
    })}
    style={{ zIndex: focusedForm === formId ? 1200 : 1199 }}
    dragHandleClassName="rnd-drag-handle"
    disableDragging={maximized}
  >
    {/* A column: the title bar keeps its height, and only the body scrolls */}
    <Paper elevation={3} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      overflow: 'hidden' }} onMouseDown={bringToFront}>
      <Box className="rnd-drag-handle" sx={{ cursor: 'move', backgroundColor: 'primary.light', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {/* Not brought to the front first: two URL changes at once, and the window is going anyway */}
          <IconButton aria-label="close" size="small" onClick={close} onMouseDown={(event) => event.stopPropagation()}>
            <CloseIcon fontSize="inherit" color="secondary" />
          </IconButton>
          {maximized
            ? <IconButton aria-label="minimize" size="small" onClick={restore}>
              <FilterNoneIcon fontSize="inherit" color="secondary" />
            </IconButton>
            : <IconButton aria-label="maximize" size="small" onClick={maximize}>
              <CropSquareIcon fontSize="inherit" color="secondary" />
            </IconButton>}
          <IconButton aria-label="open in new" size="small" onClick={() => window.open(url, '_blank')}>
            <OpenInNewIcon fontSize="inherit" color="secondary" />
          </IconButton>
          <Typography variant="subtitle1" component="div">{formTitle}</Typography>
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {children}
      </Box>
    </Paper>
  </Rnd>;
}
