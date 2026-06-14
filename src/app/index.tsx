import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('app.name')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '600' },
});
