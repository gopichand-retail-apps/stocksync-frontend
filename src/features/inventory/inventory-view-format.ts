export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatTime(value: string, locale: string, unavailable: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? unavailable
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
