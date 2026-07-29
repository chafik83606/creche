import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { auth } from '../lib/firebase';
import { paths } from '@creche/shared';
import type {
  MealEntry, MealType, MealQuantity,
  NapEntry, NapQuality,
  ActivityEntry, ActivityCategory,
  HealthEntry,
  DiaperEntry,
} from '@creche/shared';

interface Props {
  tenantId: string;
  childId: string;
  childName: string;
  readOnly?: boolean;
}

type EntrySection = 'repas' | 'sieste' | 'activite' | 'sante' | 'change';

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Petit-déjeuner' },
  { value: 'lunch', label: 'Déjeuner' },
  { value: 'snack', label: 'Goûter' },
];
const QUANTITIES: { value: MealQuantity; label: string }[] = [
  { value: 'none', label: 'Rien' },
  { value: 'little', label: 'Peu' },
  { value: 'half', label: 'Moitié' },
  { value: 'all', label: 'Tout' },
];
const NAP_QUALITIES: { value: NapQuality; label: string }[] = [
  { value: 'good', label: 'Bien' },
  { value: 'average', label: 'Moyen' },
  { value: 'poor', label: 'Difficile' },
];
const ACTIVITY_CATEGORIES: { value: ActivityCategory; label: string }[] = [
  { value: 'motor', label: 'Motricité' },
  { value: 'art', label: 'Art' },
  { value: 'music', label: 'Musique' },
  { value: 'outdoor', label: 'Extérieur' },
  { value: 'other', label: 'Autre' },
];
const DIAPER_TYPES: { value: DiaperEntry['type']; label: string }[] = [
  { value: 'wet', label: 'Pipi' },
  { value: 'dirty', label: 'Selles' },
  { value: 'both', label: 'Les deux' },
];
const SECTION_TABS: { value: EntrySection; label: string }[] = [
  { value: 'repas', label: 'Repas' },
  { value: 'sieste', label: 'Sieste' },
  { value: 'activite', label: 'Activités' },
  { value: 'sante', label: 'Santé' },
  { value: 'change', label: 'Change' },
];

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

interface DayData {
  meals: MealEntry[];
  naps: NapEntry[];
  activities: ActivityEntry[];
  health: HealthEntry[];
  diapers: DiaperEntry[];
}

const EMPTY_DAY: DayData = { meals: [], naps: [], activities: [], health: [], diapers: [] };

export function DailyTrackingScreen({
  tenantId,
  childId,
  childName,
  readOnly = false,
}: Props) {
  const [section, setSection] = useState<EntrySection>('repas');

  const [mealType, setMealType] = useState<MealType>('lunch');
  const [quantity, setQuantity] = useState<MealQuantity>('all');
  const [accepted, setAccepted] = useState(true);

  const [napQuality, setNapQuality] = useState<NapQuality>('good');
  const [napDuration, setNapDuration] = useState('');

  const [activityCategory, setActivityCategory] = useState<ActivityCategory>('motor');
  const [activityDesc, setActivityDesc] = useState('');

  const [temperature, setTemperature] = useState('');
  const [healthIncident, setHealthIncident] = useState('');

  const [diaperType, setDiaperType] = useState<DiaperEntry['type']>('wet');

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dayData, setDayData] = useState<DayData>(EMPTY_DAY);

  const date = todayKey();
  const logPath = paths.dailyLog(tenantId, childId, date);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const snap = await getDoc(doc(db, logPath));
      if (cancelled) return;
      if (snap.exists()) {
        const d = snap.data();
        setDayData({
          meals: d.meals ?? [],
          naps: d.naps ?? [],
          activities: d.activities ?? [],
          health: d.health ?? [],
          diapers: d.diapers ?? [],
        });
      } else {
        setDayData(EMPTY_DAY);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId, childId, date]);

  async function ensureLogAndUpdate(field: string, entry: Record<string, unknown>) {
    const logRef = doc(db, logPath);
    const existing = await getDoc(logRef);
    if (existing.exists()) {
      await updateDoc(logRef, { [field]: arrayUnion(entry), updatedAt: serverTimestamp() });
    } else {
      await setDoc(logRef, {
        id: date, childId, date,
        meals: [], naps: [], health: [], activities: [], diapers: [],
        [field]: [entry],
        summarySent: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  async function saveEntry() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      if (section === 'repas') {
        const entry: MealEntry = {
          id: `meal_${Date.now()}`, time: new Date(), type: mealType,
          quantity, accepted, notes: notes.trim() || undefined, recordedBy: uid,
        };
        await ensureLogAndUpdate('meals', entry as unknown as Record<string, unknown>);
        setDayData((p) => ({ ...p, meals: [...p.meals, entry] }));
        Alert.alert('Enregistré', 'Repas ajouté.');
      } else if (section === 'sieste') {
        const dur = parseInt(napDuration, 10) || undefined;
        const entry: NapEntry = {
          id: `nap_${Date.now()}`, sleepTime: new Date(), quality: napQuality,
          durationMinutes: dur, notes: notes.trim() || undefined, recordedBy: uid,
        };
        await ensureLogAndUpdate('naps', entry as unknown as Record<string, unknown>);
        setDayData((p) => ({ ...p, naps: [...p.naps, entry] }));
        setNapDuration('');
        Alert.alert('Enregistré', 'Sieste ajoutée.');
      } else if (section === 'activite') {
        if (!activityDesc.trim()) return Alert.alert('Erreur', 'Décrivez l\'activité.');
        const entry: ActivityEntry = {
          id: `act_${Date.now()}`, time: new Date(), category: activityCategory,
          description: activityDesc.trim(), recordedBy: uid,
        };
        await ensureLogAndUpdate('activities', entry as unknown as Record<string, unknown>);
        setDayData((p) => ({ ...p, activities: [...p.activities, entry] }));
        setActivityDesc('');
        Alert.alert('Enregistré', 'Activité ajoutée.');
      } else if (section === 'sante') {
        const temp = parseFloat(temperature) || undefined;
        const entry: HealthEntry = {
          id: `health_${Date.now()}`, time: new Date(), temperature: temp,
          incident: healthIncident.trim() || undefined,
          notes: notes.trim() || undefined, recordedBy: uid,
        };
        await ensureLogAndUpdate('health', entry as unknown as Record<string, unknown>);
        setDayData((p) => ({ ...p, health: [...p.health, entry] }));
        setTemperature(''); setHealthIncident('');
        Alert.alert('Enregistré', 'Entrée santé ajoutée.');
      } else if (section === 'change') {
        const entry: DiaperEntry = {
          id: `diaper_${Date.now()}`, time: new Date(), type: diaperType,
          notes: notes.trim() || undefined, recordedBy: uid,
        };
        await ensureLogAndUpdate('diapers', entry as unknown as Record<string, unknown>);
        setDayData((p) => ({ ...p, diapers: [...p.diapers, entry] }));
        Alert.alert('Enregistré', 'Change ajouté.');
      }
      setNotes('');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'enregistrer.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  const totalEntries = dayData.meals.length + dayData.naps.length +
    dayData.activities.length + dayData.health.length + dayData.diapers.length;

  function renderInputForm() {
    if (section === 'repas') {
      return (
        <>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {MEAL_TYPES.map((t) => (
              <TouchableOpacity key={t.value} style={[styles.chip, mealType === t.value && styles.chipActive]} onPress={() => setMealType(t.value)}>
                <Text style={[styles.chipText, mealType === t.value && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Quantité</Text>
          <View style={styles.chipRow}>
            {QUANTITIES.map((q) => (
              <TouchableOpacity key={q.value} style={[styles.chip, quantity === q.value && styles.chipActive]} onPress={() => setQuantity(q.value)}>
                <Text style={[styles.chipText, quantity === q.value && styles.chipTextActive]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Acceptation</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, accepted && styles.chipActive]} onPress={() => setAccepted(true)}>
              <Text style={[styles.chipText, accepted && styles.chipTextActive]}>Accepté</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, !accepted && styles.chipReject]} onPress={() => setAccepted(false)}>
              <Text style={[styles.chipText, !accepted && styles.chipTextActive]}>Refusé</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }
    if (section === 'sieste') {
      return (
        <>
          <Text style={styles.label}>Qualité</Text>
          <View style={styles.chipRow}>
            {NAP_QUALITIES.map((q) => (
              <TouchableOpacity key={q.value} style={[styles.chip, napQuality === q.value && styles.chipActive]} onPress={() => setNapQuality(q.value)}>
                <Text style={[styles.chipText, napQuality === q.value && styles.chipTextActive]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Durée (minutes)</Text>
          <TextInput style={styles.input} placeholder="ex: 45" value={napDuration} onChangeText={setNapDuration} keyboardType="numeric" />
        </>
      );
    }
    if (section === 'activite') {
      return (
        <>
          <Text style={styles.label}>Catégorie</Text>
          <View style={styles.chipRow}>
            {ACTIVITY_CATEGORIES.map((a) => (
              <TouchableOpacity key={a.value} style={[styles.chip, activityCategory === a.value && styles.chipActive]} onPress={() => setActivityCategory(a.value)}>
                <Text style={[styles.chipText, activityCategory === a.value && styles.chipTextActive]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Description</Text>
          <TextInput style={styles.input} placeholder="Décrivez l'activité..." value={activityDesc} onChangeText={setActivityDesc} multiline />
        </>
      );
    }
    if (section === 'sante') {
      return (
        <>
          <Text style={styles.label}>Température (°C)</Text>
          <TextInput style={styles.input} placeholder="ex: 37.5" value={temperature} onChangeText={setTemperature} keyboardType="decimal-pad" />
          <Text style={styles.label}>Incident / Observation</Text>
          <TextInput style={styles.input} placeholder="Chute, bobo, médicament..." value={healthIncident} onChangeText={setHealthIncident} multiline />
        </>
      );
    }
    if (section === 'change') {
      return (
        <>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {DIAPER_TYPES.map((d) => (
              <TouchableOpacity key={d.value} style={[styles.chip, diaperType === d.value && styles.chipActive]} onPress={() => setDiaperType(d.value)}>
                <Text style={[styles.chipText, diaperType === d.value && styles.chipTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      );
    }
    return null;
  }

  function renderEntries() {
    const entries: { key: string; title: string; detail: string; note?: string }[] = [];

    for (const m of dayData.meals) {
      entries.push({
        key: m.id,
        title: `🍽 ${MEAL_TYPES.find((t) => t.value === m.type)?.label ?? m.type}`,
        detail: `${QUANTITIES.find((q) => q.value === m.quantity)?.label} — ${m.accepted ? 'Accepté' : 'Refusé'}`,
        note: m.notes,
      });
    }
    for (const n of dayData.naps) {
      entries.push({
        key: n.id,
        title: `😴 Sieste`,
        detail: `${NAP_QUALITIES.find((q) => q.value === n.quality)?.label}${n.durationMinutes ? ` — ${n.durationMinutes} min` : ''}`,
        note: n.notes,
      });
    }
    for (const a of dayData.activities) {
      entries.push({
        key: a.id,
        title: `🎨 ${ACTIVITY_CATEGORIES.find((c) => c.value === a.category)?.label ?? a.category}`,
        detail: a.description,
      });
    }
    for (const h of dayData.health) {
      entries.push({
        key: h.id,
        title: `🩺 Santé`,
        detail: [h.temperature ? `${h.temperature}°C` : '', h.incident].filter(Boolean).join(' — ') || 'Observation',
        note: h.notes,
      });
    }
    for (const d of dayData.diapers) {
      entries.push({
        key: d.id,
        title: `🧷 Change`,
        detail: DIAPER_TYPES.find((t) => t.value === d.type)?.label ?? d.type,
        note: d.notes,
      });
    }

    return entries;
  }

  const allEntries = renderEntries();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Carnet — {childName}</Text>
      <Text style={styles.date}>{date}</Text>

      {!readOnly && (
        <View style={styles.section}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionTabsScroll}>
            <View style={styles.sectionTabs}>
              {SECTION_TABS.map((t) => (
                <TouchableOpacity key={t.value} style={[styles.sectionTab, section === t.value && styles.sectionTabActive]} onPress={() => setSection(t.value)}>
                  <Text style={[styles.sectionTabText, section === t.value && styles.sectionTabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {renderInputForm()}

          <TextInput
            style={styles.input}
            placeholder="Notes (optionnel)"
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveEntry}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {readOnly ? 'Journée de votre enfant' : `Entrées du jour (${totalEntries})`}
        </Text>
        {loading ? (
          <ActivityIndicator color="#4a90d9" />
        ) : allEntries.length === 0 ? (
          <Text style={styles.emptyText}>
            {readOnly
              ? "Aucune entrée du carnet pour aujourd'hui (repas, sieste, activités, santé). L'éducateur le remplira pendant la journée."
              : 'Aucune entrée du carnet pour le moment.'}
          </Text>
        ) : (
          allEntries.map((e) => (
            <View key={e.key} style={styles.entryCard}>
              <Text style={styles.entryType}>{e.title}</Text>
              <Text style={styles.entryDetail}>{e.detail}</Text>
              {e.note && <Text style={styles.entryNotes}>{e.note}</Text>}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a2e' },
  date: { fontSize: 14, color: '#666', marginBottom: 20 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#1a1a2e' },
  label: { fontSize: 14, fontWeight: '500', color: '#444', marginBottom: 8, marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#4a90d9', borderColor: '#4a90d9' },
  chipReject: { backgroundColor: '#e74c3c', borderColor: '#e74c3c' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  entryCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  entryType: { fontWeight: '600', fontSize: 14, color: '#1a1a2e' },
  entryDetail: { fontSize: 13, color: '#666', marginTop: 2 },
  entryNotes: { fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' },
  emptyText: { fontSize: 14, color: '#888', lineHeight: 20 },
  sectionTabsScroll: { marginBottom: 12 },
  sectionTabs: { flexDirection: 'row', gap: 6 },
  sectionTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  sectionTabActive: { backgroundColor: '#4a90d9' },
  sectionTabText: { fontSize: 13, color: '#555', fontWeight: '500' },
  sectionTabTextActive: { color: '#fff', fontWeight: '600' },
});
