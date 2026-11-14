import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { AppError, errorMessage } from '@/domain/errors';
import { formatDay, formatTime } from '@/domain/time';
import type { Order } from '@/domain/types';
import { useCurrentUser, useDbState, useServices } from '@/state/app-provider';

import { HeaderActions } from './header-actions';
import { OrderStatusBadge } from './order-parts';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { useFeedback } from './ui/feedback';
import { Icon } from './ui/icon';
import { Banner } from './ui/misc';
import { Screen, ScreenHeader } from './ui/screen';
import { AppText } from './ui/text';
import { TextField } from './ui/text-field';

/**
 * QR collection verification (Sprint 2). Staff scan the customer's QR code
 * (or type the 6 character code), check the order, then confirm collection.
 * Only Ready or Missed orders can be collected.
 */
export function ScanView({ orderId, inTabs, back }: { orderId?: string; inTabs?: boolean; back?: boolean }) {
  const user = useCurrentUser();
  const state = useDbState();
  const services = useServices();
  const { toast } = useFeedback();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [code, setCode] = useState('');
  const [found, setFound] = useState<{ orderId: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collected, setCollected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanLock = useRef(false);

  const expected = orderId ? state.orders[orderId] : undefined;
  const order: Order | undefined = found ? state.orders[found.orderId] : undefined;

  const lookUp = (raw: string) => {
    if (!user) return;
    setError(null);
    setCollected(null);
    try {
      const match = services.orders.findByCollectionCode(user.id, raw);
      if (expected && match.id !== expected.id) {
        throw new AppError('INVALID_CODE', `This code belongs to ${match.number}, not ${expected.number}.`);
      }
      setFound({ orderId: match.id, code: match.collectionCode });
      setCameraOn(false);
    } catch (e) {
      setFound(null);
      setError(errorMessage(e));
    }
  };

  const onScanned = ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    lookUp(data);
    setTimeout(() => {
      scanLock.current = false;
    }, 1500);
  };

  const startCamera = async () => {
    setError(null);
    const result = permission?.granted ? permission : await requestPermission();
    if (result.granted) setCameraOn(true);
    else setError('Camera access was not allowed. Type the code instead, or allow the camera in settings.');
  };

  const confirm = async () => {
    if (!user || !order || !found) return;
    setBusy(true);
    try {
      await services.orders.confirmCollection(user.id, order.id, found.code);
      setCollected(order.number);
      toast(`${order.number} collected`);
      setFound(null);
      setCode('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFound(null);
    setCollected(null);
    setError(null);
    setCode('');
  };

  const collectable = order && (order.status === 'ready' || order.status === 'missed');
  const customer = order ? state.users[order.customerId] : undefined;

  return (
    <Screen inTabs={inTabs} header={<ScreenHeader back={back} title="Verify pickup" subtitle={expected ? `Checking ${expected.number}` : 'Scan the customer’s QR code'} right={inTabs ? <HeaderActions /> : undefined} />}>
      {collected ? (
        <Card tone="success" style={styles.done}>
          <Icon name="verified" size={48} color={Colors.successText} />
          <AppText variant="title" color="successText">
            {collected} collected
          </AppText>
          <Button title={orderId ? 'Back' : 'Scan next order'} variant="primary" onPress={orderId ? () => router.back() : reset} />
        </Card>
      ) : null}

      {!found && !collected ? (
        <>
          {cameraOn ? (
            <View style={styles.cameraBox}>
              <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
              <View style={styles.frame} pointerEvents="none" />
            </View>
          ) : (
            <Card style={styles.cameraPlaceholder}>
              <Icon name="scan" size={56} color={Colors.primary} />
              <AppText variant="body" color="textSecondary" align="center">
                Point the camera at the QR code on the customer&apos;s order screen.
              </AppText>
              <Button title="Open camera" icon="camera" variant="primary" onPress={startCamera} />
            </Card>
          )}
          {cameraOn ? <Button title="Close camera" variant="ghost" onPress={() => setCameraOn(false)} /> : null}

          <View style={styles.manual}>
            <TextField
              label="Or type the collection code"
              placeholder="For example K7Q2PX"
              value={code}
              onChangeText={(text) => setCode(text.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              onSubmitEditing={() => lookUp(code)}
            />
            <Button title="Check code" onPress={() => lookUp(code)} disabled={code.trim().length < 6} />
          </View>
        </>
      ) : null}

      {error ? <Banner tone="danger" title={error} /> : null}

      {order && found ? (
        <Card tone="outline">
          <View style={styles.row}>
            <AppText variant="heading" style={styles.flex}>
              {order.number}
            </AppText>
            <OrderStatusBadge status={order.status} />
          </View>
          <AppText variant="body">{customer?.displayName ?? 'Customer'}</AppText>
          <AppText variant="body">{order.items.map((i) => `${i.quantity} × ${i.productName} (${i.variantName})`).join('\n')}</AppText>
          <AppText variant="caption" color="textSecondary">
            Pickup {formatDay(order.slotStart)}, {formatTime(order.slotStart)} – {formatTime(order.slotEnd)}
          </AppText>
          {order.customerNote ? <AppText variant="caption">Note: “{order.customerNote}”</AppText> : null}
          {collectable ? (
            <Button title="Confirm collection" variant="primary" icon="check" onPress={confirm} loading={busy} />
          ) : (
            <Banner
              tone="warning"
              title={order.status === 'collected' ? 'Already collected' : order.status === 'cancelled' ? 'This order was cancelled' : 'Not ready yet'}
              message={order.status === 'confirmed' || order.status === 'preparing' ? 'Orders can only be collected once they are marked Ready.' : undefined}
            />
          )}
          <Button title="Scan a different code" variant="ghost" onPress={reset} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraBox: { width: '100%', aspectRatio: 1, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  frame: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
    borderWidth: 3,
    borderColor: Colors.inverse,
    borderRadius: Radius.lg,
  },
  cameraPlaceholder: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  manual: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  done: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.five },
});
