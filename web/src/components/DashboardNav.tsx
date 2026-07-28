'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

const DEMO_TENANT_ID = 'demo-creche';
const DEMO_CHILD_ID = 'demo-child-001';
const DEMO_CHILD_NAME = 'Léa Martin';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Carnet' },
  { href: '/dashboard/messages', label: 'Annonces' },
  { href: '/dashboard/chat', label: 'Messages' },
];

export function DashboardNav({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Chargement...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold">Crèche — Espace parents</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-80">{user.email}</span>
          <button
            onClick={() => signOut(auth)}
            className="text-sm bg-white/20 px-3 py-1 rounded-lg hover:bg-white/30"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <nav className="bg-white border-b px-6 flex gap-6">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`py-3 text-sm font-medium border-b-2 ${
                isActive
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-800'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {role === 'parent' ? (
        <p className="text-xs text-gray-400 px-6 py-2 bg-white border-b">
          Tenant: {DEMO_TENANT_ID} | Enfant: {DEMO_CHILD_NAME}
        </p>
      ) : (
        <p className="text-xs text-amber-600 px-6 py-2 bg-amber-50 border-b">
          Rôle actuel : {role ?? 'non attribué'} — la version web est réservée aux parents.
        </p>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}

export { DEMO_TENANT_ID, DEMO_CHILD_ID, DEMO_CHILD_NAME };
