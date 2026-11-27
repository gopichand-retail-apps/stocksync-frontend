import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useContent } from '../../content-context';
import { LedgerTable } from './MovementTables';

function RecentReceipts({ locationId }: { locationId: string }) {
  const { t } = useContent();
  const ledger = useQuery({
    queryKey: ['ledger', locationId],
    queryFn: () => api.listLedger(locationId),
    networkMode: 'always',
    retry: false,
  });

  if (ledger.isPending || ledger.isFetching) return <p role="status">{t('operation.receipt.loadingLedger')}</p>;
  if (ledger.isError) return <p role="alert">{t('operation.receipt.ledgerUnavailable')}</p>;
  return <LedgerTable entries={ledger.data.filter((entry) => entry.movementType === 'receipt')} />;
}

export function ReceiptLedgerPreview({ locationId }: { locationId: string }) {
  const { t } = useContent();
  const [expanded, setExpanded] = useState(false);
  return (
    <details className="receipt-ledger-preview" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>{t('operation.receipt.inspectLedger')}</summary>
      {expanded && <RecentReceipts locationId={locationId} />}
    </details>
  );
}
