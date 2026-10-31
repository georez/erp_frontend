'use client';

import { useRef, useState } from 'react';
import { readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';

/**
 * A document form's requests to the backend, sent one at a time in the order they're made: a line saved, another
 * deleted, the draft posted... The user needn't wait for one to be answered before the next.
 *
 * - enqueue(task): runs the task once the tasks queued before it are done; returns its result.
 * - send(url, method, body): sends one request (inside a task); returns the backend's answer ({} for an empty one),
 *   or null after setting errorMessage to why it failed.
 * - pending: how many tasks are still to finish. The document's actions (posting, deleting) wait for zero.
 */
export function useRequestQueue(csrfFetch) {
  const [errorMessage, setErrorMessage] = useState(null);
  const [pending, setPending] = useState(0);
  const lastTask = useRef(Promise.resolve());

  const enqueue = (task) => {
    // The message of an earlier failure goes when the user acts again, not when a later request happens to succeed
    setErrorMessage(null);
    setPending((count) => count + 1);
    const run = lastTask.current.then(task).finally(() => setPending((count) => count - 1));
    // A failed task doesn't stop the ones after it
    lastTask.current = run.catch(() => {});
    return run;
  };

  const send = async (url, method, body) => {
    const hasBody = body !== undefined;
    const response = await sendOrShowError(() => csrfFetch(url, {
      method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    }), setErrorMessage);
    if (!response) {
      return null;
    }
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response));
      return null;
    }
    if (response.status === 204) {
      return {};
    }
    return response.json();
  };

  return { enqueue, send, pending, errorMessage, setErrorMessage };
}
