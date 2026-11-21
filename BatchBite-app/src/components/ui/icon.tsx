import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * App icons. iOS uses SF Symbols; Android and web use Material Symbols (both
 * through expo-symbols, which replaces the deprecated @expo/vector-icons).
 */
const ICONS = {
  home: ['house.fill', 'home'],
  orders: ['list.bullet.rectangle.portrait', 'receipt_long'],
  cart: ['cart.fill', 'shopping_cart'],
  profile: ['person.crop.circle.fill', 'person'],
  back: ['arrow.left', 'arrow_back'],
  bell: ['bell.fill', 'notifications'],
  plus: ['plus', 'add'],
  minus: ['minus', 'remove'],
  search: ['magnifyingglass', 'search'],
  chevronDown: ['chevron.down', 'expand_more'],
  chevronUp: ['chevron.up', 'expand_less'],
  chevronRight: ['chevron.right', 'chevron_right'],
  scan: ['qrcode.viewfinder', 'qr_code_scanner'],
  qr: ['qrcode', 'qr_code_2'],
  calendar: ['calendar', 'calendar_month'],
  clock: ['clock', 'schedule'],
  box: ['shippingbox.fill', 'inventory_2'],
  insights: ['chart.bar.fill', 'insights'],
  dashboard: ['square.grid.2x2.fill', 'dashboard'],
  product: ['birthday.cake.fill', 'bakery_dining'],
  tasks: ['checklist', 'checklist'],
  settings: ['gearshape.fill', 'settings'],
  users: ['person.2.fill', 'group'],
  logout: ['rectangle.portrait.and.arrow.right', 'logout'],
  edit: ['pencil', 'edit'],
  trash: ['trash', 'delete'],
  close: ['xmark', 'close'],
  check: ['checkmark', 'check'],
  checkCircle: ['checkmark.circle.fill', 'check_circle'],
  error: ['exclamationmark.circle.fill', 'error'],
  warning: ['exclamationmark.triangle.fill', 'warning'],
  info: ['info.circle.fill', 'info'],
  camera: ['camera.fill', 'photo_camera'],
  photo: ['photo', 'image'],
  more: ['ellipsis', 'more_horiz'],
  refresh: ['arrow.clockwise', 'refresh'],
  fire: ['flame.fill', 'local_fire_department'],
  event: ['calendar.badge.clock', 'event'],
  store: ['storefront.fill', 'storefront'],
  kitchen: ['fork.knife', 'restaurant'],
  lock: ['lock.fill', 'lock'],
  key: ['key.fill', 'key'],
  payment: ['creditcard.fill', 'payments'],
  undo: ['arrow.uturn.backward', 'undo'],
  history: ['clock.arrow.circlepath', 'history'],
  timer: ['timer', 'timer'],
  verified: ['checkmark.seal.fill', 'task_alt'],
  clipboard: ['list.bullet.clipboard', 'assignment'],
  chart: ['chart.bar.xaxis', 'bar_chart'],
  addPhoto: ['photo.badge.plus', 'add_photo_alternate'],
  eye: ['eye', 'visibility'],
  eyeOff: ['eye.slash', 'visibility_off'],
  addUser: ['person.badge.plus', 'person_add'],
  manageUser: ['person.crop.circle.badge.checkmark', 'manage_accounts'],
  tune: ['slider.horizontal.3', 'tune'],
  ingredients: ['refrigerator.fill', 'kitchen'],
  inbox: ['tray.full.fill', 'list'],
  sparkles: ['sparkles', 'cake'],
} as const satisfies Record<string, readonly [SFSymbol, string]>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color = Colors.text,
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  const [ios, material] = ICONS[name];
  return (
    <SymbolView
      name={{ ios, android: material as never, web: material as never }}
      size={size}
      tintColor={color}
      style={style}
      // Icons are decorative; buttons carry their own accessibility labels.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
