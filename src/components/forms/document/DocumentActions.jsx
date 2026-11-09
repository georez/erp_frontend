'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PrintIcon from '@mui/icons-material/Print';
import SendIcon from '@mui/icons-material/Send';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { formatAmount } from './amounts';

/** How many requests are still in the queue, with a spinner; nothing when the queue is empty. */
function PendingIndicator({ pending }) {
  if (pending === 0) {
    return null;
  }
  return <Stack direction="row" spacing={0.75} role="status" aria-live="polite" sx={{ alignItems: 'center' }}>
    <CircularProgress size={14} />
    <Typography variant="body2" color="text.secondary">
      قيد الإرسال: <bdi>{pending}</bdi>
    </Typography>
  </Stack>;
}

/**
 * One of the totals under the grid: its label and its amount ("—" for none). The amount reads left to right (a minus
 * before it), styled inline: the theme's RTL plugin flips sx, which would make NUMBER_CELL's ltr rtl.
 */
export function Total({ label, value, strong }) {
  return <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant={strong ? 'subtitle1' : 'body2'} sx={{ fontWeight: strong ? 700 : 400 }}>
      <bdi style={{ direction: 'ltr' }}>{value == null ? '—' : formatAmount(value)}</bdi>
    </Typography>
  </Stack>;
}

/**
 * The actions under the grid: for a draft, its next step (posting by default) and deleting it; "جديد" once there's a
 * document; then the totals (children), at the far end. The actions wait while requests are pending: a line sent
 * must be answered before the draft is posted or deleted.
 *
 * @param newStep  { onClick, label, icon }: how a new document is saved, for one without lines (others are created by
 *                 their first line)
 * @param newStepRef the new step's button, for Enter to reach it
 * @param nextStep { onClick, disabled, label?, icon? }: the draft's next step; posting unless a label says otherwise
 * @param otherSteps [{ key, onClick, disabled, label, icon? }]: a draft's other steps, beside its next one (a sales
 *                 invoice posted without its batches phase)
 * @param pending  how many requests are still to be answered
 * @param onPrint  opens the document's printout, for a document that has one; offered once it's saved
 */
export function DocumentActions({
  isNew, isDraft, pending, newStep, newStepRef, nextStep, otherSteps = [], onDeleteDraft, onNew, onPrint, children,
}) {
  const waiting = pending > 0;
  return <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
    {isNew && newStep && <Button ref={newStepRef} variant="contained" startIcon={newStep.icon} disabled={waiting}
      onClick={newStep.onClick}>
      {newStep.label}
    </Button>}
    {isDraft && <>
      <Button variant="contained" color="success" startIcon={nextStep.icon ?? <SendIcon />}
        disabled={waiting || nextStep.disabled} onClick={nextStep.onClick}>
        {nextStep.label ?? 'ترحيل'}
      </Button>
      {otherSteps.map((step) => <Button key={step.key} variant="outlined" color="success"
        startIcon={step.icon ?? <SendIcon />} disabled={waiting || step.disabled} onClick={step.onClick}>
        {step.label}
      </Button>)}
      <Button color="error" startIcon={<DeleteForeverIcon />} disabled={waiting} onClick={onDeleteDraft}>
        حذف المسودة
      </Button>
    </>}
    {!isNew && onPrint && <Button startIcon={<PrintIcon />} disabled={waiting} onClick={onPrint}>طباعة</Button>}
    {!isNew && <Button startIcon={<AddIcon />} disabled={waiting} onClick={onNew}>جديد</Button>}
    <PendingIndicator pending={pending} />
    <Box sx={{ flex: 1 }} />
    {children}
  </Stack>;
}
