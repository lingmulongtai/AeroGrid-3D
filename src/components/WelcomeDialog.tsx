import { Globe2, Radio, Sparkles } from 'lucide-react';
import type { AppMode } from '../../shared/contracts';
import type { Locale, Translator } from '../i18n';

interface WelcomeDialogProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onSelectMode: (mode: AppMode) => void;
  t: Translator;
}

export function WelcomeDialog({ locale, onLocaleChange, onSelectMode, t }: WelcomeDialogProps) {
  return (
    <div className="welcome-backdrop" role="presentation">
      <section className="welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className="welcome-language" aria-label={t('controls.language')}>
          <button type="button" aria-pressed={locale === 'en'} onClick={() => onLocaleChange('en')}>EN</button>
          <button type="button" aria-pressed={locale === 'ja'} onClick={() => onLocaleChange('ja')}>日本語</button>
        </div>
        <div className="welcome-mark" aria-hidden="true"><Globe2 /></div>
        <p className="welcome-eyebrow">{t('welcome.eyebrow')}</p>
        <h1 id="welcome-title">{t('welcome.title')}</h1>
        <p className="welcome-copy">{t('welcome.body')}</p>

        <div className="welcome-options">
          <button type="button" className="experience-card experience-card-demo" onClick={() => onSelectMode('demo')}>
            <span className="experience-icon"><Sparkles /></span>
            <span>
              <strong>{t('welcome.demo.title')}</strong>
              <small>{t('welcome.demo.body')}</small>
              <em>{t('welcome.demo.action')} →</em>
            </span>
          </button>
          <button type="button" className="experience-card experience-card-live" onClick={() => onSelectMode('live-beta')}>
            <span className="experience-icon"><Radio /></span>
            <span>
              <strong>{t('welcome.live.title')}</strong>
              <small>{t('welcome.live.body')}</small>
              <em>{t('welcome.live.action')} →</em>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
