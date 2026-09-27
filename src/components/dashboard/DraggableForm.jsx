import { Box, Button, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import { Rnd } from "react-rnd";
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import FilterNoneIcon from '@mui/icons-material/FilterNone';
import { useSearchParams } from "next/navigation";
import { useUpdateSearchParam } from "@/utils/useUpdateSearchParams";
import { useCallback, useEffect, useState } from "react";
import LZString from 'lz-string';

export default function DraggableForm({
  x = 20, y = 60, width = 320, height = 200,
  url, formId, formTitle,
  children
}) {

  const searchParams = useSearchParams();
  const openForms = JSON.parse(searchParams.get('openForms') ?
    LZString.decompressFromEncodedURIComponent(searchParams.get('openForms')) :
    '[]');
  const focusedForm = searchParams.get('focusedForm') || null;
  const [positionX, setPositionX] = useState(x);
  const [positionY, setPositionY] = useState(y);
  const [sizeWidth, setSizeWidth] = useState(width);
  const [sizeHeight, setSizeHeight] = useState(height);
  const [maximized, setMaximized] = useState(false);

  const handleFilterChange = useUpdateSearchParam();
  const handleCloseForm = () => {
    const updatedOpenForms = openForms.filter(form => form.formId !== formId);
    handleFilterChange('openForms', LZString.compressToEncodedURIComponent(JSON.stringify(updatedOpenForms)));
  }

  const applyMaximize = useCallback(() => {
    if (typeof window !== 'undefined') {
      setSizeWidth(window.innerWidth - 20);
      setSizeHeight(window.innerHeight - 60);
      setPositionX(10);
      setPositionY(50);
    }
  }, []);

  useEffect(() => {
    if (!maximized) return;

    const handleResize = () => {
      applyMaximize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [maximized, applyMaximize]);

  return <Rnd
    default={{
      x: x,
      y: y,
      width: width,
      height: height,
    }}
    position={{ x: positionX, y: positionY }}
    size={{ width: sizeWidth, height: sizeHeight }}
    onDragStop={(e, d) => { setPositionX(d.x); setPositionY(d.y) }}
    onResizeStop={(e, direction, ref, delta, position) => {
      setSizeWidth(ref.style.width);
      setSizeHeight(ref.style.height);
      setPositionX(position.x);
      setPositionY(position.y);
    }}
    style={{ zIndex: focusedForm === formId ? 1200 : 1199 }}
    dragHandleClassName="rnd-drag-handle"
    disableDragging={maximized}
  >
    {/* 1. Set Paper as a Column Flexbox with overflow: 'hidden' */}
    <Paper
      elevation={3}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 2. Prevent the Header from shrinking */}
      <Box
        className="rnd-drag-handle"
        sx={{
          cursor: 'move',
          backgroundColor: 'primary.light',
          flexShrink: 0,
        }}
        onMouseDown={() => handleFilterChange('focusedForm', formId)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <IconButton aria-label="close" size="small" onClick={handleCloseForm}>
            <CloseIcon fontSize="inherit" color="secondary" />
          </IconButton>
          {maximized ? (
            <IconButton aria-label="minimize" size="small" onClick={() => {
              setSizeWidth(width);
              setSizeHeight(height);
              setPositionX(x);
              setPositionY(y);
              setMaximized(false);
            }}>
              <FilterNoneIcon fontSize="inherit" color="secondary" />
            </IconButton>
          ) : (
            <IconButton aria-label="maximize" size="small" onClick={() => {
              applyMaximize();
              setMaximized(true);
            }}>
              <CropSquareIcon fontSize="inherit" color="secondary" />
            </IconButton>
          )}
          {/* <Tooltip title={<span dir="ltr" style={{ display: 'inline-block', textAlign: 'left' }}>{url}</span>}> */}
          <IconButton aria-label="open in new" size="small" onClick={() => window.open(url, '_blank')}>
            <OpenInNewIcon fontSize="inherit" color="secondary" />
          </IconButton>
          {/* </Tooltip> */}
          <Typography variant="h7" component="div">
            {formTitle}
          </Typography>
        </Box>
      </Box>

      {/* 3. Make only the body wrapper scrollable */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: 'auto',
        }}
      >
        {children}
      </Box>
    </Paper>
  </Rnd>
}