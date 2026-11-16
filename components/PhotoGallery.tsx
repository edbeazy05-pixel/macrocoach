'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { currentUserId } from '@/lib/api';
import { newId } from '@/lib/offlineQueue';
import { shrinkImage } from '@/lib/photos';
import { todayLocal } from '@/lib/dates';
import Sheet from './Sheet';

type Photo = { id: string; taken_on: string; path: string; url: string | null };

export default function PhotoGallery() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);

  const photos = useQuery({
    queryKey: ['photos'],
    queryFn: async (): Promise<Photo[]> => {
      const { data, error } = await supabase.from('progress_photos').select('id, taken_on, path').order('taken_on', { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) return [];
      // Private bucket: each photo is shown through a link that expires in 1 hour
      const { data: signed, error: e2 } = await supabase.storage.from('progress-photos').createSignedUrls(rows.map((r) => r.path), 3600);
      if (e2) throw e2;
      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }));
    },
  });

  async function upload(file: File) {
    setBusy(true); setErr(null);
    try {
      const userId = await currentUserId();
      const blob = await shrinkImage(file);
      const id = newId();
      const path = `${userId}/${id}.jpg`;
      const { error } = await supabase.storage.from('progress-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { error: e2 } = await supabase.from('progress_photos').insert({ id, user_id: userId, path, taken_on: todayLocal() });
      if (e2) {
        await supabase.storage.from('progress-photos').remove([path]); // do not leave an orphan file
        throw e2;
      }
      await qc.invalidateQueries({ queryKey: ['photos'] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(p: Photo) {
    setBusy(true); setErr(null);
    const { error } = await supabase.from('progress_photos').delete().eq('id', p.id);
    if (!error) await supabase.storage.from('progress-photos').remove([p.path]);
    setBusy(false);
    if (error) return setErr(error.message);
    setViewing(null);
    setPicked((x) => x.filter((i) => i !== p.id));
    await qc.invalidateQueries({ queryKey: ['photos'] });
  }

  const list = photos.data ?? [];
  const sel = picked.map((id) => list.find((p) => p.id === id)).filter(Boolean) as Photo[];
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x.slice(-1), id]));

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Progress photos</h2>
        <button className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading...' : 'Add photo'}</button>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {err && <p className="err">{err}</p>}
      {photos.isLoading && <p className="muted text-sm">Loading...</p>}
      {list.length === 0 && !photos.isLoading && <p className="muted text-sm">Photos stay private to your account. Same light, same pose, same time of day works best.</p>}
      {list.length > 0 && (
        <>
          <p className="muted text-xs">Tap two photos, then Compare. Tap Open to view or delete one.</p>
          <div className="grid grid-cols-3 gap-2">
            {list.map((p) => (
              <div key={p.id} className="space-y-1">
                <button className="relative block w-full overflow-hidden rounded-lg" onClick={() => toggle(p.id)}
                  aria-pressed={picked.includes(p.id)} aria-label={`Select photo from ${p.taken_on}`}
                  style={{ outline: picked.includes(p.id) ? '3px solid var(--accent)' : 'none' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.url ? <img src={p.url} alt={`Progress ${p.taken_on}`} className="aspect-[3/4] w-full object-cover" /> : <div className="aspect-[3/4] w-full" />}
                </button>
                <div className="flex items-center justify-between text-xs">
                  <span className="muted">{p.taken_on.slice(5)}</span>
                  <button className="text-[var(--accent)]" onClick={() => setViewing(p)}>Open</button>
                </div>
              </div>
            ))}
          </div>
          <button className="btn w-full" disabled={sel.length !== 2} onClick={() => setCompare(true)}>Compare selected ({sel.length}/2)</button>
        </>
      )}

      <Sheet open={compare && sel.length === 2} onClose={() => setCompare(false)} title="Compare">
        <div className="grid grid-cols-2 gap-2">
          {[...sel].sort((a, b) => a.taken_on.localeCompare(b.taken_on)).map((p) => (
            <figure key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url && <img src={p.url} alt={`Progress ${p.taken_on}`} className="w-full rounded-lg" />}
              <figcaption className="muted mt-1 text-center text-xs">{p.taken_on}</figcaption>
            </figure>
          ))}
        </div>
      </Sheet>
      <Sheet open={!!viewing} onClose={() => setViewing(null)} title={viewing?.taken_on ?? 'Photo'}>
        {viewing?.url && <img src={viewing.url} alt={`Progress ${viewing.taken_on}`} className="w-full rounded-lg" />}
        {viewing && <button className="btn btn-danger mt-3 w-full" disabled={busy} onClick={() => remove(viewing)}>Delete photo</button>}
      </Sheet>
    </section>
  );
}
