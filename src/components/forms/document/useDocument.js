'use client';

import useSWR, { useSWRConfig } from 'swr';
import { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '@/components/AuthProvider';
import { fetchJson } from '@/utils/fetchJson';
import { useUpdateOpenForms } from '@/utils/useUpdateSearchParams';
import { useRequestQueue } from './useRequestQueue';

/**
 * A document in a form window (stock adjustment, opening balance, purchase invoice or return, journal entry, payment).
 *
 * - New: the header is typed in. The first line's OK creates the draft with it; the window's URL then points to the
 *   draft. A document without lines (a payment) is created from its header alone (createFromHeader).
 * - Draft: the header can still be changed; a field is saved when it's left (saveHeader), a choice when it's made
 *   (changeHeader). Lines and actions are sent one request at a time (useRequestQueue); posting and deleting wait
 *   until every request is answered.
 * - Posted: nothing changes.
 *
 * @param api         the document's backend path, e.g. "/api/purchase-invoices"
 * @param documentId  the document the window shows; none for a new one
 * @param page        the window's page, e.g. "/dashboard/purchase-invoice"
 * @param idParam     the URL parameter of the document's id, e.g. "invoiceId"
 * @param emptyHeader a new document's header
 * @param headerFrom  the header of a document the backend sent
 * @param headerBody  what the backend takes for a header
 */
export function useDocument({
  api, documentId, formId, formTitle, page, idParam, emptyHeader, headerFrom, headerBody,
}) {
  const { csrfFetch } = useContext(AuthContext);
  const updateOpenFormUrl = useUpdateOpenForms(formId);
  const { mutate: mutateCache } = useSWRConfig();
  const requests = useRequestQueue(csrfFetch);

  const urlOf = (id, path = '') => `${api}/${id}${path}`;
  const { data: document, error: loadError } = useSWR(
    documentId ? urlOf(documentId) : null, fetchJson, { revalidateOnFocus: false });
  const draftIdRef = useDraftId(documentId);
  const shown = useHeaderShown(documentId, document, emptyHeader, headerFrom);

  const isNew = !documentId;
  const isPosted = document?.status === 'POSTED';
  const isDraft = document != null && !isPosted;
  // Also while the document loads, so the entry row stays mounted (and focused) when a first line creates the draft
  const editable = !isPosted;

  const openInWindow = (id) => {
    const idPart = id == null ? '' : `&${idParam}=${encodeURIComponent(id)}`;
    updateOpenFormUrl(`${page}?formTitle=${encodeURIComponent(formTitle)}${idPart}`);
  };

  /**
   * Sends a request to the document and shows what it answers with; loads the document again if it failed, showing
   * it as it was meanwhile (mutate with the key alone: given undefined as the data, SWR would empty the cache, and the
   * form would show a new document).
   */
  const sendAndShow = async (id, path, method, body) => {
    const answered = await requests.send(urlOf(id, path), method, body);
    if (answered) {
      await mutateCache(urlOf(id), answered, { revalidate: false });
    } else {
      await mutateCache(urlOf(id));
    }
    return answered != null;
  };

  // --- the header ---

  /** A field typed: kept, and saved when the field is left (saveHeader). */
  const editHeader = (changes) => shown.setHeader((previous) => ({ ...previous, ...changes }));

  /** Saves the header to the draft if it differs from what the draft has. A new document's first line saves it. */
  const saveHeader = (next = shown.header) => {
    if (!isDraft || sameBody(headerBody(next), headerBody(headerFrom(document)))) {
      return;
    }
    requests.enqueue(async () => {
      const saved = await sendAndShow(draftIdRef.current, '', 'PUT', headerBody(next));
      if (!saved) {
        shown.readAgain();
      }
    });
  };

  /** A choice made (a combobox): kept and saved at once. */
  const changeHeader = (changes) => {
    const next = { ...shown.header, ...changes };
    shown.setHeader(next);
    saveHeader(next);
  };

  // --- lines and actions ---

  /** Sends a line. A new document's first line creates the draft with the header first, and the window opens it. */
  const addLine = (line) => requests.enqueue(async () => {
    const createsTheDraft = draftIdRef.current == null;
    if (createsTheDraft) {
      const created = await requests.send(api, 'POST', headerBody(shown.header));
      if (!created) {
        return false;
      }
      draftIdRef.current = created.id;
    }
    const saved = await sendAndShow(draftIdRef.current, '/lines', 'PUT', line);
    if (createsTheDraft) {
      openInWindow(draftIdRef.current);
    }
    return saved;
  });

  /** Creates the draft from the header, for a document without lines; the window opens it. True if it was created. */
  const createFromHeader = () => requests.enqueue(async () => {
    const created = await requests.send(api, 'POST', headerBody(shown.header));
    if (!created) {
      return false;
    }
    draftIdRef.current = created.id;
    await mutateCache(urlOf(created.id), created, { revalidate: false });
    openInWindow(created.id);
    return true;
  });

  /** Sends a request to the draft (DELETE "/lines/3", POST "/post", PUT "/lines/3/batches" with a body...). */
  const sendToDraft = (path, method, body) =>
    requests.enqueue(() => sendAndShow(draftIdRef.current, path, method, body));

  /** Deletes the draft once the user confirms the question; true if it was deleted. */
  const deleteDraft = async (question) => {
    if (!window.confirm(question)) {
      return false;
    }
    return requests.enqueue(async () => (await requests.send(urlOf(draftIdRef.current), 'DELETE')) != null);
  };

  /**
   * Sends a request whose answer is another document (POST "/reverse" answers with the reversing entry), and opens
   * that one in the window; true if it was answered.
   */
  const sendAndOpenAnswer = (path, method, body) => requests.enqueue(async () => {
    const answered = await requests.send(urlOf(draftIdRef.current, path), method, body);
    if (!answered) {
      return false;
    }
    await mutateCache(urlOf(answered.id), answered, { revalidate: false });
    // The document sent from changed too (e.g. it's now reversed)
    await mutateCache(urlOf(draftIdRef.current));
    openDocument(answered.id);
    return true;
  });

  /** Another document in the window (e.g. one whose number was typed). */
  const openDocument = (id) => {
    requests.setErrorMessage(null);
    openInWindow(id);
  };

  /** A new document in the window, its header empty. */
  const openNew = () => {
    draftIdRef.current = null;
    shown.setHeader(emptyHeader);
    openInWindow(null);
    requests.setErrorMessage(null);
  };

  return {
    // The document as the backend has it (undefined for a new one), and why it couldn't be loaded
    document,
    loadError,
    isNew,
    isDraft,
    isPosted,
    editable,
    // The header shown, and changing it
    header: shown.header,
    editHeader,
    saveHeader,
    changeHeader,
    // The draft's requests, one at a time; pending: how many are still to be answered
    createFromHeader,
    addLine,
    sendToDraft,
    sendAndOpenAnswer,
    deleteDraft,
    openDocument,
    openNew,
    pending: requests.pending,
    errorMessage: requests.errorMessage,
    setErrorMessage: requests.setErrorMessage,
  };
}

/**
 * The id the queued requests go to: the window's document, or the draft a first line just created, which a second
 * line queued right behind it must use before the window has moved on to it. It follows the window's URL (Back to a
 * new document: none).
 */
function useDraftId(documentId) {
  const draftIdRef = useRef(documentId ?? null);
  useEffect(() => {
    draftIdRef.current = documentId ?? null;
  }, [documentId]);
  return draftIdRef;
}

/**
 * The header the form shows. It's read from a document once (by id and status); after that what's typed is the
 * truth, so the answer to a save can't overwrite a field being typed. readAgain() re-reads it, after a refused save.
 * It's read again when the document is posted, which may fill it in (a journal entry's date-time is set then), and
 * when the window's document changes (another one, Back, Forward), or emptied for a new one.
 */
function useHeaderShown(documentId, document, emptyHeader, headerFrom) {
  const [header, setHeader] = useState(emptyHeader);
  const [readFrom, setReadFrom] = useState(null);
  const [shownFor, setShownFor] = useState(documentId);
  // Set during render, not in an effect, so a stale header is never shown:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (documentId !== shownFor) {
    setShownFor(documentId);
    setReadFrom(null);
    if (!documentId) {
      setHeader(emptyHeader);
    }
  }
  const documentVersion = document ? `${document.id}/${document.status}` : null;
  if (document && documentVersion !== readFrom) {
    setReadFrom(documentVersion);
    setHeader(headerFrom(document));
  }
  return { header, setHeader, readAgain: () => setReadFrom(null) };
}

/** Whether two header bodies are the same values. */
const sameBody = (a, b) => JSON.stringify(a) === JSON.stringify(b);
