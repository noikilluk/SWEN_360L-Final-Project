import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HeaderActions } from '@/components/header-actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFeedback } from '@/components/ui/feedback';
import { SectionTitle, SwitchRow } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import type { Settings } from '@/domain/types';
import { useApp, useDbState, useRequiredUser } from '@/state/app-provider';

/** Administrator: system settings and demo data reset. */
export default function AdminSettings() {
  const admin = useRequiredUser();
  const state = useDbState();
  const { services, resetDemoData } = useApp();
  const { toast, confirm, showError } = useFeedback();
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(state.settings);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      await services.admin.updateSettings(admin.id, draft);
      toast('Settings saved');
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      inTabs
      header={<ScreenHeader title="Settings" right={<HeaderActions />} />}
      footer={changed ? <Button title="Save settings" variant="primary" onPress={save} loading={busy} /> : undefined}>
      <TextField label="Business name" value={draft.businessName} onChangeText={(v) => set('businessName', v)} maxLength={40} />

      <SectionTitle title="Ordering" />
      <Card>
        <NumberRow label="'Closing soon' badge (hours before deadline)" value={draft.closingSoonHours} min={1} max={168} onChange={(v) => set('closingSoonHours', v)} />
        <SwitchRow
          title="Check ingredient stock at checkout"
          subtitle="Reject orders the kitchen cannot make with the free stock"
          value={draft.enforceIngredientStock}
          onValueChange={(v) => set('enforceIngredientStock', v)}
        />
        <SwitchRow
          title="Allow change requests"
          subtitle="Customers can ask to change or cancel confirmed orders"
          value={draft.allowChangeRequests}
          onValueChange={(v) => set('allowChangeRequests', v)}
        />
        <TextField label="Simulated card ending" value={draft.simulatedCardLast4} onChangeText={(v) => set('simulatedCardLast4', v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} />
      </Card>

      <SectionTitle title="Pickup" />
      <Card>
        <NumberRow label="Grace period before a pickup is missed (min)" value={draft.pickupGraceMinutes} min={0} max={720} step={5} onChange={(v) => set('pickupGraceMinutes', v)} />
        <NumberRow label="Default slot length (min)" value={draft.defaultSlotMinutes} min={5} max={240} step={5} onChange={(v) => set('defaultSlotMinutes', v)} />
        <NumberRow label="Default orders per slot" value={draft.defaultSlotCapacity} min={1} max={200} onChange={(v) => set('defaultSlotCapacity', v)} />
        <NumberRow label="Default slots per batch" value={draft.defaultSlotsPerBatch} min={1} max={24} onChange={(v) => set('defaultSlotsPerBatch', v)} />
      </Card>

      <SectionTitle title="Demo" />
      <Card>
        <SwitchRow title="Show demo accounts on log in" value={draft.showDemoAccounts} onValueChange={(v) => set('showDemoAccounts', v)} />
        <AppText variant="caption" color="textSecondary">
          Resetting deletes every account, order and change on this device and loads fresh sample data dated from today.
        </AppText>
        <Button
          title="Reset demo data"
          variant="danger"
          icon="refresh"
          onPress={async () => {
            const ok = await confirm({
              title: 'Reset all data?',
              message: 'Everything on this device is replaced with fresh demo data. This cannot be undone.',
              confirmLabel: 'Reset everything',
              destructive: true,
            });
            if (!ok) return;
            try {
              await resetDemoData();
              router.replace('/sign-in');
            } catch (error) {
              showError(error);
            }
          }}
        />
      </Card>
    </Screen>
  );
}

function NumberRow(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.row}>
      <AppText variant="body" style={styles.flex}>
        {props.label}
      </AppText>
      <Stepper label={props.label} value={props.value} min={props.min} max={props.max} step={props.step} onChange={props.onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  flex: { flex: 1, minWidth: 0 },
});
