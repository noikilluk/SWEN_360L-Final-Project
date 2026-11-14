/**
 * Small single-series charts for the Insights screen, drawn with Views so they
 * work on every platform. One hue (the brand purple, validated for contrast on
 * white), bars capped at 24px with 4px rounded ends from a single baseline,
 * hairline baseline, tap a bar to see its exact value, and every chart can be
 * switched to a table for screen readers.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { AppText } from './ui/text';

export interface ChartPoint {
  key: string;
  label: string;
  /** Short label under a column, for example "Mon". */
  shortLabel?: string;
  value: number;
}

export function ColumnChart({
  points,
  format,
  height = 140,
  title,
}: {
  points: ChartPoint[];
  format: (value: number) => string;
  height?: number;
  title: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...points.map((p) => p.value));
  const peak = points.reduce<ChartPoint | null>((best, p) => (!best || p.value > best.value ? p : best), null);
  const active = points.find((p) => p.key === selected) ?? null;
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <AppText variant="caption" color="textSecondary" style={styles.flex}>
          {active ? `${active.label}: ${format(active.value)}` : peak && peak.value > 0 ? `Best day: ${peak.label}, ${format(peak.value)}` : 'No sales in this period'}
        </AppText>
        <TableToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </View>
      {asTable ? (
        <DataTable rows={points.map((p) => [p.label, format(p.value)])} title={title} />
      ) : (
        <>
          <View style={[styles.plot, { height }]} accessibilityLabel={`${title}. Tap a column to see its value.`}>
            {points.map((point, index) => {
              const barHeight = point.value > 0 ? Math.max(3, (point.value / max) * (height - 4)) : 0;
              const isActive = point.key === selected;
              return (
                <Pressable
                  key={point.key}
                  style={styles.slot}
                  onPress={() => setSelected(isActive ? null : point.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${point.label}: ${format(point.value)}`}>
                  <View
                    style={[
                      styles.column,
                      { height: barHeight, opacity: selected && !isActive ? 0.45 : 1 },
                      index === points.length - 1 && styles.last,
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.baseline} />
          <View style={styles.axis}>
            {points.map((point, index) => (
              <AppText key={point.key} variant="small" color="textMuted" align="center" style={styles.slot} numberOfLines={1}>
                {index % labelEvery === 0 ? (point.shortLabel ?? point.label) : ''}
              </AppText>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Optional maximum for this row (for "sold of max" bars). */
  max?: number;
  valueLabel: string;
}

/** Horizontal bars with the value at the tip, for rankings such as top products. */
export function BarList({ rows, title }: { rows: BarRow[]; title: string }) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...rows.map((r) => r.max ?? r.value));
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.flex} />
        <TableToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </View>
      {asTable ? (
        <DataTable rows={rows.map((r) => [r.label, r.valueLabel])} title={title} />
      ) : (
        rows.map((row) => {
          const scale = row.max ?? max;
          return (
            <View key={row.key} style={styles.barRow} accessibilityLabel={`${row.label}: ${row.valueLabel}`}>
              <AppText variant="caption" numberOfLines={1}>
                {row.label}
              </AppText>
              <View style={styles.barLine}>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { width: `${Math.min(1, row.value / scale) * 100}%` }]} />
                </View>
                <AppText variant="small" color="textSecondary" style={styles.barValue}>
                  {row.valueLabel}
                </AppText>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function TableToggle({ asTable, onToggle }: { asTable: boolean; onToggle: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onToggle} hitSlop={8}>
      <AppText variant="small" color="primary">
        {asTable ? 'Show chart' : 'Show table'}
      </AppText>
    </Pressable>
  );
}

function DataTable({ rows, title }: { rows: string[][]; title: string }) {
  return (
    <View style={styles.table} accessibilityLabel={`${title} table`}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.tableRow}>
          <AppText variant="caption" style={styles.flex}>
            {label}
          </AppText>
          <AppText variant="caption">{value}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  plot: { flexDirection: 'row', alignItems: 'flex-end' },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', paddingHorizontal: 1 },
  column: {
    width: '100%',
    maxWidth: 24,
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  last: {},
  baseline: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.track },
  axis: { flexDirection: 'row' },
  barRow: { gap: Spacing.half },
  barLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  barTrack: { flex: 1, height: 12, justifyContent: 'center' },
  bar: { height: 12, backgroundColor: Colors.primary, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  barValue: { minWidth: 64, textAlign: 'right' },
  table: { borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
});
