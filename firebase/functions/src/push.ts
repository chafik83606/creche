import * as admin from 'firebase-admin';

/**
 * Envoie une notification FCM multicast.
 * Nettoie automatiquement les tokens invalides (retournés pour purge).
 */
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
  const messaging = admin.messaging();

  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueTokens.length; i += 500) {
    chunks.push(uniqueTokens.slice(i, i + 500));
  }

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens: string[] = [];

  for (const chunk of chunks) {
    const message: admin.messaging.MulticastMessage = {
      tokens: chunk,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);
    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        resp.error &&
        [
          'messaging/invalid-registration-token',
          'messaging/registration-token-not-registered',
        ].includes(resp.error.code)
      ) {
        invalidTokens.push(chunk[idx]);
      }
    });
  }

  console.log(
    `FCM: ${successCount} envoyés, ${failureCount} échecs, ${invalidTokens.length} tokens invalides`
  );
  return { successCount, failureCount, invalidTokens };
}
