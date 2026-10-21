import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNav } from './nav';

export const C = {
  navy: '#0F2747',
  navyText: '#0B1C35',
  muted: '#4A5B73',
  line: '#DBE3EF',
  bg: '#F6F8FB',
  green: '#157A45',
  greenSoft: '#E8F6EE',
  orange: '#F2994A',
  orangeSoft: '#FEF4EA',
  red: '#B42318',
  white: '#FFFFFF',
};

export function Screen({ title, children, scroll = true, right }: { title?: string; children: ReactNode; scroll?: boolean; right?: ReactNode }) {
  const nav = useNav();
  const body = scroll ? <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[s.content, { flex: 1 }]}>{children}</View>;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {title !== undefined && (
        <View style={s.header}>
          {nav.canGoBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={nav.back} style={s.back} hitSlop={12}>
              <Text style={s.backText}>‹</Text>
            </Pressable>
          ) : null}
          <Text style={s.headerTitle} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          <View style={{ marginLeft: 'auto' }}>{right}</View>
        </View>
      )}
      {body}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const bg = variant === 'primary' ? C.green : variant === 'danger' ? C.red : variant === 'secondary' ? C.white : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? C.white : variant === 'ghost' ? C.green : C.navy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === 'secondary' ? 1 : 0 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, style, ...rest }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#8A97AA" style={[s.input, error ? { borderColor: C.red } : null, style]} {...rest} />
      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Card({ children, style, onPress, label }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; label?: string }) {
  if (onPress)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  return <View style={[s.card, style]}>{children}</View>;
}

export function Badge({ text, tone = 'navy' }: { text: string; tone?: 'navy' | 'green' | 'orange' | 'red' }) {
  const map = { navy: ['#EEF2F8', C.navy], green: [C.greenSoft, C.green], orange: [C.orangeSoft, '#9A4F0B'], red: ['#FEECEB', C.red] } as const;
  return (
    <View style={[s.badge, { backgroundColor: map[tone][0] }]}>
      <Text style={[s.badgeText, { color: map[tone][1] }]}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return <ActivityIndicator style={{ marginTop: 32 }} color={C.green} accessibilityLabel="Loading" />;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={s.empty}>
      <Text style={s.h2}>{title}</Text>
      {body ? <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 12, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Notice({ text, tone = 'navy' }: { text: string; tone?: 'navy' | 'orange' | 'red' | 'green' }) {
  const bg = { navy: '#EEF2F8', orange: C.orangeSoft, red: '#FEECEB', green: C.greenSoft }[tone];
  return (
    <View style={[s.notice, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <Text style={s.body}>{text}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  back: { marginRight: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, color: C.navy, marginTop: -4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.navyText, flexShrink: 1 },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderColor: C.line },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', color: C.navyText, marginBottom: 4 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, backgroundColor: C.white, color: C.navyText },
  error: { color: C.red, fontSize: 13, marginTop: 4, fontWeight: '600' },
  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 24, backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  notice: { borderRadius: 12, padding: 12, marginBottom: 12 },
  h1: { fontSize: 24, fontWeight: '800', color: C.navyText },
  h2: { fontSize: 18, fontWeight: '700', color: C.navyText },
  body: { fontSize: 15, color: C.navyText },
  muted: { fontSize: 13, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
