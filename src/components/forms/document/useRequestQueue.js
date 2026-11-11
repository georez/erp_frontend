'use client';

import { useRef, useState } from 'react';
import { readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';

/**
 * A document form's requests to the backend, sent one at a time in the order they're made: a line saved, another
 * deleted, the draft posted... The user needn't wait for one to be answered before the next.
 *
 * - enqueue(task, about): runs the task once the tasks queued before it are done; returns its result. about: what the
 *   task sends (a line's product), named with its requests' errors; may be left out.
 * - send(url, method, body): sends one request (inside a task); returns the backend's answer ({} for an empty one),
 *   or null after showing why it failed: showError(message, about). The user has typed on meanwhile, so it's not
 *   shown in the form (a toast).
 * - pending: how many tasks are still to finish. The document's actions (posting, deleting) wait for zero.
 */
export function useRequestQueue(csrfFetch, showError) {
  const [pending, setPending] = useState(0);
  const lastTask = useRef(Promise.resolve());
  // What the running task sends: tasks run one at a time
  const aboutRef = useRef(null);

  const enqueue = (task, about = null) => {
    setPending((count) => count + 1);
    const run = lastTask.current.then(() => {
      aboutRef.current = about;
      return task();
    }).finally(() => setPending((count) => count - 1));
    // A failed task doesn't stop the ones after it
    lastTask.current = run.catch(() => {});
    return run;
  };

  const send = async (url, method, body) => {
    const about = aboutRef.current;
    const hasBody = body !== undefined;
    const response = await sendOrShowError(() => csrfFetch(url, {
      method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    }), (message) => showError(message, about));
    if (!response) {
      return null;
    }
    if (!response.ok) {
      showError(await readErrorMessage(response), about);
      return null;
    }
    if (response.status === 204) {
      return {};
    }
    return response.json();
  };

  return { enqueue, send, pending };
}
