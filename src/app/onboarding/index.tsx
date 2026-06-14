import { Redirect } from 'expo-router';

import { ROUTES } from '@/contracts';

export default function OnboardingIndex() {
  return <Redirect href={ROUTES.onboardingSalary} />;
}
