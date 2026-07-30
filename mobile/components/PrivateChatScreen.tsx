import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
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
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, refFromURL } from 'firebase/storage';
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
    <TouchableOpacity style={styles.audioRow} onPress={toggle} activeOpacity={0.75}>
      <View style={[styles.audioPlayBtn, isMine ? styles.audioPlayBtnMine : styles.audioPlayBtnOther]}>
        <Text style={[styles.audioIcon, isMine && styles.bubbleTextMine]}>
          {playing ? '⏹' : '▶'}
        </Text>
      </View>
      <View style={styles.audioMeta}>
        <Text style={[styles.audioLabel, isMine && styles.bubbleTextMine]}>Message audio</Text>
        <Text style={[styles.audioHint, isMine && styles.bubbleTimeMine]}>
          {playing ? 'Lecture…' : 'Appuyer pour écouter'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const VOICE_RECORDING = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 128000,
};

async function enableRecordingAudioMode() {
  // Tous les champs sont explicites : sur iOS les défauts natifs
  // (allowsRecording=false, playsInSilentMode=false) bloquent sinon l'enregistrement.
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    allowsBackgroundRecording: false,
  });
}

async function disableRecordingAudioMode() {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    allowsBackgroundRecording: false,
  });
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
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const recorderState = useAudioRecorderState(recorder);
  const [recordingMs, setRecordingMs] = useState(0);
  const [starting, setStarting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      void disableRecordingAudioMode().catch(() => undefined);
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
    if (starting || recorderState.isRecording) return;
    setStarting(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission requise',
          'Autorisez le micro pour envoyer un message audio.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Ouvrir Réglages', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      await enableRecordingAudioMode();
      setRecordingMs(0);
      await recorder.prepareToRecordAsync(VOICE_RECORDING);
      recorder.record();
    } catch (err) {
      console.error('startRecording', err);
      const raw = err instanceof Error ? err.message : String(err);
      const denied =
        /permission|denied|not granted/i.test(raw) ||
        raw.includes('AudioPermissions');
      const disabled = /Recording not allowed|RecordingDisabled|allowsRecording/i.test(raw);

      if (denied) {
        Alert.alert(
          'Permission micro',
          'Le micro est refusé. Activez-le dans Réglages > Zibou > Microphone.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Ouvrir Réglages', onPress: () => Linking.openSettings() },
          ]
        );
      } else if (disabled) {
        Alert.alert(
          'Erreur micro',
          'L’enregistrement audio n’est pas activé sur cet appareil. Fermez les autres apps audio puis réessayez.'
        );
      } else {
        Alert.alert('Erreur', 'Impossible de démarrer l’enregistrement.');
      }

      try {
        await disableRecordingAudioMode();
      } catch {
        // ignore
      }
    } finally {
      setStarting(false);
    }
  }

  async function stopRecording(send: boolean) {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setRecordingMs(0);
      await disableRecordingAudioMode();
      if (send && uri) {
        await onUploadUri(uri, 'audio', 'audio/m4a', 'm4a');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de finaliser l’audio.');
      try {
        await disableRecordingAudioMode();
      } catch {
        // ignore
      }
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
        disabled={uploading || starting}
        accessibilityLabel="Enregistrer un message audio"
      >
        {starting ? (
          <ActivityIndicator size="small" color="#4a90d9" />
        ) : (
          <Text style={styles.micButtonText}>🎤</Text>
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
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') {
          allMessages.delete(change.doc.id);
        } else {
          allMessages.set(change.doc.id, {
            id: change.doc.id,
            ...change.doc.data(),
          } as PrivateMessage);
        }
      });
      mergeAndSet();
    });

    const unsubReceived = onSnapshot(receivedQuery, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') {
          allMessages.delete(change.doc.id);
          return;
        }
        const msg = {
          id: change.doc.id,
          ...change.doc.data(),
        } as PrivateMessage;
        allMessages.set(change.doc.id, msg);
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

  function confirmDeleteMessage(msg: PrivateMessage) {
    if (msg.senderId !== uid) return;
    Alert.alert('Supprimer le message', 'Ce message sera supprimé pour tout le monde.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void deleteMessage(msg);
        },
      },
    ]);
  }

  async function deleteMessage(msg: PrivateMessage) {
    try {
      await deleteDoc(doc(db, paths.privateMessage(tenantId, msg.id)));
      if (msg.mediaUrl) {
        try {
          await deleteObject(refFromURL(storage, msg.mediaUrl));
        } catch (storageErr) {
          console.warn('Media delete skipped', storageErr);
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de supprimer ce message.');
    }
  }

  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversation</Text>
        <Text style={styles.headerSubtitle}>{recipientName}</Text>
        <Text style={styles.headerHint}>Appui long sur vos messages pour les supprimer</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Aucun message</Text>
            <Text style={styles.emptyText}>Écrivez un message pour démarrer la conversation.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMine = item.senderId === uid;
          const isDefaultMediaLabel =
            item.body === 'Image' || item.body === 'Vidéo' || item.body === 'Message audio';
          const isImage = !!item.mediaUrl && item.mediaType === 'image';

          return (
            <View style={[styles.row, isMine ? styles.rowMine : styles.rowOther]}>
              <Pressable
                onLongPress={() => confirmDeleteMessage(item)}
                delayLongPress={350}
                style={({ pressed }) => [
                  styles.bubble,
                  isMine ? styles.bubbleMine : styles.bubbleOther,
                  isImage && styles.bubbleMedia,
                  pressed && isMine && styles.bubblePressed,
                ]}
              >
                {isImage ? (
                  <Image source={{ uri: item.mediaUrl }} style={styles.mediaImage} />
                ) : null}
                {item.mediaUrl && item.mediaType === 'video' ? (
                  <TouchableOpacity
                    style={[styles.videoChip, isMine ? styles.videoChipMine : styles.videoChipOther]}
                    onPress={() => Linking.openURL(item.mediaUrl!)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.videoChipIcon, isMine && styles.bubbleTextMine]}>▶</Text>
                    <Text style={[styles.videoChipText, isMine && styles.bubbleTextMine]}>
                      Voir la vidéo
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
                <View style={styles.metaRow}>
                  <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
                    {formatFirestoreTime(item.createdAt)}
                  </Text>
                  {isMine ? <Text style={styles.deleteHint}>⌫</Text> : null}
                </View>
              </Pressable>
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
  container: { flex: 1, backgroundColor: '#eef2f7' },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d9e0ea',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7a90',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '700',
    color: '#1a2433',
  },
  headerHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#8a97ab',
  },
  messageList: { flex: 1 },
  messageListContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 12,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#3a4a63', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#7b8aa3', textAlign: 'center', lineHeight: 20 },
  row: {
    marginBottom: 12,
    maxWidth: '86%',
  },
  rowMine: { alignSelf: 'flex-end' },
  rowOther: { alignSelf: 'flex-start' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  bubbleMedia: {
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 8,
  },
  bubbleMine: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d7dee8',
  },
  bubblePressed: { opacity: 0.88 },
  bubbleText: { fontSize: 15, color: '#1a2433', lineHeight: 22 },
  bubbleTextMine: { color: '#fff' },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 4,
  },
  bubbleTime: { fontSize: 11, color: '#8a97ab', fontWeight: '500' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.78)' },
  deleteHint: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  mediaImage: {
    width: 220,
    height: 220,
    borderRadius: 14,
    marginBottom: 4,
    backgroundColor: '#d8dee8',
  },
  videoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  videoChipMine: { backgroundColor: 'rgba(255,255,255,0.16)' },
  videoChipOther: { backgroundColor: '#eef4fb' },
  videoChipIcon: { fontSize: 13, color: '#1a2433', fontWeight: '700' },
  videoChipText: { fontSize: 14, fontWeight: '600', color: '#1a2433' },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 180,
    marginBottom: 2,
    paddingVertical: 2,
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlayBtnMine: { backgroundColor: 'rgba(255,255,255,0.2)' },
  audioPlayBtnOther: { backgroundColor: '#e8f0fa' },
  audioMeta: { flex: 1 },
  audioIcon: { fontSize: 14, color: '#1a2433' },
  audioLabel: { fontSize: 14, fontWeight: '700', color: '#1a2433' },
  audioHint: { marginTop: 1, fontSize: 11, color: '#8a97ab' },
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d9e0ea',
    alignItems: 'flex-end',
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    backgroundColor: '#fff5f5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ffd0d0',
    gap: 8,
  },
  recordingDot: { color: '#e53935', fontSize: 14 },
  recordingText: { flex: 1, color: '#c62828', fontWeight: '600' },
  recCancel: { paddingHorizontal: 10, paddingVertical: 8 },
  recCancelText: { color: '#666', fontWeight: '600' },
  recSend: {
    backgroundColor: '#3b82f6',
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
  attachButtonText: { fontSize: 22, color: '#3b82f6', fontWeight: '600', lineHeight: 24 },
  micButtonText: { fontSize: 16 },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d7dee8',
    backgroundColor: '#f7f9fc',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    marginRight: 8,
    color: '#1a2433',
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
