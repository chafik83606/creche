/** Formate une date Firestore (Timestamp) ou Date native. */
export function formatFirestoreDate(
  value: unknown,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!value) return '';

  const defaultOptions: Intl.DateTimeFormatOptions = options ?? {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toLocaleDateString('fr-FR', defaultOptions);
  }

  if (value instanceof Date) {
    return value.toLocaleDateString('fr-FR', defaultOptions);
  }

  return '';
}

export function getFirestoreTime(value: unknown): number {
  if (!value) return 0;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function formatFirestoreTime(value: unknown): string {
  if (!value) return '';

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (value instanceof Date) {
    return value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  return '';
}
