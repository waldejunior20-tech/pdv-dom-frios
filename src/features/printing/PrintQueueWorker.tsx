import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { resumeRecoverablePrintJobs } from './service';

export default function PrintQueueWorker() {
  useEffect(() => {
    let disposed = false;
    let running = false;

    async function tick() {
      if (disposed || running || !navigator.onLine) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session || disposed) return;
      running = true;
      try {
        await resumeRecoverablePrintJobs(data.session.access_token);
      } catch {
        // O job permanece no Supabase; o próximo ciclo tentará novamente.
      } finally {
        running = false;
      }
    }

    void tick();
    const interval = window.setInterval(() => void tick(), 30_000);
    const onOnline = () => void tick();
    window.addEventListener('online', onOnline);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}
