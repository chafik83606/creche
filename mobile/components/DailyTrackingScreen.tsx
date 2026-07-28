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
import type { MealEntry, MealType, MealQuantity } from '@creche/shared';

interface Props {
  tenantId: string;
  childId: string;
  childName: string;
}

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

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function DailyTrackingScreen({ tenantId, childId, childName }: Props) {
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [quantity, setQuantity] = useState<MealQuantity>('all');
  const [accepted, setAccepted] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [todayMeals, setTodayMeals] = useState<MealEntry[]>([]);

  const date = todayKey();
  const logPath = paths.dailyLog(tenantId, childId, date);

  React.useEffect(() => {
    loadTodayLog();
  }, [tenantId, childId]);

  async function loadTodayLog() {
    const snap = await getDoc(doc(db, logPath));
    if (snap.exists()) {
      setTodayMeals(snap.data().meals ?? []);
    }
  }

  async function saveMeal() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSaving(true);
    try {
      const entry: MealEntry = {
        id: `meal_${Date.now()}`,
        time: new Date(),
        type: mealType,
        quantity,
        accepted,
        notes: notes.trim() || undefined,
        recordedBy: uid,
      };

      const logRef = doc(db, logPath);
      const existing = await getDoc(logRef);

      if (existing.exists()) {
        await updateDoc(logRef, {
          meals: arrayUnion(entry),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(logRef, {
          id: date,
          childId,
          date,
          meals: [entry],
          naps: [],
          health: [],
          activities: [],
          diapers: [],
          summarySent: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setTodayMeals((prev) => [...prev, entry]);
      setNotes('');
      Alert.alert('Enregistré', 'Repas ajouté au carnet.');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'enregistrer le repas.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Carnet — {childName}</Text>
      <Text style={styles.date}>{date}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Repas</Text>

        <Text style={styles.label}>Type</Text>
        <View style={styles.chipRow}>
          {MEAL_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.chip, mealType === t.value && styles.chipActive]}
              onPress={() => setMealType(t.value)}
            >
              <Text style={[styles.chipText, mealType === t.value && styles.chipTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Quantité</Text>
        <View style={styles.chipRow}>
          {QUANTITIES.map((q) => (
            <TouchableOpacity
              key={q.value}
              style={[styles.chip, quantity === q.value && styles.chipActive]}
              onPress={() => setQuantity(q.value)}
            >
              <Text style={[styles.chipText, quantity === q.value && styles.chipTextActive]}>
                {q.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Acceptation</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, accepted && styles.chipActive]}
            onPress={() => setAccepted(true)}
          >
            <Text style={[styles.chipText, accepted && styles.chipTextActive]}>Accepté</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, !accepted && styles.chipReject]}
            onPress={() => setAccepted(false)}
          >
            <Text style={[styles.chipText, !accepted && styles.chipTextActive]}>Refusé</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Notes (optionnel)"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveMeal}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Enregistrer le repas</Text>
          )}
        </TouchableOpacity>
      </View>

      {todayMeals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Repas du jour ({todayMeals.length})</Text>
          {todayMeals.map((meal) => (
            <View key={meal.id} style={styles.entryCard}>
              <Text style={styles.entryType}>
                {MEAL_TYPES.find((t) => t.value === meal.type)?.label}
              </Text>
              <Text style={styles.entryDetail}>
                {QUANTITIES.find((q) => q.value === meal.quantity)?.label}
                {' — '}
                {meal.accepted ? 'Accepté' : 'Refusé'}
              </Text>
              {meal.notes && <Text style={styles.entryNotes}>{meal.notes}</Text>}
            </View>
          ))}
        </View>
      )}
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
});
