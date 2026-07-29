import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { paths, formatFirestoreTime, getFirestoreTime } from '@creche/shared';
import type { PrivateMessage } from '@creche/shared';

interface Props {
  tenantId: string;
  childId: string;
  recipientId: string;
  recipientName: string;
}

export function PrivateChatScreen({
  tenantId,
  childId,
  recipientId,
  recipientName,
}: Props) {
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [text, setText] = useState('');
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;

    const sentQuery = query(
      collection(db, paths.privateMessages(tenantId)),
      where('childId', '==', childId),
      where('senderId', '==', uid),
      orderBy('createdAt', 'asc')
    );

    const receivedQuery = query(
      collection(db, paths.privateMessages(tenantId)),
      where('childId', '==', childId),
      where('recipientId', '==', uid),
      orderBy('createdAt', 'asc')
    );

    const allMessages = new Map<string, PrivateMessage>();

    function mergeAndSet() {
      const sorted = [...allMessages.values()].sort(
        (a, b) => getFirestoreTime(a.createdAt) - getFirestoreTime(b.createdAt)
      );
      setMessages(sorted);
    }

    const unsubSent = onSnapshot(sentQuery, (snap) => {
      snap.docs.forEach((d) => allMessages.set(d.id, { id: d.id, ...d.data() } as PrivateMessage));
      mergeAndSet();
    });

    const unsubReceived = onSnapshot(receivedQuery, (snap) => {
      snap.docs.forEach((d) => {
        const msg = { id: d.id, ...d.data() } as PrivateMessage;
        allMessages.set(d.id, msg);
        if (msg.recipientId === uid && !msg.readAt) {
          updateDoc(doc(db, paths.privateMessage(tenantId, msg.id)), {
            readAt: serverTimestamp(),
          });
        }
      });
      mergeAndSet();
    });

    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [tenantId, childId, uid]);

  async function sendMessage() {
    const user = auth.currentUser;
    if (!user || !text.trim()) return;

    await addDoc(collection(db, paths.privateMessages(tenantId)), {
      type: 'private',
      senderId: user.uid,
      senderName: user.displayName ?? user.email,
      recipientId,
      childId,
      body: text.trim(),
      createdAt: serverTimestamp(),
    });

    setText('');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 160 : 0}
    >
      <Text style={styles.header}>Conversation — {recipientName}</Text>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isMine = item.senderId === uid;
          return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
              <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                {item.body}
              </Text>
              <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
                {formatFirestoreTime(item.createdAt)}
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          placeholder="Votre message..."
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Envoyer</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: {
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    color: '#1a1a2e',
  },
  messageList: { flex: 1, padding: 12 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#4a90d9',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, color: '#1a1a2e', lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: '#999', marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  inputRow: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#4a90d9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
