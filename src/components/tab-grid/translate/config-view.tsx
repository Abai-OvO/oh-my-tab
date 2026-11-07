import { CaretLeft, Check, WarningCircle } from "@phosphor-icons/react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validTranslateEndpoint } from "@/lib/translate"
import type { TranslateProviderId } from "@/lib/translate/types"
import { toast } from "@/stores/toast-store"
import { useTranslateStore } from "@/stores/translate-store"

export default function TranslateConfigView({
  provider,
  onBack,
  onSaved,
}: {
  provider: TranslateProviderId
  onBack: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const libreErrorId = useId()
  const customErrorId = useId()
  const savedLibreHost = useTranslateStore((state) => state.libreHost)
  const savedLibreKey = useTranslateStore((state) => state.libreApiKey)
  const savedCustomUrl = useTranslateStore((state) => state.customUrl)
  const savedCustomKey = useTranslateStore((state) => state.customApiKey)
  const setConfig = useTranslateStore((state) => state.setConfig)
  const [libreHost, setLibreHost] = useState(savedLibreHost)
  const [libreKey, setLibreKey] = useState(savedLibreKey)
  const [customUrl, setCustomUrl] = useState(savedCustomUrl)
  const [customKey, setCustomKey] = useState(savedCustomKey)

  const libreEndpoint = validTranslateEndpoint(libreHost)
  const customEndpoint = validTranslateEndpoint(customUrl)
  const libreInvalid = Boolean(libreHost.trim()) && !libreEndpoint
  const customInvalid = Boolean(customUrl.trim()) && !customEndpoint
  const libreMissing = provider === "libre" && !libreEndpoint
  const customMissing = provider === "custom" && !customEndpoint
  const libreError = libreMissing || libreInvalid
  const customError = customMissing || customInvalid
  const disabled = libreError || customError

  function save() {
    if (disabled) return
    setConfig({
      libreHost: libreEndpoint ?? "",
      libreApiKey: libreKey.trim(),
      customUrl: customEndpoint ?? "",
      customApiKey: customKey.trim(),
    })
    toast(t("grid.translate.configSaved"), "success")
    onSaved()
  }

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("grid.translate.back")}
          title={t("grid.translate.back")}
          onClick={onBack}
          className="shrink-0"
        >
          <CaretLeft size={17} />
        </Button>
        <p className="min-w-0 pt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t("grid.translate.configDescription")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="translate-config-section">
          <legend className="flex items-center gap-2">
            {t("grid.translate.libreSection")}
            {provider === "libre" && (
              <span className="translate-active-badge">
                {t("grid.translate.activeProvider")}
              </span>
            )}
          </legend>
          <label className="translate-config-field">
            <span>{t("grid.translate.libreHost")}</span>
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              autoFocus={provider !== "custom"}
              required={provider === "libre"}
              placeholder="https://libretranslate.example.com"
              value={libreHost}
              aria-invalid={libreError || undefined}
              aria-describedby={libreError ? libreErrorId : undefined}
              onChange={(event) => setLibreHost(event.target.value)}
            />
          </label>
          <label className="translate-config-field">
            <span>{t("grid.translate.libreApiKey")}</span>
            <Input
              type="password"
              autoComplete="off"
              value={libreKey}
              onChange={(event) => setLibreKey(event.target.value)}
            />
          </label>
          {libreError && (
            <p id={libreErrorId} className="translate-config-error">
              {t(
                libreMissing
                  ? "grid.translate.requiredUrl"
                  : "grid.translate.invalidUrl"
              )}
            </p>
          )}
        </fieldset>

        <fieldset className="translate-config-section">
          <legend className="flex items-center gap-2">
            {t("grid.translate.customSection")}
            {provider === "custom" && (
              <span className="translate-active-badge">
                {t("grid.translate.activeProvider")}
              </span>
            )}
          </legend>
          <label className="translate-config-field">
            <span>{t("grid.translate.customUrl")}</span>
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              autoFocus={provider === "custom"}
              required={provider === "custom"}
              placeholder="https://translate.example.com/api"
              value={customUrl}
              aria-invalid={customError || undefined}
              aria-describedby={customError ? customErrorId : undefined}
              onChange={(event) => setCustomUrl(event.target.value)}
            />
          </label>
          <label className="translate-config-field">
            <span>{t("grid.translate.customApiKey")}</span>
            <Input
              type="password"
              autoComplete="off"
              value={customKey}
              onChange={(event) => setCustomKey(event.target.value)}
            />
          </label>
          {customError && (
            <p id={customErrorId} className="translate-config-error">
              {t(
                customMissing
                  ? "grid.translate.requiredUrl"
                  : "grid.translate.invalidUrl"
              )}
            </p>
          )}
        </fieldset>
      </div>

      <p className="flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <WarningCircle size={14} className="shrink-0" />
        {t("grid.translate.configHint")}
      </p>

      <div className="mt-auto flex justify-end">
        <Button type="submit" disabled={disabled}>
          {t("grid.translate.save")}
          <Check size={14} />
        </Button>
      </div>
    </form>
  )
}
