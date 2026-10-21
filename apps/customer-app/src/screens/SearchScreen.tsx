import { Text } from 'react-native';
import { useNav } from '../nav';
import { useSession } from '../session';
import { useApi } from '../useApi';
import { Empty, Loading, Notice, Screen, s } from '../ui';
import { ProductRow, type Product } from './ProductList';

/** Search results, or one store's catalogue when a storeId is passed. */
export function SearchScreen() {
  const { route } = useNav();
  const { locQuery } = useSession();
  const q = route.params?.q;
  const storeId = route.params?.storeId;
  const qs = `${locQuery}${q ? `&q=${encodeURIComponent(q)}` : ''}${storeId ? `&storeId=${storeId}` : ''}&pageSize=60`;
  const { data, loading, error } = useApi<{ items: Product[]; total: number }>(`/catalog/products?${qs}`);
  return (
    <Screen title={route.params?.title ?? `“${q}”`}>
      {loading && <Loading />}
      {error && <Notice tone="red" text={error.message} />}
      {data && <Text style={[s.muted, { marginBottom: 8 }]}>{data.total} products available near you</Text>}
      {data?.items.length === 0 && <Empty title="No results" body="Try a local name like “aloo” or “dal”." />}
      {data?.items.map((p) => (
        <ProductRow key={p.id} p={p} />
      ))}
    </Screen>
  );
}
