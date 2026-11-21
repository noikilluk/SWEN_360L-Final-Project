import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { isSlotAvailable, slotPlacesLeft } from '@/domain/batch';
import { formatTime } from '@/domain/time';
import type { ID, PickupSlot } from '@/domain/types';

import { Chip } from './ui/chip';
import { AppText } from './ui/text';

/**
 * Pickup slot grid from the cart wireframe: "4:00 pm | 3 left". Full slots are
 * shown but cannot be selected (FR-06).
 */
export function SlotPicker({
  slots,
  selectedId,
  onSelect,
  allowId,
}: {
  slots: PickupSlot[];
  selectedId?: ID;
  onSelect: (slot: PickupSlot) => void;
  /** A slot that stays selectable even if full (the order's current slot). */
  allowId?: ID;
}) {
  if (slots.length === 0) {
    return (
      <AppText variant="body" color="textSecondary">
        No pickup slots are open for this day yet.
      </AppText>
    );
  }
  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const available = isSlotAvailable(slot) || slot.id === allowId;
        return (
          <View key={slot.id} style={styles.cell}>
            <Chip
              label={formatTime(slot.start)}
              detail={slot.id === allowId ? 'current' : available ? `${slotPlacesLeft(slot)} left` : 'full'}
              selected={slot.id === selectedId}
              disabled={!available}
              onPress={() => onSelect(slot)}
              testID={`slot-${formatTime(slot.start)}`}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.one },
  cell: { width: '50%', padding: Spacing.one },
});
