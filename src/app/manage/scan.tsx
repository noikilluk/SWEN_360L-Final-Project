import { useLocalSearchParams } from 'expo-router';

import { ScanView } from '@/components/scan-view';

/** QR verification opened from an order or the board, optionally for one order. */
export default function ScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  return <ScanView orderId={orderId} back />;
}
