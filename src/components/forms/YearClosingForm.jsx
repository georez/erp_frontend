'use client';

import { Alert, Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography }
  from '@mui/material';
import useSWR from 'swr';
import { useContext, useState } from 'react';
import { AuthContext } from '@/components/AuthProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatStatementAmount, toAsciiDigits } from '@/utils/decimals';
import { fetchJson, readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';
import { openLinkOnPlainClick, useOpenLink } from '@/utils/useOpenLink';

const CLOSINGS_URL = '/api/year-closings';
const YEAR = /^\d{4}$/;
const AMOUNT_CELL = { textAlign: 'start', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const TOTAL_CELL = { fontWeight: 'bold', borderTop: 1, borderTopColor: 'text.primary' };

/** A date-time as the backend sends it ("2026-11-11T08:30:00.123"), to the minute. */
const shownDateTime = (value) => (value ? value.replace('T', ' ').slice(0, 16) : '');

/** A closing entry in the journal entry window. */
const entryUrl = (entryId) => `/dashboard/journal-entry?formTitle=${encodeURIComponent('قيد يومية')}&entryId=${entryId}`;

/**
 * Year-end closing (إقفال السنة, /api/year-closings): a year's preview (each income and expense account's amount, the
 * net profit, the drawings), closing it, and the closed years, the latest of which may be reopened. Closing posts one
 * entry on the year's last moment; from then on nothing may be dated in the year or before it.
 *
 * @param {string} [props.year] the year to show, from the URL (a closing entry's link); else the year to close next
 */
export default function YearClosingForm({ year: linkedYear }) {
  const { csrfFetch } = useContext(AuthContext);
  const confirm = useConfirm();
  const openLink = useOpenLink();
  const { data: closings, error: loadError, mutate } = useSWR(CLOSINGS_URL, fetchJson, { revalidateOnFocus: false });
  const [errorMessage, setErrorMessage] = useState(null);
  const [sending, setSending] = useState(false);

  // The year typed (or the one the page was opened for); until then, the year to close next
  const [typedYear, setTypedYear] = useState(linkedYear ?? null);
  const yearText = typedYear ?? (closings?.nextYear != null ? String(closings.nextYear) : '');
  const year = YEAR.test(yearText) ? Number(yearText) : null;

  // The year previewed: shown until another is previewed, or the year is closed
  const [previewYear, setPreviewYear] = useState(null);
  const { data: preview, error: previewError } = useSWR(
    previewYear != null ? `${CLOSINGS_URL}/${previewYear}/preview` : null, fetchJson, { revalidateOnFocus: false });

  /** Sends a request whose answer is the closings, and shows them; false when it's refused or fails. */
  const send = async (url) => {
    setErrorMessage(null);
    setSending(true);
    try {
      const response = await sendOrShowError(() => csrfFetch(url, { method: 'POST' }), setErrorMessage);
      if (!response) {
        return false;
      }
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response));
        return false;
      }
      await mutate(await response.json(), { revalidate: false });
      return true;
    } finally {
      setSending(false);
    }
  };

  const showPreview = () => {
    setErrorMessage(null);
    setPreviewYear(year);
  };

  const closeYear = async () => {
    if (!await confirm({
      title: `إقفال سنة ${previewYear}؟`,
      message: `يُرحَّل قيد الإقفال بتاريخ 31/12/${previewYear}: تُقفل الإيرادات والمصروفات في الأرباح المحتجزة `
        + 'والمسحوبات في رأس المال، ولا يُقبل بعده قيد بتاريخ في هذه السنة أو قبلها.',
      confirmLabel: 'إقفال',
      color: 'warning',
    })) {
      return;
    }
    if (await send(`${CLOSINGS_URL}/${previewYear}`)) {
      setPreviewYear(null);
      setTypedYear(null);
    }
  };

  const reopenYear = async (closedYear) => {
    if (!await confirm({
      title: `إعادة فتح سنة ${closedYear}؟`,
      message: 'يُعكس قيد إقفالها بنفس تاريخه، فتُقبل القيود بتاريخ فيها من جديد. يمكن إقفالها مرة أخرى بعد التصحيح.',
      confirmLabel: 'إعادة فتح',
      color: 'error',
    })) {
      return;
    }
    if (await send(`${CLOSINGS_URL}/${closedYear}/reopen`)) {
      setPreviewYear(null);
      setTypedYear(null);
    }
  };

  const shownError = errorMessage ?? previewError?.message ?? loadError?.message;
  const closedYears = closings?.closedYears ?? [];

  return <Box sx={{ height: '100%', overflow: 'auto', p: 2, boxSizing: 'border-box' }}>
    <Stack spacing={2} sx={{ maxWidth: 760 }}>
      <Typography variant="h6">إقفال السنة</Typography>
      <Alert severity="info">
        إقفال السنة يُرحِّل قيداً واحداً في آخر لحظة من 31 ديسمبر: يُصفِّر أرصدة الإيرادات والمصروفات في تلك السنة
        ويُحمِّل صافيها على الأرباح المحتجزة، ويُقفل المسحوبات في رأس المال. بعدها لا يُقبل قيد بتاريخ في السنة المقفلة
        أو قبلها. تُقفل السنوات بالترتيب، وتُعاد فتح آخر سنة مقفلة فقط.
        <br />
        الميزانية في آخر يوم من سنة مقفلة تُظهر ربح السنة في سطر مستقل كما كانت قبل الإقفال، فيختلف رصيد الأرباح المحتجزة
        (ورأس المال والمسحوبات) فيها في ذلك اليوم وحده عن كشف حسابها وميزان المراجعة؛ إجمالي حقوق الملكية واحد.
      </Alert>
      {shownError && <Alert severity="error" onClose={errorMessage ? () => setErrorMessage(null) : undefined}>
        {shownError}
      </Alert>}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField size="small" label="السنة" value={yearText} sx={{ width: 140 }}
          error={yearText !== '' && year == null} helperText={yearText !== '' && year == null ? 'أربعة أرقام' : ' '}
          slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'numeric' } }}
          onChange={(event) => setTypedYear(toAsciiDigits(event.target.value).trim())}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && year != null) {
              showPreview();
            }
          }} />
        <Button variant="outlined" onClick={showPreview} disabled={year == null}>معاينة</Button>
      </Stack>

      {preview && previewYear === preview.year && <YearPreview preview={preview} sending={sending}
        onClose={closeYear} />}

      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>السنوات المقفلة</Typography>
      {closedYears.length === 0
        ? <Typography color="text.secondary">لم تُقفل أي سنة بعد.</Typography>
        : <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>السنة</TableCell>
              <TableCell>قيد الإقفال</TableCell>
              <TableCell>أقفلها</TableCell>
              <TableCell>في</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {closedYears.map((closed, index) => <TableRow key={closed.year}>
              <TableCell>{closed.year}</TableCell>
              <TableCell>
                <a href={entryUrl(closed.entryId)} target="_blank" rel="noopener noreferrer"
                  onClick={(event) => openLinkOnPlainClick(event, openLink, entryUrl(closed.entryId), 'قيد يومية')}>
                  القيد {closed.entryId}
                </a>
              </TableCell>
              <TableCell>{closed.closedBy}</TableCell>
              <TableCell><bdi dir="ltr">{shownDateTime(closed.closedAt)}</bdi></TableCell>
              <TableCell>
                {/* Only the latest closed year reopens */}
                {index === 0 && <Button size="small" color="error" disabled={sending}
                  onClick={() => reopenYear(closed.year)}>إعادة فتح</Button>}
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>}
    </Stack>
  </Box>;
}

/** What closing the year would do: each account's amount as the income statement shows it, the net, the drawings. */
function YearPreview({ preview, sending, onClose }) {
  const hasDrawings = Number(preview.drawings) !== 0;
  const isLoss = Number(preview.netProfit) < 0;
  return <Stack spacing={1}>
    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>معاينة إقفال سنة {preview.year}</Typography>
    {preview.datedDrafts > 0 && <Alert severity="warning">
      توجد {preview.datedDrafts} مسودة قيد مؤرخة في هذه السنة: بعد الإقفال لا يمكن ترحيلها إلا بعد تغيير تاريخها.
    </Alert>}
    {preview.lines.length === 0 && !hasDrawings
      ? <Typography color="text.secondary">
        لا توجد إيرادات أو مصروفات أو مسحوبات في هذه السنة: تُقفل بقيد بلا سطور.
      </Typography>
      : <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>الحساب</TableCell>
            <TableCell>العميل / المورد</TableCell>
            <TableCell sx={{ width: 180 }}>المبلغ</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {preview.lines.map((line) => <TableRow key={`${line.accountId}/${line.partyName ?? ''}`}>
            <TableCell>{line.accountName}</TableCell>
            <TableCell>{line.partyName}</TableCell>
            <TableCell sx={AMOUNT_CELL}><bdi dir="ltr">{formatStatementAmount(line.amount)}</bdi></TableCell>
          </TableRow>)}
          <TableRow>
            <TableCell sx={TOTAL_CELL} colSpan={2}>
              {isLoss ? 'صافي الخسارة (يُحمَّل على الأرباح المحتجزة)' : 'صافي الربح (إلى الأرباح المحتجزة)'}
            </TableCell>
            <TableCell sx={{ ...TOTAL_CELL, ...AMOUNT_CELL }}>
              <bdi dir="ltr">{formatStatementAmount(preview.netProfit)}</bdi>
            </TableCell>
          </TableRow>
          {hasDrawings && <TableRow>
            <TableCell colSpan={2}>المسحوبات (تُقفل في رأس المال)</TableCell>
            <TableCell sx={AMOUNT_CELL}><bdi dir="ltr">{formatStatementAmount(preview.drawings)}</bdi></TableCell>
          </TableRow>}
        </TableBody>
      </Table>}
    <Box>
      <Button variant="contained" color="warning" disabled={sending} onClick={onClose}>
        إقفال سنة {preview.year}
      </Button>
    </Box>
  </Stack>;
}
