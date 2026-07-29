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
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
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

function AudioMessagePlayer({
  url,
  isMine,
}: {
  url: string;
  isMine: boolean;
}) {
  const player = useAudioPlayer(url);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    try {
      if (playing) {
        player.pause();
        setPlaying(false);
        return;
      }
      player.play();
      setPlaying(true);
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de lire ce message audio.');
    }
  }

  return (
    <TouchableOpacity style={styles.audioRow} onPress={toggle}>
      <Text style={[styles.audioIcon, isMine && styles.bubbleTextMine]}>
        {playing ? '⏹' : '▶'}
      </Text>
      <Text style={[styles.audioLabel, isMine && styles.bubbleTextMine]}>
        Message audio
      </Text>
    </TouchableOpacity>
  );
}

function ChatComposer({
  uploading,
  text,
  setText,
  onSendText,
  onOpenMedia,
  onUploadUri,
  bottomPad,
}: {
  uploading: boolean;
  text: string;
  setText: (v: string) => void;
  onSendText: () => void;
  onOpenMedia: () => void;
  onUploadUri: (
    uri: string,
    mediaType: 'image' | 'video' | 'audio',
    mimeType: string,
    ext: string
  ) => Promise<void>;
  bottomPad: number;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [recordingMs, setRecordingMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (recorderState.isRecording) {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setRecordingMs((ms) => ms + 1000), 1000);
      }
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [recorderState.isRecording]);

  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission requise', 'Autorisez le micro pour envoyer un message audio.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      setRecordingMs(0);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de démarrer l’enregistrement.');
    }
  }

  async function stopRecording(send: boolean) {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      setRecordingMs(0);
      if (send && uri) {
        await onUploadUri(uri, 'audio', 'audio/m4a', 'm4a');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de finaliser l’audio.');
    }
  }

  const recordLabel = `${Math.floor(recordingMs / 60000)}:${String(
    Math.floor((recordingMs % 60000) / 1000)
  ).padStart(2, '0')}`;

  if (recorderState.isRecording) {
    return (
      <View style={[styles.recordingBar, { paddingBottom: bottomPad }]}>
        <Text style={styles.recordingDot}>●</Text>
        <Text style={styles.recordingText}>Enregistrement {recordLabel}</Text>
        <TouchableOpacity style={styles.recCancel} onPress={() => stopRecording(false)}>
          <Text style={styles.recCancelText}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.recSend} onPress={() => stopRecording(true)}>
          <Text style={styles.sendButtonText}>Envoyer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.inputRow, { paddingBottom: bottomPad }]}>
      <TouchableOpacity
        style={styles.attachButton}
        onPress={onOpenMedia}
        disabled={uploading}
        accessibilityLabel="Joindre une image ou une vidéo"
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#4a90d9" />
        ) : (
          <Text style={styles.attachButtonText}>＋</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.attachButton}
        onPress={startRecording}
        disabled={uploading}
        accessibilityLabel="Enregistrer un message audio"
      >
        <Text style={styles.micButtonText}>🎤</Text>
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
        onPress={onSendText}
        disabled={uploading}
      >
        <Text style={styles.sendButtonText}>Envoyer</Text>
      </TouchableOpacity>
    </View>
  );
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
    mediaType?: 'image' | 'video' | 'audio';
    body?: string;
  }) {
    const user = auth.currentUser;
    const body = (extra?.body ?? text).trim();
    if (!user) return;
    if (!body && !extra?.mediaUrl) return;

    const fallbackLabel =
      extra?.mediaType === 'video'
        ? 'Vidéo'
        : extra?.mediaType === 'audio'
          ? 'Message audio'
          : 'Image';

    await addDoc(collection(db, paths.privateMessages(tenantId)), {
      type: 'private',
      senderId: user.uid,
      senderName: user.displayName ?? user.email,
      recipientId,
      childId,
      body: body || fallbackLabel,
      ...(extra?.mediaUrl
        ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType ?? 'image' }
        : {}),
      createdAt: serverTimestamp(),
    });

    if (!extra?.mediaUrl) setText('');
  }

  async function uploadUri(
    uri: string,
    mediaType: 'image' | 'video' | 'audio',
    mimeType: string,
    ext: string
  ) {
    const user = auth.currentUser;
    if (!user) return;

    setUploading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileName = `${user.uid}_${Date.now()}.${ext}`;
      const storagePath = `tenants/${tenantId}/chat/${childId}/${fileName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: mimeType });
      const mediaUrl = await getDownloadURL(storageRef);
      await sendMessage({
        mediaUrl,
        mediaType,
        body: text.trim(),
      });
      setText('');
    } catch (err) {
      console.error(err);
      Alert.alert(
        'Erreur',
        'Impossible d’envoyer le fichier. Vérifiez la connexion puis réessayez.'
      );
    } finally {
      setUploading(false);
    }
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
    const ext =
      asset.fileName?.split('.').pop() ||
      (isVideo ? 'mp4' : asset.uri.split('.').pop()?.split('?')[0] || 'jpg');

    await uploadUri(
      asset.uri,
      isVideo ? 'video' : 'image',
      asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      ext
    );
  }

  function openMediaMenu() {
    Alert.alert('Joindre', 'Que souhaitez-vous envoyer ?', [
      { text: 'Image', onPress: () => pickAndSendMedia(['images']) },
      { text: 'Vidéo', onPress: () => pickAndSendMedia(['videos']) },
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
          const isDefaultMediaLabel =
            item.body === 'Image' || item.body === 'Vidéo' || item.body === 'Message audio';

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
              {item.mediaUrl && item.mediaType === 'audio' ? (
                <AudioMessagePlayer url={item.mediaUrl} isMine={!!isMine} />
              ) : null}
              {!!item.body && !isDefaultMediaLabel ? (
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

      <ChatComposer
        uploading={uploading}
        text={text}
        setText={setText}
        onSendText={() => sendMessage()}
        onOpenMedia={openMediaMenu}
        onUploadUri={uploadUri}
        bottomPad={bottomPad}
      />
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
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  audioIcon: { fontSize: 16, color: '#1a1a2e' },
  audioLabel: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#fff5f5',
    borderTopWidth: 1,
    borderTopColor: '#ffd0d0',
    gap: 8,
  },
  recordingDot: { color: '#e53935', fontSize: 14 },
  recordingText: { flex: 1, color: '#c62828', fontWeight: '600' },
  recCancel: { paddingHorizontal: 10, paddingVertical: 8 },
  recCancelText: { color: '#666', fontWeight: '600' },
  recSend: {
    backgroundColor: '#4a90d9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eef4fb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginBottom: 2,
  },
  attachButtonText: { fontSize: 22, color: '#4a90d9', fontWeight: '600', lineHeight: 24 },
  micButtonText: { fontSize: 16 },
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
