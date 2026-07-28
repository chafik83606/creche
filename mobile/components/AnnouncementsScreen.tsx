import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { paths, formatFirestoreDate } from '@creche/shared';
import type { Announcement } from '@creche/shared';

interface Props {
  tenantId: string;
  groupId?: string;
  canSend?: boolean;
}

export function AnnouncementsScreen({ tenantId, groupId, canSend = false }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [requiresAck, setRequiresAck] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const q = groupId
      ? query(
          collection(db, paths.announcements(tenantId)),
          where('groupId', '==', groupId),
          orderBy('createdAt', 'desc')
        )
      : query(
          collection(db, paths.announcements(tenantId)),
          orderBy('createdAt', 'desc')
        );

    const unsubscribe = onSnapshot(q, (snap) => {
      setAnnouncements(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement))
      );
    });

    return unsubscribe;
  }, [tenantId, groupId]);

  async function sendAnnouncement() {
    const user = auth.currentUser;
    if (!user || !title.trim() || !body.trim()) return;

    try {
      await addDoc(collection(db, paths.announcements(tenantId)), {
        type: 'announcement',
        title: title.trim(),
        body: body.trim(),
        senderId: user.uid,
        senderName: user.displayName ?? user.email,
        groupId: groupId ?? null,
        requiresAck,
        createdAt: serverTimestamp(),
      });

      setTitle('');
      setBody('');
      setRequiresAck(false);
      setShowForm(false);
      Alert.alert('Envoyé', 'Annonce envoyée à tous les parents.');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'envoyer l\'annonce.');
      console.error(error);
    }
  }

  async function acknowledgeAnnouncement(msgId: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await setDoc(doc(db, paths.announcementAcks(tenantId, msgId), uid), {
      parentId: uid,
      acknowledgedAt: serverTimestamp(),
    });
    Alert.alert('Confirmé', 'Accusé de réception enregistré.');
  }

  return (
    <View style={styles.container}>
      {canSend && (
        <>
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => setShowForm(!showForm)}
          >
            <Text style={styles.newButtonText}>
              {showForm ? 'Annuler' : '+ Nouvelle annonce'}
            </Text>
          </TouchableOpacity>

          {showForm && (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Titre"
                value={title}
                onChangeText={setTitle}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Message"
                value={body}
                onChangeText={setBody}
                multiline
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Accusé de réception obligatoire</Text>
                <Switch value={requiresAck} onValueChange={setRequiresAck} />
              </View>
              <TouchableOpacity style={styles.sendButton} onPress={sendAnnouncement}>
                <Text style={styles.sendButtonText}>Envoyer</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
            <Text style={styles.cardMeta}>
              {item.senderName} — {formatFirestoreDate(item.createdAt)}
            </Text>
            {item.requiresAck && !canSend && (
              <TouchableOpacity
                style={styles.ackButton}
                onPress={() => acknowledgeAnnouncement(item.id)}
              >
                <Text style={styles.ackButtonText}>Accuser réception</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucune annonce pour le moment.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 16 },
  newButton: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  newButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchLabel: { fontSize: 14, color: '#444', flex: 1 },
  sendButton: {
    backgroundColor: '#27ae60',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  cardBody: { fontSize: 14, color: '#444', marginTop: 6, lineHeight: 20 },
  cardMeta: { fontSize: 12, color: '#999', marginTop: 8 },
  ackButton: {
    marginTop: 10,
    backgroundColor: '#f39c12',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  ackButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
});
