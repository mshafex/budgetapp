import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ROUTES } from '@/contracts';
import { ensureSchema, repository } from '@/db';

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
