'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  setDoc,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { paths, formatFirestoreDate } from '@creche/shared';
import type { Announcement } from '@creche/shared';

interface Props {
  tenantId: string;
  canSend?: boolean;
}

export function AnnouncementsPanel({ tenantId, canSend = false }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const [ackLoadingId, setAckLoadingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [requiresAck, setRequiresAck] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, paths.announcements(tenantId)),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(
      q,
      (snap) => {
        setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement)));
      },
      (err) => {
        console.error('Erreur chargement annonces:', err);
      }
    );
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

    try {
      await addDoc(collection(db, paths.announcements(tenantId)), {
        type: 'announcement',
        title: title.trim(),
        body: body.trim(),
        senderId: user.uid,
        senderName: user.displayName ?? user.email,
        groupId: null,
        requiresAck,
        createdAt: serverTimestamp(),
      });

      setTitle('');
      setBody('');
      setRequiresAck(false);
      setShowForm(false);
    } catch (error) {
      console.error(error);
      alert("Impossible d'envoyer le message.");
    }
  }

  async function acknowledge(msgId: string) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      alert('Vous devez être connecté.');
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
    } catch (error) {
      console.error(error);
      alert("Impossible d'enregistrer l'accusé de réception.");
    } finally {
      setAckLoadingId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Annonces</h1>
        {canSend && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            {showForm ? 'Annuler' : '+ Nouvelle annonce'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 mb-6 space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px]"
            placeholder="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={requiresAck}
              onChange={(e) => setRequiresAck(e.target.checked)}
            />
            Accusé de réception obligatoire
          </label>
          <button
            onClick={sendAnnouncement}
            className="w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
          >
            Envoyer
          </button>
        </div>
      )}

      <div className="space-y-3">
        {announcements.map((item) => (
          <div key={item.id} className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900">{item.title}</h3>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{item.body}</p>
            <p className="text-xs text-gray-400 mt-3">
              {item.senderName} — {formatFirestoreDate(item.createdAt)}
            </p>
            {item.requiresAck && !canSend && (
              ackedIds.has(item.id) ? (
                <p className="mt-3 text-sm font-medium text-green-700 bg-green-50 rounded-lg px-4 py-2 text-center">
                  ✓ Réception accusée
                </p>
              ) : (
                <button
                  onClick={() => acknowledge(item.id)}
                  disabled={ackLoadingId === item.id}
                  className="mt-3 px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-70"
                >
                  {ackLoadingId === item.id ? 'Enregistrement…' : 'Accuser réception'}
                </button>
              )
            )}
          </div>
        ))}
        {announcements.length === 0 && (
          <p className="text-center text-gray-400 py-12">Aucune annonce.</p>
        )}
      </div>
    </div>
  );
}
