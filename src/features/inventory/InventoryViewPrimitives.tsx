import type { ReactNode } from 'react';
import { Package } from 'lucide-react';
import type { InventoryItem } from '../../api/client';

export function ProductSwatch({ item }: { item: InventoryItem }) {
  return (
    <span aria-hidden="true" className={`product-swatch tone-${item.accent}`}>
      <Package size={15} />
    </span>
  );
}

export function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="empty-state table-frame">
      {icon}
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
