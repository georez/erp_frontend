import { Box, Button, Paper, Typography } from "@mui/material";
import { Rnd } from "react-rnd";

export default function DraggableForm({ x = 20, y = 60, width = 320, height = 200, url, children }) {

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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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