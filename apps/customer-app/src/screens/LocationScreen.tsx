import { Text, View } from 'react-native';
import { useNav } from '../nav';
import { useSession } from '../session';
import { useApi } from '../useApi';
import { Badge, Card, Loading, Screen, s } from '../ui';

interface Locality {
  id: string;
  name: string;
  postalCode: string;
  lat: number;
  lng: number;
  serviceable: boolean;
}

export function LocationScreen() {
  const nav = useNav();
  const { setLocation } = useSession();
  const cities = useApi<{ cities: { id: string; name: string; state: string }[] }>('/locations/cities');
  const city = cities.data?.cities[0];
  const locs = useApi<{ localities: Locality[] }>(city ? `/locations/cities/${city.id}/localities` : null);
  return (
    <Screen title="Choose your area">
      <Text style={[s.muted, { marginBottom: 12 }]}>We show only stores that deliver to your area{city ? ` in ${city.name}` : ''}.</Text>
      {(cities.loading || locs.loading) && <Loading />}
      {locs.data?.localities.map((l) => (
        <Card
          key={l.id}
          label={`${l.name}, ${l.serviceable ? 'delivering' : 'coming soon'}`}
          onPress={async () => {
            await setLocation({ localityId: l.id, localityName: l.name, cityName: city!.name, postalCode: l.postalCode, lat: l.lat, lng: l.lng });
            nav.reset('home');
          }}
        >
          <View style={s.between}>
            <View>
              <Text style={s.h2}>{l.name}</Text>
              <Text style={s.muted}>PIN {l.postalCode}</Text>
            </View>
            <Badge text={l.serviceable ? 'Delivering' : 'Coming soon'} tone={l.serviceable ? 'green' : 'navy'} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
