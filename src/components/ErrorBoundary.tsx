import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { failed: boolean }

/**
 * Last line of defence: a render error would otherwise unmount the whole tree
 * and leave a blank page. Copy is bilingual because the locale state lives
 * inside the tree that just failed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AeroGrid render failure', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 12, padding: 24, textAlign: 'center', background: '#02050a', color: '#e6edf7', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>AeroGrid 3D could not be displayed</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>Something went wrong while drawing the atlas. / 表示中に問題が発生しました。</p>
        <button type="button" onClick={() => window.location.reload()} style={{ justifySelf: 'center', padding: '8px 16px', borderRadius: 8, border: '1px solid #4b6cb7', background: '#17233f', color: 'inherit', cursor: 'pointer' }}>
          Reload / 再読み込み
        </button>
      </main>
    );
  }
}
