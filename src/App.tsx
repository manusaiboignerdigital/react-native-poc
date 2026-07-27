import { useEffect } from 'react';
import { useApp } from './store';
import { SetupPage } from './pages/SetupPage';
import { HomePage } from './pages/HomePage';
import { ListPage } from './pages/ListPage';
import { RecordPage } from './pages/RecordPage';

export function App() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const online = useApp((s) => s.online);
  const init = useApp((s) => s.init);
  const setOnline = useApp((s) => s.setOnline);
  const refresh = useApp((s) => s.refresh);
  const view = useApp((s) => s.view);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [setOnline]);

  return (
    <>
      <header>
        <span className="brand">Espo Offline</span>
        <span className={online ? 'badge online' : 'badge offline'}>
          {online ? 'online' : 'offline'}
        </span>
      </header>

      {status === 'starting' && <p className="center muted">Starte …</p>}
      {status === 'booting' && <p className="center muted">Lade Metadaten …</p>}
      {status === 'setup' && <SetupPage />}
      {status === 'ready' && (
        <>
          {view.name === 'home' && <HomePage />}
          {view.name === 'list' && <ListPage entityType={view.entityType} />}
          {(view.name === 'detail' || view.name === 'edit') && (
            <RecordPage
              key={`${view.entityType}:${view.id}`}
              entityType={view.entityType}
              id={view.id}
              mode={view.name}
            />
          )}
        </>
      )}
      {status === 'error' && (
        <main className="card">
          <h2>Start nicht möglich</h2>
          <p className="error">{error}</p>
          <button onClick={() => void refresh()}>Erneut versuchen</button>
        </main>
      )}
    </>
  );
}
