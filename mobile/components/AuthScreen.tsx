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
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }
    if (isRegister && !displayName.trim()) {
      Alert.alert('Erreur', 'Veuillez renseigner votre nom.');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        if (inviteCode.trim()) {
          const registerWithInvite = httpsCallable(functions, 'registerWithInvite');
          await registerWithInvite({
            email: email.trim().toLowerCase(),
            password,
            displayName: displayName.trim(),
            inviteCode: inviteCode.trim().toUpperCase(),
          });
          await signInWithEmailAndPassword(auth, email.trim(), password);
          Alert.alert('Compte créé', 'Inscription via invitation réussie.');
        } else {
          await createUserWithEmailAndPassword(auth, email.trim(), password);
          Alert.alert(
            'Compte créé',
            'Compte créé. Créez ensuite votre première crèche pour activer le rôle admin.'
          );
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de connexion';
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
        <Text style={styles.logo}>🏫</Text>
        <Text style={styles.title}>Crèche</Text>
        <Text style={styles.subtitle}>
          {isRegister ? 'Créer un compte' : 'Connexion'}
        </Text>

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Nom complet"
            value={displayName}
            onChangeText={setDisplayName}
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Code d'invitation (optionnel)"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isRegister ? 'Créer le compte' : 'Se connecter'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
          <Text style={styles.switchText}>
            {isRegister
              ? 'Déjà un compte ? Se connecter'
              : 'Pas de compte ? Créer un compte'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4a90d9',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: '#1a1a2e' },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 24, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchText: { textAlign: 'center', color: '#4a90d9', marginTop: 16, fontSize: 14 },
});
