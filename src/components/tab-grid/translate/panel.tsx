import {
  ArrowsLeftRight,
  CircleNotch,
  Copy,
  DownloadSimple,
  GearSix,
  Translate as TranslateIcon,
  WarningCircle,
} from "@phosphor-icons/react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { chromeAutoSupported } from "@/lib/translate/chrome-builtin"
import {
  resolveTranslateProvider,
  translateProviderId,
  translateProviderOrigin,
  validTranslateEndpoint,
} from "@/lib/translate"
import {
  canonicalLanguage,
  commonTranslateLanguages,
  fallbackSourceLanguage,
  isTranslateLanguage,
  languageName,
  sortedTranslateLanguages,
} from "@/lib/translate/languages"
import type { TranslateErrorCode } from "@/lib/translate/errors"
import { TranslateError } from "@/lib/translate/errors"
import {
  isTranslateProviderId,
  TRANSLATE_MAX_CHARS,
  type TranslateAvailability,
  type TranslateConfig,
  type TranslateProvider,
  type TranslateProviderId,
} from "@/lib/translate/types"
import type { TranslateWidgetItem } from "@/lib/grid/utility-types"
import { hasWidgetOrigin, requestWidgetOrigin } from "@/stores/privacy-store"
import { toast } from "@/stores/toast-store"
import { useTranslateStore } from "@/stores/translate-store"
import { updateUtilityWidget } from "@/stores/widget-actions"
import TranslateConfigView from "./config-view"
import "./translate.css"

type Trigger = "manual" | "auto"
type TranslatePatch = {
  provider?: TranslateProviderId
  sourceLang?: string
  targetLang?: string
  autoTranslate?: boolean
}
const CONFIGURE_VALUE = "__configure_providers__"

export default function TranslatePanel({
  item,
  onClose,
}: {
  item: TranslateWidgetItem
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const libreHost = useTranslateStore((state) => state.libreHost)
  const libreApiKey = useTranslateStore((state) => state.libreApiKey)
  const customUrl = useTranslateStore((state) => state.customUrl)
  const customApiKey = useTranslateStore((state) => state.customApiKey)
  const config = useMemo<TranslateConfig>(
    () => ({ libreHost, libreApiKey, customUrl, customApiKey }),
    [libreHost, libreApiKey, customUrl, customApiKey]
  )
  const provider = translateProviderId(item)
  const source = item.sourceLang
  const target = item.targetLang
  const autoId = useId()
  const sourceId = useId()
  const [view, setView] = useState<"translator" | "config">("translator")
  const [input, setInput] = useState("")
  const inputRef = useRef("")
  const [output, setOutput] = useState("")
  const [detected, setDetected] = useState<string | null>(null)
  const [error, setError] = useState<TranslateErrorCode | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [availability, setAvailability] =
    useState<TranslateAvailability | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestRef = useRef(0)
  const providerRef = useRef<TranslateProvider | null>(null)
  const lastTranslationRef = useRef<string | null>(null)
  const failedTranslationRef = useRef<string | null>(null)
  const sourceRef = useRef<HTMLTextAreaElement | null>(null)
  const previousViewRef = useRef(view)

  useEffect(() => {
    const wasConfig = previousViewRef.current === "config"
    previousViewRef.current = view
    if (!wasConfig || view !== "translator") return
    const frame = window.requestAnimationFrame(() => sourceRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      providerRef.current?.dispose?.()
    },
    []
  )

  useEffect(() => {
    if (view !== "translator" || provider !== "chrome") return
    let active = true
    const adapter = resolveTranslateProvider(item, config)
    providerRef.current = adapter
    void adapter
      .availability({ from: source, to: target })
      .then((value) => {
        if (active) setAvailability(value)
      })
      .catch(() => {
        if (active) setAvailability("unsupported")
      })
    return () => {
      active = false
    }
  }, [config, item, provider, source, target, view])

  const autoSupported = provider !== "chrome" || chromeAutoSupported()
  const sameLanguage = source !== "auto" && source === target
  const networkReady =
    provider === "chrome" ||
    Boolean(
      validTranslateEndpoint(provider === "libre" ? libreHost : customUrl)
    )
  const showConfigPrompt = provider !== "chrome" && !networkReady
  const translateDisabled =
    busy ||
    downloading ||
    !input.trim() ||
    sameLanguage ||
    showConfigPrompt ||
    (provider === "chrome" && availability === "unsupported")

  function update(changes: TranslatePatch) {
    try {
      updateUtilityWidget(item.id, (live) =>
        live.kind === "translate" ? { ...live, ...changes } : live
      )
    } catch {
      /* The widget may have been removed while this panel was open. */
    }
  }

  function abort() {
    abortRef.current?.abort()
    abortRef.current = null
    requestRef.current += 1
    setBusy(false)
    setProgress(null)
  }

  function clearResult() {
    setOutput("")
    setDetected(null)
    setError(null)
    setProgress(null)
    lastTranslationRef.current = null
    failedTranslationRef.current = null
  }

  function changeInput(value: string) {
    inputRef.current = value
    setInput(value)
    if (!value.trim() || sameLanguage) {
      abort()
      clearResult()
    }
  }

  function changeProvider(next: TranslateProviderId) {
    abort()
    clearResult()
    setAvailability(null)
    providerRef.current?.dispose?.()
    providerRef.current = null
    if (
      next === "chrome" &&
      item.sourceLang === "auto" &&
      !chromeAutoSupported()
    )
      update({
        provider: next,
        sourceLang: fallbackSourceLanguage(item.targetLang),
      })
    else update({ provider: next })
  }

  function changeSource(next: string) {
    abort()
    clearResult()
    update({ sourceLang: next })
  }

  function changeTarget(next: string) {
    abort()
    clearResult()
    update({ targetLang: next })
  }

  function openConfig() {
    abort()
    clearResult()
    setView("config")
  }

  function closeConfig() {
    abort()
    clearResult()
    setView("translator")
    setAvailability(null)
  }

  async function runTranslation(trigger: Trigger) {
    const text = inputRef.current
    if (!text.trim() || sameLanguage) {
      abort()
      clearResult()
      return
    }
    const signature = `${provider}\u0000${source}\u0000${target}\u0000${text}`
    const request = ++requestRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    setProgress(null)
    if (trigger === "manual") {
      lastTranslationRef.current = null
      failedTranslationRef.current = null
      setOutput("")
      setDetected(null)
    }
    try {
      const adapter = resolveTranslateProvider(item, config)
      providerRef.current = adapter
      if (adapter.id !== "chrome") {
        const origin = translateProviderOrigin(item, config)
        if (!origin) throw new TranslateError("notConfigured")
        if (trigger === "manual") {
          if (!(await requestWidgetOrigin(origin)))
            throw new TranslateError("permissionDenied")
        } else if (!(await hasWidgetOrigin(origin))) {
          failedTranslationRef.current = signature
          return
        }
        controller.signal.throwIfAborted()
      } else if (trigger === "auto" && availability !== "available") {
        failedTranslationRef.current = signature
        return
      }
      const result = await adapter.translate({
        texts: [text],
        from: source,
        to: target,
        signal: controller.signal,
        onProgress:
          trigger === "manual"
            ? (value) => {
                if (requestRef.current === request) setProgress(value)
              }
            : undefined,
        allowDownload: trigger === "manual",
      })
      if (
        requestRef.current !== request ||
        controller.signal.aborted ||
        inputRef.current !== text
      )
        return
      const translated = result.texts[0]
      if (typeof translated !== "string")
        throw new TranslateError("invalidResponse")
      setOutput(translated)
      setDetected(result.detected ?? null)
      setError(null)
      lastTranslationRef.current = signature
      failedTranslationRef.current = null
      if (adapter.id === "chrome") setAvailability("available")
    } catch (cause) {
      if (
        requestRef.current !== request ||
        controller.signal.aborted ||
        inputRef.current !== text
      )
        return
      failedTranslationRef.current = signature
      if (cause instanceof DOMException && cause.name === "AbortError") return
      const code =
        cause instanceof TranslateError ? cause.code : "requestFailed"
      if (
        trigger === "auto" &&
        (code === "notConfigured" ||
          code === "permissionDenied" ||
          code === "modelMissing" ||
          code === "unsupportedPair" ||
          code === "emptyInput")
      )
        return
      setError(code)
      setOutput("")
      setDetected(null)
    } finally {
      if (requestRef.current === request) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  async function downloadModel() {
    if (busy || downloading) return
    const adapter = resolveTranslateProvider(item, config)
    providerRef.current = adapter
    if (!adapter.prepare) return
    setDownloading(true)
    setError(null)
    setProgress(0)
    try {
      await adapter.prepare({ from: source, to: target }, setProgress)
      setAvailability("available")
    } catch (cause) {
      setError(cause instanceof TranslateError ? cause.code : "requestFailed")
    } finally {
      setDownloading(false)
      setProgress(null)
    }
  }

  async function copy() {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      toast(t("grid.translate.copied"), "success")
    } catch {
      toast(t("grid.translate.copyFailed"), "error")
    }
  }

  function swap() {
    const detectedCanonical = canonicalLanguage(detected)
    if (source === "auto" && !detectedCanonical) return
    const nextSource = target
    const nextTarget = source === "auto" ? detectedCanonical! : source
    update({ sourceLang: nextSource, targetLang: nextTarget })
    failedTranslationRef.current = null
    if (!output) {
      setDetected(null)
      setError(null)
      return
    }
    const nextInput = output
    const nextOutput = input
    changeInput(nextInput)
    setOutput(nextOutput)
    setDetected(null)
    setError(null)
    lastTranslationRef.current = `${provider}\u0000${nextSource}\u0000${nextTarget}\u0000${nextInput}`
  }

  const runRef = useRef(runTranslation)
  useEffect(() => {
    runRef.current = runTranslation
  })
  useEffect(() => {
    if (!item.autoTranslate || view !== "translator") return
    if (busy || !input.trim() || sameLanguage) return
    if (provider === "chrome" && availability !== "available") return
    const signature = `${provider}\u0000${source}\u0000${target}\u0000${input}`
    if (
      lastTranslationRef.current === signature ||
      failedTranslationRef.current === signature
    )
      return
    const timer = window.setTimeout(() => {
      void runRef.current("auto")
    }, 600)
    return () => window.clearTimeout(timer)
  }, [
    availability,
    busy,
    input,
    item.autoTranslate,
    provider,
    sameLanguage,
    source,
    target,
    view,
  ])

  const providerNames = useMemo<Record<TranslateProviderId, string>>(
    () => ({
      chrome: t("grid.translate.providers.chrome"),
      libre: t("grid.translate.providers.libre"),
      custom: t("grid.translate.providers.custom"),
    }),
    [t]
  )
  const languageGroups = useMemo(() => {
    const sorted = sortedTranslateLanguages(i18n.language)
    const common = new Set<string>(commonTranslateLanguages)
    return {
      common: commonTranslateLanguages.filter((language) =>
        sorted.includes(language)
      ),
      all: sorted.filter((language) => !common.has(language)),
    }
  }, [i18n.language])
  const sourceLabel =
    source === "auto"
      ? t("grid.translate.autoDetect")
      : languageName(source, i18n.language)
  const targetLabel = languageName(target, i18n.language)
  const detectedLabel = detected ? languageName(detected, i18n.language) : null
  const needsDownload =
    provider === "chrome" &&
    (availability === "downloadable" ||
      availability === "downloading" ||
      error === "modelMissing" ||
      downloading)
  const actionLabel =
    error === "notConfigured" || error === "authFailed"
      ? t("grid.translate.configure")
      : error === "permissionDenied"
        ? t("grid.translate.grantAccess")
        : error === "modelMissing" && provider === "chrome"
          ? t("grid.translate.download")
          : error &&
              [
                "quotaExceeded",
                "rateLimited",
                "requestFailed",
                "responseTooLarge",
                "invalidResponse",
              ].includes(error)
            ? t("grid.translate.retry")
            : null

  function handleErrorAction() {
    if (error === "notConfigured" || error === "authFailed") openConfig()
    else if (error === "modelMissing" && provider === "chrome")
      void downloadModel()
    else void runTranslation("manual")
  }

  const idleHint =
    provider === "chrome" && availability === "unsupported"
      ? t("grid.translate.chromeUnavailable")
      : t("grid.translate.emptyHint")

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton
        initialFocus={sourceRef}
        className="translate-dialog w-full gap-0 p-4 sm:p-5"
        style={{ maxWidth: "min(880px, calc(100vw - 2rem))" }}
        onPointerDown={(event) => {
          // The panel is a React portal over a draggable grid item: synthetic
          // pointer and mouse events bubble through the component tree and
          // would arm the tile's drag underneath. Swallow both at the root.
          event.stopPropagation()
        }}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <DialogDescription className="sr-only">
            {t(
              view === "config"
                ? "grid.translate.configDescription"
                : "grid.translate.description"
            )}
          </DialogDescription>
          <header className="flex min-h-8 flex-wrap items-center gap-2 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base font-medium">
              <TranslateIcon
                size={18}
                className="text-muted-foreground"
                aria-hidden="true"
              />
              {t(
                view === "config"
                  ? "grid.translate.configTitle"
                  : "grid.translate.title"
              )}
            </DialogTitle>
            {view === "translator" && (
              <div className="ml-auto min-w-0">
                <Select
                  value={provider as string}
                  onValueChange={(value) => {
                    if (value === CONFIGURE_VALUE) {
                      openConfig()
                      return
                    }
                    if (isTranslateProviderId(value)) changeProvider(value)
                  }}
                >
                  <SelectTrigger
                    size="default"
                    className="max-w-[min(16rem,45vw)]"
                    aria-label={t("grid.translate.provider")}
                  >
                    <SelectValue>{providerNames[provider]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="chrome">
                      {t("grid.translate.providers.chrome")}
                    </SelectItem>
                    <SelectItem value="libre">
                      {t("grid.translate.providers.libre")}
                    </SelectItem>
                    <SelectItem value="custom">
                      {t("grid.translate.providers.custom")}
                    </SelectItem>
                    <SelectSeparator />
                    <SelectItem value={CONFIGURE_VALUE}>
                      <GearSix size={14} />
                      {t("grid.translate.configureProviders")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </header>

          {view === "config" ? (
            <TranslateConfigView
              provider={provider}
              onBack={closeConfig}
              onSaved={closeConfig}
            />
          ) : (
            <>
              <div className="translate-body">
                <section
                  className="translate-pane"
                  aria-label={t("grid.translate.source")}
                >
                  <div className="translate-pane-header">
                    <label
                      htmlFor={sourceId}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {t("grid.translate.source")}
                    </label>
                    <Select
                      value={source}
                      onValueChange={(value) => {
                        if (value === "auto" || isTranslateLanguage(value))
                          changeSource(value)
                      }}
                    >
                      <SelectTrigger
                        size="default"
                        className="min-w-0 flex-1"
                        aria-label={t("grid.translate.sourceLanguage")}
                      >
                        <SelectValue>{sourceLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="auto" disabled={!autoSupported}>
                          {t("grid.translate.autoDetect")}
                        </SelectItem>
                        <SelectGroup>
                          <SelectLabel>
                            {t("grid.translate.commonLanguages")}
                          </SelectLabel>
                          {languageGroups.common.map((language) => (
                            <SelectItem key={language} value={language}>
                              {languageName(language, i18n.language)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>
                            {t("grid.translate.allLanguages")}
                          </SelectLabel>
                          {languageGroups.all.map((language) => (
                            <SelectItem key={language} value={language}>
                              {languageName(language, i18n.language)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <textarea
                    ref={sourceRef}
                    id={sourceId}
                    dir="auto"
                    aria-describedby="translate-character-count"
                    className="translate-textarea"
                    maxLength={TRANSLATE_MAX_CHARS}
                    placeholder={t("grid.translate.sourcePlaceholder")}
                    spellCheck={false}
                    value={input}
                    onChange={(event) => changeInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault()
                        void runTranslation("manual")
                      }
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 px-1 text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label={t("grid.translate.clearSource")}
                      disabled={!input}
                      onClick={() => {
                        changeInput("")
                        sourceRef.current?.focus()
                      }}
                    >
                      {t("grid.translate.clear")}
                    </Button>
                    <span
                      id="translate-character-count"
                      className="text-right text-[11px] leading-none text-muted-foreground"
                    >
                      {t("grid.translate.characterCount", {
                        count: input.length.toLocaleString(),
                        max: TRANSLATE_MAX_CHARS.toLocaleString(),
                      })}
                    </span>
                  </div>
                </section>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="translate-swap"
                  aria-label={t("grid.translate.swap")}
                  title={t("grid.translate.swap")}
                  disabled={source === "auto" && !canonicalLanguage(detected)}
                  onClick={swap}
                >
                  <ArrowsLeftRight size={16} />
                </Button>

                <section
                  className="translate-pane"
                  aria-label={t("grid.translate.target")}
                >
                  <div className="translate-pane-header">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t("grid.translate.target")}
                    </span>
                    <Select
                      value={target}
                      onValueChange={(value) => {
                        if (isTranslateLanguage(value)) changeTarget(value)
                      }}
                    >
                      <SelectTrigger
                        size="default"
                        className="min-w-0 flex-1"
                        aria-label={t("grid.translate.targetLanguage")}
                      >
                        <SelectValue>{targetLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectGroup>
                          <SelectLabel>
                            {t("grid.translate.commonLanguages")}
                          </SelectLabel>
                          {languageGroups.common.map((language) => (
                            <SelectItem key={language} value={language}>
                              {languageName(language, i18n.language)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>
                            {t("grid.translate.allLanguages")}
                          </SelectLabel>
                          {languageGroups.all.map((language) => (
                            <SelectItem key={language} value={language}>
                              {languageName(language, i18n.language)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={t("grid.translate.copy")}
                      title={t("grid.translate.copy")}
                      disabled={!output}
                      onClick={() => void copy()}
                    >
                      <Copy size={15} />
                    </Button>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col">
                    {busy ? (
                      <div className="translate-status" role="status">
                        <span className="flex items-center gap-2">
                          <CircleNotch
                            size={15}
                            className="animate-spin"
                            aria-hidden="true"
                          />
                          {progress === null
                            ? t("grid.translate.translating")
                            : t("grid.translate.downloading", {
                                progress: Math.round(progress * 100),
                              })}
                        </span>
                        {progress !== null && (
                          <div
                            className="translate-progress"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(progress * 100)}
                          >
                            <span
                              style={{
                                width: `${Math.round(progress * 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ) : error ? (
                      <div className="translate-error" role="alert">
                        <WarningCircle
                          size={16}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                        <span>{t(`grid.translate.errors.${error}`)}</span>
                        {actionLabel && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleErrorAction}
                          >
                            {actionLabel}
                          </Button>
                        )}
                      </div>
                    ) : output ? (
                      <>
                        <div
                          className="translate-result"
                          dir="auto"
                          aria-live="polite"
                        >
                          {output}
                        </div>
                        {detectedLabel && (
                          <p className="translate-detected">
                            {t("grid.translate.detected", {
                              language: detectedLabel,
                            })}
                          </p>
                        )}
                      </>
                    ) : showConfigPrompt ? (
                      <div className="translate-message">
                        <span>{t("grid.translate.errors.notConfigured")}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={openConfig}
                        >
                          {t("grid.translate.configure")}
                        </Button>
                      </div>
                    ) : (
                      <div className="translate-message">{idleHint}</div>
                    )}
                    {needsDownload && !error && !busy && (
                      <div className="translate-status border-t border-border">
                        <span className="flex items-start gap-2">
                          <DownloadSimple
                            size={15}
                            className="mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          {t("grid.translate.downloadHint")}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={downloading}
                          onClick={() => void downloadModel()}
                        >
                          {downloading
                            ? t("grid.translate.downloading", {
                                progress: Math.round((progress ?? 0) * 100),
                              })
                            : t("grid.translate.download")}
                        </Button>
                        {progress !== null && (
                          <div
                            className="translate-progress"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(progress * 100)}
                          >
                            <span
                              style={{
                                width: `${Math.round(progress * 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <footer className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={autoId}
                      checked={item.autoTranslate ?? false}
                      aria-label={t("grid.translate.autoTranslate")}
                      onCheckedChange={(checked) => {
                        if (!checked) abort()
                        update({ autoTranslate: checked })
                      }}
                    />
                    <label
                      htmlFor={autoId}
                      className="text-xs text-muted-foreground"
                    >
                      {t("grid.translate.autoTranslate")}
                    </label>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    className="ml-auto shrink-0"
                    disabled={translateDisabled}
                    onClick={() => void runTranslation("manual")}
                  >
                    {busy ? (
                      <CircleNotch
                        size={15}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <TranslateIcon size={15} aria-hidden="true" />
                    )}
                    {busy
                      ? t("grid.translate.translating")
                      : t("grid.translate.translate")}
                  </Button>
                </div>
                {sameLanguage && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("grid.translate.sameLanguageHint")}
                  </p>
                )}
              </footer>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
