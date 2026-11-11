import { router } from 'expo-router';

import { AuthScreen } from '../features/auth/AuthScreen';

export default function AuthRoute() {
  return <AuthScreen onAuthenticated={() => router.replace('/vault')} />;
}
