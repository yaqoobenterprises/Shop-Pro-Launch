import React, { useEffect, useRef, useState } from "react";
import { Camera, Check, UserRound, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { UserAvatar } from "../common/UserAvatar";

const MAX_AVATAR_BYTES = 160 * 1024;

async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");

  const image = new Image();
  const source = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be opened."));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    const edge = 384;
    const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the selected image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const avatar = canvas.toDataURL("image/webp", 0.78);
    const encodedBytes = Math.ceil((avatar.length * 3) / 4);
    if (encodedBytes > MAX_AVATAR_BYTES) throw new Error("Choose a simpler image under 160 KB after compression.");
    return avatar;
  } finally {
    URL.revokeObjectURL(source);
  }
}

export const ProfileSettingsSection: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url || null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name || "");
    setAvatarUrl(user?.avatar_url || null);
  }, [user?.id, user?.full_name, user?.avatar_url]);

  const handlePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSaved(false);
    setIsPreparingPhoto(true);
    try {
      setAvatarUrl(await prepareAvatar(file));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Could not prepare this image.");
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setIsSaving(true);
    try {
      const result = await updateProfile({ full_name: fullName, avatar_url: avatarUrl });
      if (!result.success) throw new Error(result.error || "Could not save your profile.");
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="profile" className="workspace-panel settings-section p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="settings-icon"><UserRound className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-semibold text-on-surface">Profile</h2>
          <p className="mt-0.5 text-xs text-text-muted">Your account name and profile photo.</p>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-danger-border bg-danger-bg p-3 text-xs text-danger">{error}</p>}
      {saved && <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-success-border bg-success-bg p-3 text-xs text-success"><Check className="h-4 w-4" />Profile updated.</p>}

      <form onSubmit={handleSave} className="grid gap-5 sm:max-w-xl sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-3 sm:block">
          <UserAvatar src={avatarUrl || undefined} name={fullName || user?.email} size="2xl" />
          <div className="flex flex-wrap gap-2 sm:mt-3">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={isPreparingPhoto} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border-standard bg-surface-bright px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-60">
              <Camera className="h-3.5 w-3.5" />{isPreparingPhoto ? "Preparing…" : "Change photo"}
            </button>
            {avatarUrl && <button type="button" onClick={() => setAvatarUrl(null)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-secondary hover:bg-surface-container-low"><X className="h-3.5 w-3.5" />Remove</button>}
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => void handlePhoto(event)} />
        </div>

        <div className="space-y-4">
          <label className="settings-field block">
            <span>Full name</span>
            <input required maxLength={80} autoComplete="name" value={fullName} onChange={(event) => { setFullName(event.target.value); setSaved(false); }} placeholder="Your name" />
          </label>
          <label className="settings-field block">
            <span>Email</span>
            <input type="email" value={user?.email || ""} readOnly className="opacity-70" />
          </label>
          <p className="text-[11px] text-text-muted">Profile pictures are resized and compressed before being saved to this account.</p>
          <button type="submit" disabled={isSaving || isPreparingPhoto || !user} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-60">
            {isSaving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </section>
  );
};
