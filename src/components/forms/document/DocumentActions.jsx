'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PrintIcon from '@mui/icons-material/Print';
import SendIcon from '@mui/icons-material/Send';
import { Box, Button, CircularProgress, Stack, Tooltip, Typography } from '@mui/material';
import { usePermissions } from '@/utils/usePermissions';
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
 * The button, or the button disabled with the reason on hover when the user may not use it: the button itself must be
 * disabled too.
 */
export function Permitted({ allowed, children }) {
  if (allowed) {
    return children;
  }
  // A disabled button gets no hover events: its wrapper does
  return <Tooltip title="ليست لديك صلاحية"><span>{children}</span></Tooltip>;
}

/**
 * The actions under the grid: for a draft, its next step (posting by default) and deleting it; "جديد" once there's a
 * document; then the totals (children), at the far end. The actions wait while requests are pending: a line sent
 * must be answered before the draft is posted or deleted.
 *
 * @param newStep  { onClick, label, icon }: how a new document is saved, for one without lines (others are created by
 *                 their first line)
 * @param newStepRef the new step's button, for Enter to reach it
 * @param api      where the document's endpoints are (useDocument's api): a step is offered only to a user with its
 *                 endpoint's permission (usePermissions), e.g. "POST /api/sales-invoices/{id}/post"
 * @param nextStep { onClick, disabled, label?, icon?, endpoint? }: the draft's next step; posting unless a label says
 *                 otherwise; endpoint: its path after the draft's, '/post' by default
 * @param otherSteps [{ key, onClick, disabled, label, icon?, endpoint, allowed? }]: a draft's other steps, beside its
 *                 next one (a sales invoice posted without its batches phase); allowed: false when a permission
 *                 that isn't an endpoint's is missing too (sales:post-without-batches)
 * @param pending  how many requests are still to be answered
 * @param onPrint  opens the document's printout, for a document that has one; offered once it's saved, to a user who
 *                 may print it (GET {api}/{id}/print)
 */
export function DocumentActions({
  api, isNew, isDraft, pending, newStep, newStepRef, nextStep, otherSteps = [], onDeleteDraft, onNew, onPrint,
  children,
}) {
  const permissions = usePermissions();
  const mayCreate = permissions.has(`POST ${api}`);
  const mayDelete = permissions.has(`DELETE ${api}/{id}`);
  const mayTake = (step) => step.allowed !== false && permissions.has(`POST ${api}/{id}${step.endpoint ?? '/post'}`);
  const mayPrint = permissions.has(`GET ${api}/{id}/print`);

  const waiting = pending > 0;
  return <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
    {isNew && newStep && <Permitted allowed={mayCreate}>
      <Button ref={newStepRef} variant="contained" startIcon={newStep.icon} disabled={waiting || !mayCreate}
        onClick={newStep.onClick}>
        {newStep.label}
      </Button>
    </Permitted>}
    {isDraft && <>
      <Permitted allowed={mayTake(nextStep)}>
        <Button variant="contained" color="success" startIcon={nextStep.icon ?? <SendIcon />}
          disabled={waiting || nextStep.disabled || !mayTake(nextStep)} onClick={nextStep.onClick}>
          {nextStep.label ?? 'ترحيل'}
        </Button>
      </Permitted>
      {otherSteps.map((step) => <Permitted key={step.key} allowed={mayTake(step)}>
        <Button variant="outlined" color="success" startIcon={step.icon ?? <SendIcon />}
          disabled={waiting || step.disabled || !mayTake(step)} onClick={step.onClick}>
          {step.label}
        </Button>
      </Permitted>)}
      <Permitted allowed={mayDelete}>
        <Button color="error" startIcon={<DeleteForeverIcon />} disabled={waiting || !mayDelete}
          onClick={onDeleteDraft}>
          حذف المسودة
        </Button>
      </Permitted>
    </>}
    {!isNew && onPrint && <Permitted allowed={mayPrint}>
      <Button startIcon={<PrintIcon />} disabled={waiting || !mayPrint} onClick={onPrint}>طباعة</Button>
    </Permitted>}
    {!isNew && <Button startIcon={<AddIcon />} disabled={waiting} onClick={onNew}>جديد</Button>}
    <PendingIndicator pending={pending} />
    <Box sx={{ flex: 1 }} />
    {children}
  </Stack>;
}
