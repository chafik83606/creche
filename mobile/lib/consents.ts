import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { paths } from '@creche/shared';
import type { Consent, ConsentType } from '@creche/shared';

export const CONSENT_VERSION = '1.0.0';

export const CONSENT_TEXTS: Record<ConsentType, { title: string; body: string }> = {
  gdpr_data: {
    title: 'Consentement — Données personnelles (RGPD)',
    body:
      'Conformément au Règlement Général sur la Protection des Données (RGPD), ' +
      "j'accepte que les données personnelles de mon enfant (identité, suivi quotidien, " +
      'données de santé) soient collectées et traitées par la crèche dans le cadre du suivi ' +
      'éducatif et de la communication avec les familles.\n\n' +
      'Ces données sont hébergées sur des serveurs certifiés HDS situés en France. ' +
      'Elles seront conservées pendant la durée de scolarisation de mon enfant, puis ' +
      "supprimées dans un délai de 30 jours après son départ.\n\n" +
      "Je dispose d'un droit d'accès, de rectification et de suppression de ces données, " +
      'exerçable à tout moment auprès de la direction de la crèche.',
  },
  image_rights: {
    title: "Autorisation — Droit à l'image",
    body:
      "J'autorise la crèche à prendre des photos de mon enfant dans le cadre des activités " +
      'éducatives et à les partager avec moi exclusivement via l\'application.\n\n' +
      'Ces photos ne seront pas diffusées publiquement ni partagées avec d\'autres familles. ' +
      'Elles seront stockées de manière sécurisée et supprimées à la fin de la scolarisation.\n\n' +
      'Je peux révoquer cette autorisation à tout moment depuis l\'application. ' +
      'La révocation n\'a pas d\'effet rétroactif sur les photos déjà partagées.',
  },
};

export function consentDocId(parentId: string, childId: string, type: ConsentType) {
  return `${parentId}_${childId}_${type}`;
}

export function isConsentActive(consent: Consent | null | undefined): boolean {
  return Boolean(consent?.accepted && !consent.revokedAt);
}

/** Charge le consentement courant (doc déterministe, sinon dernier trouvé par requête). */
export async function loadConsent(
  tenantId: string,
  parentId: string,
  childId: string,
  type: ConsentType
): Promise<(Consent & { id: string }) | null> {
  const deterministicId = consentDocId(parentId, childId, type);
  const snap = await getDoc(doc(db, paths.consent(tenantId, deterministicId)));
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as Consent & { id: string };
  }

  const q = query(
    collection(db, paths.consents(tenantId)),
    where('parentId', '==', parentId),
    where('childId', '==', childId),
    where('type', '==', type)
  );
  const result = await getDocs(q);
  if (result.empty) return null;

  const docs = result.docs.map((d) => ({ id: d.id, ...d.data() } as Consent & { id: string }));
  docs.sort((a, b) => {
    const ta = a.signedAt instanceof Date ? a.signedAt.getTime() : 0;
    const tb = b.signedAt instanceof Date ? b.signedAt.getTime() : 0;
    return tb - ta;
  });
  return docs[0] ?? null;
}

export async function loadConsentsForChild(
  tenantId: string,
  parentId: string,
  childId: string
): Promise<{ gdpr: (Consent & { id: string }) | null; image: (Consent & { id: string }) | null }> {
  const [gdpr, image] = await Promise.all([
    loadConsent(tenantId, parentId, childId, 'gdpr_data'),
    loadConsent(tenantId, parentId, childId, 'image_rights'),
  ]);
  return { gdpr, image };
}

export async function saveConsent(
  tenantId: string,
  parentId: string,
  childId: string,
  type: ConsentType,
  accepted: boolean
): Promise<void> {
  const id = consentDocId(parentId, childId, type);
  const payload: Record<string, unknown> = {
    childId,
    parentId,
    type,
    accepted,
    signedAt: serverTimestamp(),
    version: CONSENT_VERSION,
  };

  if (accepted) {
    payload.revokedAt = null;
  } else {
    payload.revokedAt = serverTimestamp();
  }

  await setDoc(doc(db, paths.consent(tenantId, id)), payload, { merge: true });
}

export async function revokeConsent(
  tenantId: string,
  parentId: string,
  childId: string,
  type: ConsentType
): Promise<void> {
  await saveConsent(tenantId, parentId, childId, type, false);
}
