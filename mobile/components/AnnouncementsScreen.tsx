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
  ActivityIndicator,
} from 'react-native';
import { colors } from '../lib/theme';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { paths, formatFirestoreDate } from '@creche/shared';
import type { Announcement } from '@creche/shared';

type Audience = 'all' | 'group';

interface Props {
  tenantId: string;
  /** Si fourni, permet d’envoyer aussi au groupe uniquement. */
  groupId?: string;
  groupName?: string;
  canSend?: boolean;
}

export function AnnouncementsScreen({
  tenantId,
  groupId,
  groupName,
  canSend = false,
}: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const [ackLoadingId, setAckLoadingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [requiresAck, setRequiresAck] = useState(false);
  const [audience, setAudience] = useState<Audience>('all');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, paths.announcements(tenantId)),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setAnnouncements(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement))
      );
    });

    return unsubscribe;
  }, [tenantId]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || canSend) {
      setAckedIds(new Set());
      return;
    }

    let cancelled = false;

    async function loadAcks() {
      const acked = new Set<string>();
      const needingAck = announcements.filter((a) => a.requiresAck);
      await Promise.all(
        needingAck.map(async (item) => {
          const snap = await getDoc(
            doc(db, paths.announcementAcks(tenantId, item.id), uid!)
          );
          if (snap.exists()) acked.add(item.id);
        })
      );
      if (!cancelled) setAckedIds(acked);
    }

    loadAcks().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [announcements, tenantId, canSend]);

  async function sendAnnouncement() {
    const user = auth.currentUser;
    if (!user || !title.trim() || !body.trim()) return;

    const targetGroupId =
      audience === 'group' && groupId ? groupId : null;

    try {
      await addDoc(collection(db, paths.announcements(tenantId)), {
        type: 'announcement',
        title: title.trim(),
        body: body.trim(),
        senderId: user.uid,
        senderName: user.displayName ?? user.email,
        groupId: targetGroupId,
        requiresAck,
        createdAt: serverTimestamp(),
      });

      setTitle('');
      setBody('');
      setRequiresAck(false);
      setAudience('all');
      setShowForm(false);
      Alert.alert(
        'Envoyé',
        targetGroupId
          ? `Message envoyé aux parents du groupe${groupName ? ` « ${groupName} »` : ''}.`
          : 'Message envoyé à tous les parents de la crèche.'
      );
    } catch (error) {
      Alert.alert('Erreur', "Impossible d'envoyer le message.");
      console.error(error);
    }
  }

  async function acknowledgeAnnouncement(msgId: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Erreur', 'Vous devez être connecté.');
      return;
    }
    if (ackedIds.has(msgId)) return;

    setAckLoadingId(msgId);
    try {
      await setDoc(doc(db, paths.announcementAcks(tenantId, msgId), uid), {
        parentId: uid,
        acknowledgedAt: serverTimestamp(),
      });
      setAckedIds((prev) => new Set(prev).add(msgId));
      Alert.alert('Confirmé', 'Accusé de réception enregistré.');
    } catch (error) {
      Alert.alert(
        'Erreur',
        "Impossible d'enregistrer l'accusé de réception. Vérifiez votre connexion ou contactez la crèche."
      );
      console.error(error);
    } finally {
      setAckLoadingId(null);
    }
  }

  return (
    <View style={styles.container}>
      {canSend && (
        <>
          <Text style={styles.sectionHint}>
            Envoyez un message collectif aux parents (visible dans Annonces + notification).
          </Text>
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => setShowForm(!showForm)}
          >
            <Text style={styles.newButtonText}>
              {showForm ? 'Annuler' : '+ Message à tous les parents'}
            </Text>
          </TouchableOpacity>

          {showForm && (
            <View style={styles.form}>
              {groupId ? (
                <View style={styles.audienceBlock}>
                  <Text style={styles.label}>Destinataires</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, audience === 'all' && styles.chipActive]}
                      onPress={() => setAudience('all')}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          audience === 'all' && styles.chipTextActive,
                        ]}
                      >
                        Tous les parents
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, audience === 'group' && styles.chipActive]}
                      onPress={() => setAudience('group')}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          audience === 'group' && styles.chipTextActive,
                        ]}
                      >
                        {groupName ? `Groupe ${groupName}` : 'Mon groupe'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Text style={styles.audienceNote}>
                  Destinataires : tous les parents de la crèche
                </Text>
              )}

              <TextInput
                style={styles.input}
                placeholder="Titre"
                value={title}
                onChangeText={setTitle}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Votre message aux parents..."
                value={body}
                onChangeText={setBody}
                multiline
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Accusé de réception obligatoire</Text>
                <Switch value={requiresAck} onValueChange={setRequiresAck} />
              </View>
              <TouchableOpacity style={styles.sendButton} onPress={sendAnnouncement}>
                <Text style={styles.sendButtonText}>
                  {audience === 'group' ? 'Envoyer au groupe' : 'Envoyer à tous les parents'}
                </Text>
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
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.groupId ? (
                <Text style={styles.badgeGroup}>Groupe</Text>
              ) : (
                <Text style={styles.badgeAll}>Tous</Text>
              )}
            </View>
            <Text style={styles.cardBody}>{item.body}</Text>
            <Text style={styles.cardMeta}>
              {item.senderName} — {formatFirestoreDate(item.createdAt)}
            </Text>
            {item.requiresAck && !canSend && (
              ackedIds.has(item.id) ? (
                <Text style={styles.ackDone}>✓ Réception accusée</Text>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.ackButton,
                    ackLoadingId === item.id && styles.ackButtonDisabled,
                  ]}
                  onPress={() => acknowledgeAnnouncement(item.id)}
                  disabled={ackLoadingId === item.id}
                >
                  {ackLoadingId === item.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.ackButtonText}>Accuser réception</Text>
                  )}
                </TouchableOpacity>
              )
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
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  sectionHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
    lineHeight: 18,
  },
  newButton: {
    backgroundColor: colors.primary,
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
  audienceBlock: { marginBottom: 12 },
  audienceNote: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
    marginBottom: 12,
  },
  label: { fontSize: 14, fontWeight: '500', color: '#444', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  badgeAll: {
    fontSize: 11,
    fontWeight: '600',
    color: '#27ae60',
    backgroundColor: '#eafaf1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  badgeGroup: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: '#eaf2fb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardBody: { fontSize: 14, color: '#444', marginTop: 6, lineHeight: 20 },
  cardMeta: { fontSize: 12, color: '#999', marginTop: 8 },
  ackButton: {
    marginTop: 10,
    backgroundColor: '#f39c12',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  ackButtonDisabled: { opacity: 0.7 },
  ackButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  ackDone: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#27ae60',
    textAlign: 'center',
    padding: 10,
    backgroundColor: '#eafaf1',
    borderRadius: 8,
  },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
});
