"use client";

import * as React from "react";
import { Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/dashboard/user-avatar";
import {
  SettingsFieldLabel,
  SettingsOutlineButton,
  SettingsPrimaryButton,
  SettingsSectionLabel,
  settingsFieldClass,
} from "@/components/settings/settings-ui";
import { Field, FieldError } from "@/components/ui/field";
import { countries } from "@/lib/countries";
import { displayNameFromProfile } from "@/lib/display-name";
import { profileTimezones } from "@/lib/profile-timezones";
import {
  profileUpdateSchema,
  type ProfileResponse,
} from "@/schemas/onboarding.schema";
import {
  ProfileServiceError,
  removeAvatar,
  updateProfile,
  uploadAvatar,
} from "@/services/profile.service";

const avatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const avatarMaxBytes = 5 * 1024 * 1024;
type FormValues = {
  bio: string;
  name: string;
  region: string;
  timezone: string;
};

export function ProfileSettingsForm({
  profile,
}: {
  profile: ProfileResponse;
}) {
  const router = useRouter();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [values, setValues] = React.useState<FormValues>({
    bio: profile.stage1.bio ?? "",
    name:
      displayNameFromProfile({
        email: profile.user.email,
        name: profile.stage1.name || profile.user.name,
      }) ?? "",
    region: profile.stage1.region ?? "",
    timezone: profile.stage1.timezone ?? "",
  });
  const [avatarImage, setAvatarImage] = React.useState(profile.user.image);
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof FormValues, string>>
  >({});
  const [status, setStatus] = React.useState<
    "idle" | "saving" | "uploading" | "removing" | "saved"
  >("idle");
  const [requestError, setRequestError] = React.useState("");
  const busy = status === "saving" || status === "uploading" || status === "removing";
  const regionIsListed = countries.some(
    (country) => country.name === values.region,
  );
  const regionOptions =
    values.region && !regionIsListed
      ? [
          { code: `current-${values.region}`, name: values.region },
          ...countries,
        ]
      : countries;
  const timezoneOptions = profileTimezones.includes(
    values.timezone as (typeof profileTimezones)[number],
  )
    ? profileTimezones
    : values.timezone
      ? [values.timezone, ...profileTimezones]
      : profileTimezones;

  function setValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError("");
    setStatus("idle");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = profileUpdateSchema.safeParse(values);

    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof FormValues, string>> = {};

      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormValues | undefined;
        if (field && !nextErrors[field]) {
          nextErrors[field] = issue.message;
        }
      }

      setFieldErrors(nextErrors);
      return;
    }

    setStatus("saving");
    setRequestError("");

    try {
      const response = await updateProfile(parsed.data);
      setValues({
        bio: response.stage1.bio ?? "",
        name: response.stage1.name,
        region: response.stage1.region ?? "",
        timezone: response.stage1.timezone ?? "",
      });
      setStatus("saved");
      router.refresh();
    } catch (error) {
      setStatus("idle");
      setRequestError(
        error instanceof ProfileServiceError
          ? error.message
          : "We couldn't save your changes. Try again.",
      );
    }
  }

  async function handleAvatarFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!avatarTypes.has(file.type)) {
      setRequestError("Choose a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > avatarMaxBytes) {
      setRequestError("Choose an image smaller than 5 MB.");
      return;
    }

    setStatus("uploading");
    setRequestError("");

    try {
      const response = await uploadAvatar(file);
      setAvatarImage(response.user.image);
      setStatus("saved");
      router.refresh();
    } catch (error) {
      setStatus("idle");
      setRequestError(
        error instanceof ProfileServiceError
          ? error.message
          : "We couldn't upload that image. Try again.",
      );
    } finally {
      if (fileInput.current) {
        fileInput.current.value = "";
      }
    }
  }

  async function handleRemoveAvatar() {
    if (!avatarImage || busy) {
      return;
    }

    setStatus("removing");
    setRequestError("");

    try {
      const response = await removeAvatar();
      setAvatarImage(response.user.image);
      setStatus("saved");
      router.refresh();
    } catch (error) {
      setStatus("idle");
      setRequestError(
        error instanceof ProfileServiceError
          ? error.message
          : "We couldn't remove your avatar. Try again.",
      );
    }
  }

  return (
    <form className="w-full" onSubmit={handleSubmit}>
      <section className="mb-8" aria-labelledby="personal-info-title">
        <SettingsSectionLabel id="personal-info-title">
          Personal Info
        </SettingsSectionLabel>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <UserAvatar
            className="size-16 bg-foreground text-background dark:bg-accent"
            fallback="initials"
            image={avatarImage}
            name={values.name}
          />
          <div className="flex flex-wrap gap-2">
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(event) =>
                void handleAvatarFile(event.target.files?.[0])
              }
              ref={fileInput}
              type="file"
            />
            <SettingsPrimaryButton
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              {status === "uploading" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Upload
            </SettingsPrimaryButton>
            <SettingsOutlineButton
              disabled={!avatarImage || busy}
              onClick={() => void handleRemoveAvatar()}
              type="button"
            >
              {status === "removing" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Remove
            </SettingsOutlineButton>
          </div>
        </div>

        <div className="grid gap-4">
          <Field>
            <SettingsFieldLabel htmlFor="profile-name">
              Display name
            </SettingsFieldLabel>
            <input
              aria-invalid={Boolean(fieldErrors.name)}
              className={settingsFieldClass}
              disabled={busy}
              id="profile-name"
              onChange={(event) => setValue("name", event.target.value)}
              value={values.name}
            />
            {fieldErrors.name ? <FieldError>{fieldErrors.name}</FieldError> : null}
          </Field>

          <Field>
            <SettingsFieldLabel htmlFor="profile-email">Email</SettingsFieldLabel>
            <input
              className={settingsFieldClass}
              disabled
              id="profile-email"
              value={profile.user.email}
            />
            <p className="mt-0.5 text-[11px] text-muted">
              Used for sign-in and notifications. Not editable here.
            </p>
          </Field>

          <Field>
            <SettingsFieldLabel htmlFor="profile-bio">Bio</SettingsFieldLabel>
            <textarea
              aria-invalid={Boolean(fieldErrors.bio)}
              className={cnTextarea(settingsFieldClass)}
              disabled={busy}
              id="profile-bio"
              maxLength={280}
              onChange={(event) => setValue("bio", event.target.value)}
              placeholder="Tell us about yourself..."
              rows={3}
              value={values.bio}
            />
            <p className="mt-0.5 text-[11px] text-muted">
              {values.bio.length}/280
            </p>
            {fieldErrors.bio ? <FieldError>{fieldErrors.bio}</FieldError> : null}
          </Field>
        </div>
      </section>

      <section className="mb-8" aria-labelledby="region-timezone-title">
        <SettingsSectionLabel id="region-timezone-title">
          Region &amp; Timezone
        </SettingsSectionLabel>
        <div className="grid gap-4">
          <Field>
            <SettingsFieldLabel htmlFor="profile-region">Country</SettingsFieldLabel>
            <select
              aria-invalid={Boolean(fieldErrors.region)}
              className={settingsFieldClass}
              disabled={busy}
              id="profile-region"
              onChange={(event) => setValue("region", event.target.value)}
              value={values.region}
            >
              <option value="">Choose a country</option>
              {regionOptions.map((country) => (
                <option key={country.code} value={country.name}>
                  {country.name}
                </option>
              ))}
            </select>
            {fieldErrors.region ? <FieldError>{fieldErrors.region}</FieldError> : null}
          </Field>

          <Field>
            <SettingsFieldLabel htmlFor="profile-timezone">Timezone</SettingsFieldLabel>
            <select
              aria-invalid={Boolean(fieldErrors.timezone)}
              className={settingsFieldClass}
              disabled={busy}
              id="profile-timezone"
              onChange={(event) => setValue("timezone", event.target.value)}
              value={values.timezone}
            >
              <option value="">Choose a timezone</option>
              {timezoneOptions.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
            <p className="mt-0.5 text-[11px] text-muted">
              Used to deliver your daily tasks at 7 AM local time.
            </p>
            {fieldErrors.timezone ? (
              <FieldError>{fieldErrors.timezone}</FieldError>
            ) : null}
          </Field>
        </div>
      </section>

      {requestError ? (
        <p className="mb-4 text-sm font-medium text-destructive" role="alert">
          {requestError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SettingsPrimaryButton disabled={busy} type="submit">
          {status === "saving" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : null}
          Save changes
        </SettingsPrimaryButton>
        {status === "saved" ? (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success"
            role="status"
          >
            <Check className="size-4" /> Changes saved successfully
          </span>
        ) : null}
      </div>
    </form>
  );
}

function cnTextarea(base: string) {
  return `${base} min-h-20 resize-y py-2.5 leading-normal`;
}
