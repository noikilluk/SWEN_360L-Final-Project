import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFeedback } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';
import { EmptyState, SectionTitle } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { AppText } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { slotsByDay } from '@/data/selectors';
import { addDays, combineDayAndTime, formatDay, formatTime, startOfDay } from '@/domain/time';
import { useDbState, useRequiredUser, useServices } from '@/state/app-provider';

/** Pickup slots and their order limits (US-04, FR-06). */
export default function SlotsScreen() {
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const { toast, confirm, showError } = useFeedback();
  const [start, setStart] = useState(() => combineDayAndTime(addDays(startOfDay(new Date()), 1), 16, 0));
  const [count, setCount] = useState(state.settings.defaultSlotsPerBatch);
  const [minutes, setMinutes] = useState(state.settings.defaultSlotMinutes);
  const [capacity, setCapacity] = useState(state.settings.defaultSlotCapacity);
  const days = slotsByDay(state, startOfDay(new Date()));

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast(message);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <Screen header={<ScreenHeader back title="Pickup slots" subtitle="Each slot accepts a limited number of orders" />}>
      <Card>
        <AppText variant="subheading">Add slots</AppText>
        <DateTimeField label="First slot starts" value={start} onChange={setStart} />
        <Row label="Number of slots">
          <Stepper label="number of slots" value={count} min={1} max={12} onChange={setCount} />
        </Row>
        <Row label="Minutes each">
          <Stepper label="minutes per slot" value={minutes} min={10} max={120} step={5} onChange={setMinutes} />
        </Row>
        <Row label="Orders per slot">
          <Stepper label="orders per slot" value={capacity} min={1} max={50} onChange={setCapacity} />
        </Row>
        <Button
          title="Create slots"
          variant="primary"
          size="sm"
          onPress={() => run(() => services.batches.generateSlots(user.id, start, { count, minutes, capacity }), 'Slots created')}
        />
      </Card>

      {days.length === 0 ? (
        <EmptyState icon="clock" title="No upcoming slots" message="Slots are also created automatically when you publish a batch." />
      ) : (
        days.map(({ day, slots }) => (
          <View key={day} style={styles.day}>
            <SectionTitle title={formatDay(slots[0].start)} />
            {slots.map((slot) => (
              <Card key={slot.id} style={styles.slot}>
                <View style={styles.row}>
                  <AppText variant="bodyStrong" style={styles.flex}>
                    {formatTime(slot.start)} – {formatTime(slot.end)}
                  </AppText>
                  <AppText variant="caption" color={slot.reservedOrders >= slot.maxOrders ? 'danger' : 'textSecondary'}>
                    {slot.reservedOrders}/{slot.maxOrders} booked
                  </AppText>
                </View>
                <ProgressBar value={slot.maxOrders ? slot.reservedOrders / slot.maxOrders : 0} label="Booked" />
                <View style={styles.row}>
                  <AppText variant="caption" style={styles.flex}>
                    Order limit
                  </AppText>
                  <Stepper
                    label="order limit"
                    value={slot.maxOrders}
                    min={Math.max(1, slot.reservedOrders)}
                    max={200}
                    onChange={(value) => run(() => services.batches.updateSlotCapacity(user.id, slot.id, value), 'Limit updated')}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove slot"
                    disabled={slot.reservedOrders > 0}
                    hitSlop={8}
                    style={slot.reservedOrders > 0 && styles.disabled}
                    onPress={async () => {
                      const ok = await confirm({ title: 'Remove this slot?', confirmLabel: 'Remove', destructive: true });
                      if (ok) await run(() => services.batches.deleteSlot(user.id, slot.id), 'Slot removed');
                    }}>
                    <Icon name="trash" size={20} color={Colors.textSecondary} />
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <AppText variant="body" style={styles.flex}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  day: { gap: Spacing.two },
  slot: { gap: Spacing.two, padding: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.25 },
});
