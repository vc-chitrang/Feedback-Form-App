import { useRef, useState, type DragEvent } from 'react';
import { ImagePlus, Lock, Pencil, Rocket, Trash2, Upload } from 'lucide-react';
import { ThankYouScreen, WelcomeScreen } from '@ff/form-renderer';
import { Button, Card, Field, PageHeader, PageLoader, Select, useToast } from '../components/ui';
import { DevicePreview, DeviceToggle, type PreviewDevice } from '../components/DevicePreview';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDraft } from '../lib/draft';
import { PublishDialog } from './builder/PublishDialog';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

export function BrandingPage() {
  const { canEdit } = useAuth();
  const { doc, editing, loading, update, startEditing } = useDraft();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>('tablet');
  const [publishing, setPublishing] = useState(false);

  if (loading || !doc) return <PageLoader />;
  const readOnly = !editing || !canEdit;
  const L = doc.defaultLocale;

  const upload = async (file: File) => {
    // Client-side checks are for UX only; the server re-checks the real file bytes.
    if (!ACCEPTED.includes(file.type)) return toast('error', 'Use a PNG, JPEG or WebP image (SVG is not allowed).');
    if (file.size > MAX_BYTES) return toast('error', 'The logo must be 2 MB or smaller.');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await api<{ url: string }>('/api/admin/assets/logo', { method: 'POST', body });
      update((d) => {
        d.theme.logoUrl = r.url;
      });
      toast('success', 'Logo uploaded. Publish to show it on kiosks.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && !readOnly) void upload(f);
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="Branding & kiosk"
        description="Your logo appears on the welcome and thank-you screens. Branding is versioned with the form, so it goes live together when you publish."
        actions={
          canEdit &&
          (editing ? (
            <Button variant="primary" icon={<Rocket className="size-4" />} onClick={() => setPublishing(true)}>
              Review & publish
            </Button>
          ) : (
            <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => void startEditing()}>
              Edit
            </Button>
          ))
        }
      />

      {!editing && (
        <p className="mb-5 flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-stone-600 ring-1 ring-stone-200">
          <Lock className="size-4 text-stone-400" /> Showing the live version. Open a draft to make changes.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-1 font-semibold">Logo</h2>
            <p className="mb-4 text-sm text-stone-500">PNG, JPEG or WebP, up to 2 MB. A transparent PNG looks best.</p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!readOnly) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`grid min-h-40 place-items-center rounded-xl border-2 border-dashed p-4 transition ${dragOver ? 'border-stone-900 bg-stone-50' : 'border-stone-300'}`}
            >
              {doc.theme.logoUrl ? (
                <img src={assetUrl(doc.theme.logoUrl) ?? undefined} alt="Current logo" className="max-h-32 max-w-full object-contain" />
              ) : (
                <div className="text-center text-sm text-stone-500">
                  <ImagePlus className="mx-auto mb-2 size-8 text-stone-400" />
                  No logo yet
                  {!readOnly && <span className="block">Drag an image here</span>}
                </div>
              )}
            </div>
            {!readOnly && (
              <div className="mt-4 flex gap-2">
                <Button icon={<Upload className="size-4" />} loading={uploading} onClick={() => fileInput.current?.click()}>
                  {doc.theme.logoUrl ? 'Replace' : 'Upload'}
                </Button>
                {doc.theme.logoUrl && (
                  <Button
                    variant="ghost"
                    icon={<Trash2 className="size-4" />}
                    onClick={() =>
                      update((d) => {
                        d.theme.logoUrl = null;
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED.join(',')}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void upload(f);
                  }}
                />
              </div>
            )}
            <p className="mt-3 text-xs text-stone-500">Older versions keep showing the logo they were published with.</p>
          </Card>

          <Card className="space-y-4 p-6">
            <div>
              <h2 className="font-semibold">Kiosk behaviour</h2>
              <p className="text-sm text-stone-500">Protects visitor privacy on shared tablets.</p>
            </div>
            <Field label="Reset an unattended form after" hint="Visitors see “Are you still there?” first; then answers are wiped.">
              <Select
                value={doc.settings.idleTimeoutSec}
                disabled={readOnly}
                onChange={(e) =>
                  update((d) => {
                    d.settings.idleTimeoutSec = Number(e.target.value);
                  })
                }
              >
                {[30, 45, 60, 90, 120, 180, 300].map((s) => (
                  <option key={s} value={s}>
                    {s < 60 ? `${s} seconds` : `${s / 60} minute${s > 60 ? 's' : ''}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Show the thank-you screen for">
              <Select
                value={doc.settings.thankYouSec}
                disabled={readOnly}
                onChange={(e) =>
                  update((d) => {
                    d.settings.thankYouSec = Number(e.target.value);
                  })
                }
              >
                {[5, 8, 10, 15, 20, 30].map((s) => (
                  <option key={s} value={s}>
                    {s} seconds
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex justify-end">
            <DeviceToggle value={device} onChange={setDevice} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-stone-600">Welcome screen</p>
            <DevicePreview device={device}>
              <WelcomeScreen doc={doc} locale={L} logoSrc={assetUrl(doc.theme.logoUrl)} onStart={() => {}} />
            </DevicePreview>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-stone-600">Thank-you screen</p>
            <DevicePreview device={device}>
              <ThankYouScreen doc={doc} locale={L} logoSrc={assetUrl(doc.theme.logoUrl)} />
            </DevicePreview>
          </div>
        </div>
      </div>
      <PublishDialog open={publishing} onClose={() => setPublishing(false)} onFocusQuestion={() => {}} />
    </div>
  );
}
