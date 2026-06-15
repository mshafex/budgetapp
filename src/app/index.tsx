import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ROUTES } from '@/contracts';
import { ensureSchema, repository } from '@/db';
import { resolveCycle } from '@/engine';

/**
 * Initial route: send the user to onboarding if no profile exists yet, else to Home.
 * LEAD-owned shell — screen owners build inside their own route folders.
 */
export default function Index() {
  const [hasUser, setHasUser] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        ensureSchema();
      } catch {
        // idempotent bootstrap; ignore (e.g. unsupported platform in a dev sandbox)
      }
      const user = await repository.getUser().catch(() => null);
      if (user) {
        // Bucket 1: auto-post recurring items now due (idempotent; tagged 'recurring' and
        // excluded from the spend sum — records only, never changes the number).
        const today = new Date().toISOString().slice(0, 10);
        const { cycleStart, cycleEnd } = resolveCycle(today, user.payDay);
        await repository.postDueRecurring(today, cycleStart, cycleEnd).catch(() => {});
      }
      if (active) setHasUser(Boolean(user));
    })();
    return () => {
      active = false;
    };
  }, []);

  if (hasUser === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={hasUser ? ROUTES.home : ROUTES.onboardingSalary} />;
}
