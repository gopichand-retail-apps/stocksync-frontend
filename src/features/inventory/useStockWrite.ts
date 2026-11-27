import { useEffect, useRef, useState } from 'react';
import { ApiClientError, type StockWriteOptions } from '../../api/client';
import { useContent } from '../../content-context';

const writeTimeoutMs = 15_000;

function rejectionCode(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.httpStatus === undefined) return null;
  const status = error.httpStatus;
  return status >= 400 && status < 500 && status !== 408 ? error.code : null;
}

export function useStockWrite(isReceipt: boolean) {
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

  async function submit<Input, Result>({
    input,
    execute,
    onConfirmed,
    onRejected,
  }: {
    input: Input;
    execute: (input: Input, options: StockWriteOptions) => Promise<Result> | Result;
    onConfirmed: (result: Result) => void;
    onRejected?: (code: string) => void;
  }) {
    if (active.current) return;
    const attempt = new AbortController();
    const timeout = window.setTimeout(() => attempt.abort(), writeTimeoutMs);
    active.current = attempt;
    const payload = JSON.stringify(input);
    if (intent.current?.payload !== payload) {
      intent.current = { key: crypto.randomUUID(), payload };
      setIsUnconfirmed(false);
    }
    setIsSubmitting(true);
    setErrorCode(null);

    let result: Result;
    try {
      result = await execute(input, { idempotencyKey: intent.current.key, signal: attempt.signal });
    } catch (error) {
      // Unmount clears the key. A deadline abort leaves this intent available for a retry.
      if (intent.current === null) return;
      const code = rejectionCode(error);
      if (code) {
        setErrorCode(code);
        onRejected?.(code);
      } else setIsUnconfirmed(true);
      return;
    } finally {
      window.clearTimeout(timeout);
      active.current = null;
      if (intent.current !== null) setIsSubmitting(false);
    }
    if (intent.current === null) return;
    resetIntent();
    onConfirmed(result);
  }

  const messageKey = `errors.${errorCode}`;
  const fallback = isReceipt ? 'operation.receipt.rejected' : 'errors.requestFailed';
  const rejectionKey = Object.hasOwn(model.messages, messageKey) ? messageKey : fallback;
  const error = errorCode && t(isUnconfirmed ? 'operation.retryRejected' : rejectionKey);
  return { submit, resetIntent, isSubmitting, isUnconfirmed, error };
}
