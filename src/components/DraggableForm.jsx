import { Box, Button, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import { Rnd } from "react-rnd";
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useSearchParams } from "next/navigation";
import { useUpdateSearchParams } from "@/utils/useUpdateSearchParams";

export default function DraggableForm({
  x = 20, y = 60, width = 320, height = 200,
  url, formId,
  children
}) {

  const searchParams = useSearchParams();
  const openForms = JSON.parse(searchParams.get('openForms') || '[]');
  const handleFilterChange = useUpdateSearchParams();
  const handleCloseForm = () => {
    const updatedOpenForms = openForms.filter(form => form.formId !== formId);
    handleFilterChange('openForms', JSON.stringify(updatedOpenForms));
  }

  return <Rnd
    default={{
      x: x,
      y: y,
      width: width,
      height: height,
    }}
    dragHandleClassName="rnd-drag-handle"
  >
    <Paper elevation={3} sx={{ width: '100%', height: '100%', overflow: 'auto' }}>
      <Box>
        <Box
          className="rnd-drag-handle"
          sx={{
            cursor: 'move',
            backgroundColor: 'primary.light',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <IconButton aria-label="close" size="small" onClick={handleCloseForm}>
              <CloseIcon fontSize="inherit" color="secondary" />
            </IconButton>
            <Tooltip title={<span dir="ltr" style={{ display: 'inline-block', textAlign: 'left' }}>{url}</span>}>
              <IconButton aria-label="open in new" size="small" onClick={() => window.open(url, '_blank')}>
                <OpenInNewIcon fontSize="inherit" color="secondary" />
              </IconButton>
            </Tooltip>
            <Typography variant="h7" component="div">
              Test
            </Typography>
          </Box>
        </Box>
        {children}
      </Box>
    </Paper>
  </Rnd>
}