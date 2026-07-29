import { useEffect, useState } from 'react';
import { User, onIdTokenChanged, getIdTokenResult } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { CustomClaims, UserRole } from '@creche/shared';
import { ROLES } from '@creche/shared';

interface AuthState {
  user: User | null;
  claims: CustomClaims | null;
  role: UserRole | null;
  homeRoute: string | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    claims: null,
    role: null,
    homeRoute: null,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, claims: null, role: null, homeRoute: null, loading: false });
        return;
      }

      const tokenResult = await getIdTokenResult(user);
      const claims = tokenResult.claims as unknown as CustomClaims;
      const role = claims.role ?? null;
      const homeRoute = role ? ROLES[role].homeRoute : null;

      setState({ user, claims, role, homeRoute, loading: false });
    });

    return unsubscribe;
  }, []);

  return state;
}
