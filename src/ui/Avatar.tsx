import { useEffect, useState } from 'react';
import type { Appearance, AssetsManifest, Discipline } from '../shared/types';
import { disciplineInfo } from './i18n';

export function Avatar({ appearance, manifest, discipline = 'networks', animated = false, portrait = false, hurt = false, eliminated = false }: { appearance: Appearance; manifest: AssetsManifest | null; discipline?: Discipline; animated?: boolean; portrait?: boolean; hurt?: boolean; eliminated?: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!animated || !manifest) return;
    const frames = manifest.poses.idle ?? [0];
    const timer = setInterval(() => setFrame(current => (current + 1) % frames.length), 200);
    return () => clearInterval(timer);
  }, [animated, manifest]);
  const index = manifest?.poses[hurt ? 'hurt' : 'idle']?.[hurt ? 0 : frame] ?? 0;
  const style = manifest ? {
    width: manifest.sheets.frameWidth, height: manifest.sheets.frameHeight,
    backgroundPosition: `-${index % manifest.sheets.columns * manifest.sheets.frameWidth}px -${Math.floor(index / manifest.sheets.columns) * manifest.sheets.frameHeight}px`,
  } : {};
  const layers = manifest ? [manifest.sheets.body, ...(['hair', 'shirt', 'pants'] as const).map(layer => manifest.sheets[layer][appearance[layer]]).filter(Boolean)] : [];
  return <div className={`avatar ${portrait ? 'avatar-portrait' : ''} ${eliminated ? 'is-eliminated' : ''}`} style={{ '--discipline': disciplineInfo[discipline].color } as React.CSSProperties}>
    <div className="avatar-glow" />
    <div className="avatar-sprite">{layers.map((url, i) => <span key={url + i} style={{ ...style, backgroundImage: `url("${url}")` }} />)}</div>
  </div>;
}
