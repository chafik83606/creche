import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { auth } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

interface Props {
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Indiquez le nom de la crèche.');
      return;
    }

    setLoading(true);
    try {
      const createTenant = httpsCallable(functions, 'createTenant');
      const result = await createTenant({
        name: name.trim(),
        address: address.trim(),
      });
      await auth.currentUser?.getIdToken(true);
      const tenantId = (result.data as { tenantId?: string }).tenantId ?? 'nouvelle-crèche';
      Alert.alert(
        'Crèche créée',
        `La crèche a été créée (${tenantId}) et votre compte est maintenant admin réseau.`
      );
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de créer la crèche.';
      Alert.alert('Erreur', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Bienvenue 👋</Text>
        <Text style={styles.subtitle}>
          Créez votre première crèche pour activer votre espace administrateur.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Nom de la crèche"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Adresse (optionnel)"
          value={address}
          onChangeText={setAddress}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Créer ma crèche</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.info}>
          Le premier compte devient automatiquement administrateur réseau.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a2e' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8, marginBottom: 16, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  info: { marginTop: 12, color: '#888', fontSize: 12, lineHeight: 18 },
});
