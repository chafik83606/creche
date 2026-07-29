import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../lib/firebase';
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
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
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

  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(t);
  }, [messages.length]);

  async function sendMessage(extra?: {
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    body?: string;
  }) {
    const user = auth.currentUser;
    const body = (extra?.body ?? text).trim();
    if (!user) return;
    if (!body && !extra?.mediaUrl) return;

    await addDoc(collection(db, paths.privateMessages(tenantId)), {
      type: 'private',
      senderId: user.uid,
      senderName: user.displayName ?? user.email,
      recipientId,
      childId,
      body: body || (extra?.mediaType === 'video' ? 'Vidéo' : 'Image'),
      ...(extra?.mediaUrl
        ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType ?? 'image' }
        : {}),
      createdAt: serverTimestamp(),
    });

    if (!extra?.mediaUrl) setText('');
  }

  async function pickAndSendMedia(mediaTypes: ImagePicker.MediaType | ImagePicker.MediaType[]) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission requise',
        'Autorisez l’accès à la galerie pour envoyer une image ou une vidéo.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const isVideo = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
    const user = auth.currentUser;
    if (!user) return;

    setUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const ext =
        asset.fileName?.split('.').pop() ||
        (isVideo ? 'mp4' : asset.uri.split('.').pop()?.split('?')[0] || 'jpg');
      const fileName = `${user.uid}_${Date.now()}.${ext}`;
      const storagePath = `tenants/${tenantId}/chat/${childId}/${fileName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, {
        contentType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      });
      const mediaUrl = await getDownloadURL(storageRef);
      await sendMessage({
        mediaUrl,
        mediaType: isVideo ? 'video' : 'image',
        body: text.trim(),
      });
      setText('');
    } catch (err) {
      console.error(err);
      Alert.alert(
        'Erreur',
        'Impossible d’envoyer le fichier. Vérifiez que Firebase Storage est activé, puis réessayez.'
      );
    } finally {
      setUploading(false);
    }
  }

  function openMediaMenu() {
    Alert.alert('Joindre', 'Que souhaitez-vous envoyer ?', [
      {
        text: 'Image',
        onPress: () => pickAndSendMedia(['images']),
      },
      {
        text: 'Vidéo',
        onPress: () => pickAndSendMedia(['videos']),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
    >
      <Text style={styles.header}>Conversation — {recipientName}</Text>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMine = item.senderId === uid;
          return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
              {item.mediaUrl && item.mediaType === 'image' ? (
                <Image source={{ uri: item.mediaUrl }} style={styles.mediaImage} />
              ) : null}
              {item.mediaUrl && item.mediaType === 'video' ? (
                <TouchableOpacity onPress={() => Linking.openURL(item.mediaUrl!)}>
                  <Text style={[styles.videoLink, isMine && styles.bubbleTextMine]}>
                    ▶ Voir la vidéo
                  </Text>
                </TouchableOpacity>
              ) : null}
              {!!item.body && !(item.mediaUrl && (item.body === 'Image' || item.body === 'Vidéo')) ? (
                <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                  {item.body}
                </Text>
              ) : null}
              <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
                {formatFirestoreTime(item.createdAt)}
              </Text>
            </View>
          );
        }}
      />

      <View style={[styles.inputRow, { paddingBottom: bottomPad }]}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={openMediaMenu}
          disabled={uploading}
          accessibilityLabel="Joindre une image ou une vidéo"
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#4a90d9" />
          ) : (
            <Text style={styles.attachButtonText}>＋</Text>
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          placeholder="Votre message..."
          value={text}
          onChangeText={setText}
          multiline
          editable={!uploading}
        />
        <TouchableOpacity
          style={[styles.sendButton, uploading && styles.sendButtonDisabled]}
          onPress={() => sendMessage()}
          disabled={uploading}
        >
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
  messageList: { flex: 1 },
  messageListContent: { padding: 12, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },
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
  mediaImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#ddd',
  },
  videoLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 6,
    textDecorationLine: 'underline',
  },
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eef4fb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  attachButtonText: { fontSize: 22, color: '#4a90d9', fontWeight: '600', lineHeight: 24 },
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
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
