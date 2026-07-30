'use client';

import { useEffect, useState, useRef } from 'react';
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
import { deleteObject, refFromURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { paths, formatHourTime, getHourTime } from '@creche/shared';
import type { PrivateMessage } from '@creche/shared';

interface Props {
  tenantId: string;
  childId: string;
  recipientId: string;
  recipientName: string;
}

export function PrivateChatPanel({
  tenantId,
  childId,
  recipientId,
  recipientName,
}: Props) {
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
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
        (a, b) => getHourTime(a.createdAt) - getHourTime(b.createdAt)
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
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

  async function deleteMessage(msg: PrivateMessage) {
    if (msg.senderId !== uid) return;
    if (!window.confirm('Supprimer ce message ?')) return;
    try {
      await deleteDoc(doc(db, paths.privateMessage(tenantId, msg.id)));
      if (msg.mediaUrl) {
        try {
          await deleteObject(refFromURL(storage, msg.mediaUrl));
        } catch {
          // ignore storage cleanup errors
        }
      }
    } catch (err) {
      console.error(err);
      window.alert('Impossible de supprimer ce message.');
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto">
      <div className="px-6 py-4 bg-white border-b">
        <h1 className="text-lg font-semibold text-gray-900">
          Conversation — {recipientName}
        </h1>
        <p className="mt-1 text-xs text-gray-500">
          Cliquez sur ✕ pour supprimer vos messages
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-slate-50">
        {messages.map((msg) => {
          const isMine = msg.senderId === uid;
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`group relative max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${
                  isMine
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-white text-gray-800 border border-slate-200 rounded-bl-md'
                }`}
              >
                {isMine ? (
                  <button
                    type="button"
                    onClick={() => deleteMessage(msg)}
                    className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-slate-800/80 text-xs text-white group-hover:flex"
                    aria-label="Supprimer le message"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                ) : null}
                {msg.mediaUrl && msg.mediaType === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={msg.mediaUrl}
                    alt="Pièce jointe"
                    className="mb-2 max-h-56 w-full rounded-xl object-cover"
                  />
                ) : null}
                {msg.mediaUrl && msg.mediaType === 'video' ? (
                  <a
                    href={msg.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`mb-2 block rounded-xl px-3 py-2 text-sm font-semibold ${
                      isMine ? 'bg-white/15 text-white' : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    ▶ Voir la vidéo
                  </a>
                ) : null}
                {msg.mediaUrl && msg.mediaType === 'audio' ? (
                  <audio controls src={msg.mediaUrl} className="mb-2 max-w-full" />
                ) : null}
                {msg.body &&
                msg.body !== 'Image' &&
                msg.body !== 'Vidéo' &&
                msg.body !== 'Message audio' ? (
                  <p className="text-[15px] leading-relaxed">{msg.body}</p>
                ) : null}
                <p
                  className={`mt-1.5 text-right text-[11px] font-medium ${
                    isMine ? 'text-blue-100' : 'text-slate-400'
                  }`}
                >
                  {formatHourTime(msg.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="flex gap-2 border-t bg-white p-4">
        <input
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Votre message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-full bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
