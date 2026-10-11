import type { ItemKind } from '../shared/types';

// Hand-authored, pixel-aligned silhouettes. Shared by the arena and status HUD.
export const ITEM_ART: Record<ItemKind, { url: string; color: number; duration: number }> = {
  usb: { url: '/assets/expanded/item-usb.svg', color: 0x69e6ef, duration: 20 },
  fan: { url: '/assets/expanded/item-fan.svg', color: 0xb5f4ee, duration: 8 },
  firewall: { url: '/assets/expanded/item-firewall.svg', color: 0xffce63, duration: 10 },
  battery: { url: '/assets/expanded/item-battery.svg', color: 0x89eb87, duration: 1 },
  overclock: { url: '/assets/expanded/item-overclock.svg', color: 0xffa16a, duration: 8 },
};
export const EXPANSION_TEXTURES: Record<string, string> = Object.fromEntries([
  ...Object.entries(ITEM_ART).map(([kind, art]) => [`pickup-${kind}`, art.url] as [string, string]),
  ...['board-esp32', 'board-arduino', 'hub', 'drone-0', 'drone-1', 'pad', 'block',
    'effect-mechanical', 'effect-bolt', 'effect-wireless', 'effect-hub',
    'effect-displacement', 'effect-ricochet', 'effect-piston', 'effect-usb',
  ].map(name => [name, `/assets/expanded/${name}.svg`] as [string, string]),
]);
