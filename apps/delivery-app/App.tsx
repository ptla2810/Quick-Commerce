import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavProvider } from './src/nav';
import { SessionProvider, useSession } from './src/session';
import { Loading, Screen } from './src/ui';
import { LoginScreen } from './src/screens/LoginScreen';
import { JobsScreen } from './src/screens/JobsScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';

function Root() {
  const { ready, user } = useSession();
  if (!ready) return <Screen><Loading /></Screen>;
  if (!user) return <LoginScreen />;
  return (
    <NavProvider key={user.id} initial={{ name: 'jobs' }}>
      {(route) => (route.name === 'history' ? <HistoryScreen /> : <JobsScreen />)}
    </NavProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
