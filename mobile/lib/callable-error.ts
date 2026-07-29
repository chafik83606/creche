import { FirebaseError } from 'firebase/app';

const MESSAGES: Record<string, string> = {
  'functions/not-found':
    'Aucun compte trouvé avec cet email. La personne doit d\'abord créer un compte.',
  'functions/permission-denied': 'Action non autorisée.',
  'functions/invalid-argument': 'Informations invalides. Vérifiez les champs.',
  'functions/failed-precondition': 'Action impossible dans l\'état actuel.',
  'functions/internal': 'Erreur serveur. Réessayez dans un instant.',
};

export function getCallableErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? error.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
