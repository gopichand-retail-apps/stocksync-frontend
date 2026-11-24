import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError, type ReceiptInput, type ReceiptResult } from '../../api/client';
import { useContent } from '../../content-context';

const receiptTimeoutMs = 15_000;

function rejectionCode(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.httpStatus === undefined) return null;
  const status = error.httpStatus;
  return status >= 400 && status < 500 && status !== 408 ? error.code : null;
}

export function useReceiptConfirmation(onRecorded: (receipt: ReceiptResult) => void) {
  const { model, t } = useContent();
  const intent = useRef<{ key: string; payload: string } | null>(null);
  const active = useRef<AbortController | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnconfirmed, setIsUnconfirmed] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      active.current?.abort();
      intent.current = null;
    };
  }, []);

  function resetIntent() {
    if (active.current) return;
    intent.current = null;
    setIsUnconfirmed(false);
    setErrorCode(null);
  }

  async function submit(input: ReceiptInput) {
    if (active.current) return;
    const attempt = new AbortController();
    const timeout = window.setTimeout(() => attempt.abort(), receiptTimeoutMs);
    active.current = attempt;
    const payload = JSON.stringify(input);
    if (intent.current?.payload !== payload) {
      intent.current = { key: crypto.randomUUID(), payload };
      setIsUnconfirmed(false);
    }
    setIsSubmitting(true);
    setErrorCode(null);

    let receipt: ReceiptResult;
    try {
      receipt = await api.receiveStock(input, { idempotencyKey: intent.current.key, signal: attempt.signal });
    } catch (error) {
      // Unmount clears the key. A deadline abort leaves this intent available for a retry.
      if (intent.current === null) return;
      const code = rejectionCode(error);
      if (code) setErrorCode(code);
      else setIsUnconfirmed(true);
      return;
    } finally {
      window.clearTimeout(timeout);
      active.current = null;
      if (intent.current !== null) setIsSubmitting(false);
    }
    if (intent.current === null) return;
    resetIntent();
    onRecorded(receipt);
  }

  const messageKey = `errors.${errorCode}`;
  const error = errorCode
    ? t(Object.hasOwn(model.messages, messageKey) ? messageKey : 'operation.receipt.rejected')
    : null;
  return { submit, resetIntent, isSubmitting, isUnconfirmed, error };
}
