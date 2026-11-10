import { useEffect, useState } from 'react';

export function App() {
  const [status, setStatus] = useState('Contacting the server…');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { ok: boolean }) => setStatus(body.ok ? 'Server is up.' : 'Server answered, but not OK.'))
      .catch(() => setStatus('Cannot reach the server.'));
  }, []);

  return (
    <main className="boot">
      <h1>Middle-earth Chronicle</h1>
      <p>{status}</p>
    </main>
  );
}
