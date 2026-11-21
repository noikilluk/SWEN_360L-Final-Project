import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarList, ColumnChart } from '@/components/charts';
import { HeaderActions } from '@/components/header-actions';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { KeyValue, SectionTitle } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { computeInsights } from '@/domain/insights';
import { formatMoney } from '@/domain/money';
import { formatQuantity } from '@/domain/recipe';
import { formatDay, formatDuration } from '@/domain/time';
import { useDbState, useNow } from '@/state/app-provider';

const RANGES = [7, 14, 30] as const;

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** Sales and production insights (Sprint 2). */
export default function OwnerInsights() {
  const state = useDbState();
  const now = useNow(60_000);
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const insights = computeInsights(state, now, days);

  return (
    <Screen inTabs header={<ScreenHeader title="Insights" subtitle={`Last ${days} days`} right={<HeaderActions />} />}>
      <View style={styles.ranges}>
        {RANGES.map((range) => (
          <Chip key={range} label={`${range} days`} selected={days === range} onPress={() => setDays(range)} />
        ))}
      </View>

      <View style={styles.tiles}>
        <Tile label="Net revenue" value={formatMoney(insights.netRevenue)} note={insights.refunds ? `after ${formatMoney(insights.refunds)} refunds` : 'no refunds'} />
        <Tile label="Orders" value={String(insights.orderCount)} note={`${insights.unitsSold} items`} />
        <Tile label="Average order" value={formatMoney(insights.averageOrderValue)} />
        <Tile label="Est. margin" value={formatMoney(insights.estimatedMargin)} note={`ingredients ${formatMoney(insights.ingredientCost)}`} />
      </View>

      <Card>
        <SectionTitle title="Daily revenue" />
        <ColumnChart
          title="Daily revenue"
          points={insights.daily.map((d) => ({ key: d.key, label: d.label, shortLabel: d.label.split(' ')[1], value: Math.max(0, d.revenue) }))}
          format={formatMoney}
        />
      </Card>

      <Card>
        <SectionTitle title="Top products" />
        {insights.topProducts.length ? (
          <BarList
            title="Top products by items sold"
            rows={insights.topProducts.map((p) => ({ key: p.productId, label: p.name, value: p.units, valueLabel: `${p.units} · ${formatMoney(p.revenue)}` }))}
          />
        ) : (
          <AppText variant="body" color="textSecondary">
            No sales yet in this period.
          </AppText>
        )}
      </Card>

      <Card>
        <SectionTitle title="Batch sell-through" />
        {insights.batches.length ? (
          <BarList
            title="Units sold out of maximum per batch"
            rows={insights.batches.map((b) => ({
              key: b.batchId,
              label: `${b.name} · ${formatDay(b.collectionStart)}`,
              value: b.sold,
              max: b.max,
              valueLabel: `${b.sold}/${b.max} (${percent(b.sellThrough)})`,
            }))}
          />
        ) : (
          <AppText variant="body" color="textSecondary">
            No batches in this period.
          </AppText>
        )}
      </Card>

      <Card>
        <SectionTitle title="Production and pickup" />
        <KeyValue
          label="Order to ready (average)"
          value={insights.averagePrepMinutes === null ? '—' : formatDuration(insights.averagePrepMinutes * 60_000)}
        />
        <KeyValue label="Ready on time" value={percent(insights.onTimeRate)} />
        <KeyValue label="Collected vs missed" value={`${insights.collectedCount} / ${insights.missedCount}`} />
        <KeyValue label="Collection rate" value={percent(insights.collectionRate)} />
        <KeyValue label="Pickup slot usage" value={percent(insights.slotUtilisation)} />
        <KeyValue label="Cancelled orders" value={String(insights.cancelledCount)} />
      </Card>

      <Card>
        <SectionTitle title="Ingredient use" />
        {insights.ingredientUsage.length ? (
          <BarList
            title="Ingredient cost"
            rows={insights.ingredientUsage.slice(0, 6).map((u) => ({
              key: u.ingredientId,
              label: `${u.name} · ${formatQuantity(u.quantity, u.unit)}`,
              value: u.cost,
              valueLabel: formatMoney(u.cost),
            }))}
          />
        ) : (
          <AppText variant="body" color="textSecondary">
            No ingredients used yet.
          </AppText>
        )}
        <AppText variant="small" color="textMuted">
          Based on the recipe version locked into each order.
        </AppText>
      </Card>
    </Screen>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.tile}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      {note ? (
        <AppText variant="small" color="textMuted">
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ranges: { flexDirection: 'row', gap: Spacing.two },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.four,
    gap: Spacing.half,
  },
});
