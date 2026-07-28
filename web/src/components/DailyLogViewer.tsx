'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { paths } from '@creche/shared';
import type { DailyLog } from '@creche/shared';

interface Props {
  tenantId: string;
  childId: string;
  childName: string;
  date?: string;
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  snack: 'Goûter',
};

const QUANTITY_LABELS: Record<string, string> = {
  none: 'Rien',
  little: 'Peu',
  half: 'Moitié',
  all: 'Tout',
};

export function DailyLogViewer({ tenantId, childId, childName, date }: Props) {
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);

  const targetDate = date ?? new Date().toISOString().split('T')[0];

  useEffect(() => {
    async function load() {
      setLoading(true);
      const snap = await getDoc(doc(db, paths.dailyLog(tenantId, childId, targetDate)));
      setLog(snap.exists() ? (snap.data() as DailyLog) : null);
      setLoading(false);
    }
    load();
  }, [tenantId, childId, targetDate]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Chargement du carnet...</div>;
  }

  if (!log) {
    return (
      <div className="p-8 text-center text-gray-500">
        Aucune saisie pour le {targetDate}.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Carnet de {childName}
      </h1>
      <p className="text-sm text-gray-500 mb-8">{targetDate}</p>

      {log.meals.length > 0 && (
        <Section title="Repas" icon="🍽️">
          {log.meals.map((meal) => (
            <Entry key={meal.id}>
              <span className="font-medium">{MEAL_LABELS[meal.type]}</span>
              {' — '}
              {QUANTITY_LABELS[meal.quantity]}
              {meal.accepted ? ' (accepté)' : ' (refusé)'}
              {meal.notes && <p className="text-sm text-gray-500 mt-1">{meal.notes}</p>}
            </Entry>
          ))}
        </Section>
      )}

      {log.naps.length > 0 && (
        <Section title="Siestes" icon="😴">
          {log.naps.map((nap) => (
            <Entry key={nap.id}>
              Qualité : {nap.quality}
              {nap.durationMinutes && ` — ${nap.durationMinutes} min`}
              {nap.notes && <p className="text-sm text-gray-500 mt-1">{nap.notes}</p>}
            </Entry>
          ))}
        </Section>
      )}

      {log.health.length > 0 && (
        <Section title="Santé" icon="🩺">
          {log.health.map((h) => (
            <Entry key={h.id}>
              {h.temperature && <span>Température : {h.temperature}°C</span>}
              {h.medication && <span> — Médicament : {h.medication}</span>}
              {h.incident && <p className="text-sm text-red-600 mt-1">{h.incident}</p>}
            </Entry>
          ))}
        </Section>
      )}

      {log.activities.length > 0 && (
        <Section title="Activités" icon="🎨">
          {log.activities.map((a) => (
            <Entry key={a.id}>
              <span className="font-medium capitalize">{a.category}</span> — {a.description}
              {a.photoUrl && (
                <img src={a.photoUrl} alt="" className="mt-2 rounded-lg max-h-48 object-cover" />
              )}
            </Entry>
          ))}
        </Section>
      )}

      {log.diapers.length > 0 && (
        <Section title="Changes" icon="🧷">
          {log.diapers.map((d) => (
            <Entry key={d.id}>
              {d.type === 'wet' ? 'Couche humide' : d.type === 'dirty' ? 'Couche sale' : 'Les deux'}
            </Entry>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">
        {icon} {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Entry({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">{children}</div>
  );
}
