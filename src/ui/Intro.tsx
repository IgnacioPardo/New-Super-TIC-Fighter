import { useEffect } from 'react';
import type { AppSettings, AssetsManifest } from '../shared/types';
import { Avatar } from './Avatar';
import { ui } from './i18n';
import './Intro.css';

export function Intro({ manifest, settings, onContinue }: {
  manifest: AssetsManifest | null;
  settings: AppSettings;
  onContinue: () => void;
}) {
  const t = ui[settings.language];
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey ||
          ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key) || /^F\d{1,2}$/.test(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      // Consume the opening gesture before the shared menu handler can select Local.
      event.preventDefault();
      event.stopImmediatePropagation();
      onContinue();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onContinue]);

  return <section className="intro-screen" aria-label="New Super TIC Fighter">
    <div className="intro-art" aria-hidden="true">
      <img className="intro-logo" src="/assets/branding/overdrive.svg" alt="" fetchPriority="high" draggable={false} />
      <div className="intro-cast">
        {(['networks', 'design', 'code', 'hardware'] as const).map((discipline, index) =>
          <div className={`intro-fighter ${index > 1 ? 'intro-fighter-right' : ''}`} key={discipline}>
            <Avatar manifest={manifest} discipline={discipline} appearance={{ hair: index, shirt: index, pants: index }} animated={!settings.reducedMotion} />
          </div>)}
      </div>
    </div>
    <button type="button" data-testid="intro-continue" data-autofocus className="intro-continue" onClick={() => onContinue()}>
      <span className="intro-prompt">{t.introPrompt}</span>
      <span className="intro-input-hint">{t.introInputHint}</span>
    </button>
    <p className="intro-tagline">{t.subtitle}</p>
  </section>;
}
