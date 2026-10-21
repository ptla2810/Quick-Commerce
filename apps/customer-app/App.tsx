import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavProvider, type Route } from './src/nav';
import { SessionProvider, useSession } from './src/session';
import { CartProvider } from './src/cart';
import { Loading, Screen } from './src/ui';
import { LoginScreen } from './src/screens/LoginScreen';
import { LocationScreen } from './src/screens/LocationScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { CartScreen } from './src/screens/CartScreen';
import { CheckoutScreen } from './src/screens/CheckoutScreen';
import { PayScreen } from './src/screens/PayScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { OrderScreen } from './src/screens/OrderScreen';

const SCREENS: Record<string, () => React.JSX.Element> = {
  home: HomeScreen,
  location: LocationScreen,
  search: SearchScreen,
  cart: CartScreen,
  checkout: CheckoutScreen,
  pay: PayScreen,
  orders: OrdersScreen,
  order: OrderScreen,
};

function Root() {
  const { ready, user, location } = useSession();
  if (!ready) return <Screen><Loading /></Screen>;
  if (!user) return <LoginScreen />;
  const initial: Route = location ? { name: 'home' } : { name: 'location' };
  return (
    <CartProvider>
      <NavProvider key={user.id} initial={initial}>
        {(route) => {
          const S = SCREENS[route.name] ?? HomeScreen;
          return <S key={`${route.name}:${JSON.stringify(route.params ?? {})}`} />;
        }}
      </NavProvider>
    </CartProvider>
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
