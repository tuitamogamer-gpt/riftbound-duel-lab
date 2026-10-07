import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Download,
  FileUp,
  History,
  Save,
  TriangleAlert,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { SessionStorageController } from "../hooks/useSessionStorage";
import type { SavedSession } from "../persistence";
import type { Phase } from "../game/types";
import {
  exportSessionText,
  importSessionText,
  MAX_SESSION_FILE_BYTES,
  sessionCompatibility,
  type ImportSessionResult,
  type SessionCompatibility,
} from "../session-storage";
import "./SessionManager.css";

const statusMessages = {
  saved: "Saved on this device",
  failed: "Save failed",
  unavailable: "Saving unavailable",
  empty: "No saved duel",
} as const;
const phaseLabels: Record<Phase, string> = {
  mulligan: "Početna ruka",
  main: "Glavna faza",
  showdown: "Showdown · reakcije",
  move: "Priprema pokreta",
  damage: "Dodjela štete",
  choice: "Odaberi efekat",
  ended: "Kraj meča",
};

export function SessionStatus({
  controller,
}: {
  controller: SessionStorageController;
}) {
  const { t } = useI18n();
  const failed =
    controller.status === "failed" || controller.status === "unavailable";
  return (
    <span
      className={`session-save-status ${failed ? "failed" : ""}`}
      role="status"
    >
      {failed ? (
        <TriangleAlert size={14} />
      ) : controller.status === "empty" ? (
        <Save size={14} />
      ) : (
        <Check size={14} />
      )}
      {t(statusMessages[controller.status])}
    </span>
  );
}

export interface SessionManagerProps {
  controller: SessionStorageController;
  session: SavedSession;
  onRestore: (session: SavedSession) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function SessionManager({
  controller,
  session,
  onRestore,
  open,
  onOpenChange,
  hideTrigger = false,
}: SessionManagerProps) {
  const { t } = useI18n();
  const [localOpen, setLocalOpen] = useState(false);
  const shown = open ?? localOpen;
  const change = (next: boolean) => {
    setLocalOpen(next);
    onOpenChange?.(next);
  };
  return (
    <>
      {!hideTrigger && (
        <button
          className="session-manager-trigger outline-button"
          onClick={() => change(true)}
        >
          <Save size={16} />
          {t("Saved duels")}
          <SessionStatus controller={controller} />
        </button>
      )}
      {shown &&
        typeof document !== "undefined" &&
        createPortal(
          <SessionDialog
            controller={controller}
            session={session.match ? session : controller.initialRead.session}
            onRestore={(value) => {
              onRestore({ ...value, paused: true });
              change(false);
            }}
            close={() => change(false)}
          />,
          document.body,
        )}
    </>
  );
}

function CompatibilityNotice({ value }: { value: SessionCompatibility }) {
  const { t } = useI18n();
  if (!value.legacy && !value.rulesChanged && !value.catalogChanged)
    return null;
  return (
    <div className="session-notice">
      {value.legacy && (
        <p>
          {t(
            "This older save has no rules or card catalog version. Resume uses the current rules.",
          )}
        </p>
      )}
      {value.rulesChanged && (
        <p>
          {t(
            "The rules have changed since this duel was saved. Resume uses the current rules.",
          )}
        </p>
      )}
      {value.catalogChanged && (
        <p>
          {t(
            "The card catalog has changed since this duel was saved. Resume uses the current card text.",
          )}
        </p>
      )}
    </div>
  );
}

function SessionDialog({
  controller,
  session,
  onRestore,
  close,
}: Omit<SessionManagerProps, "open" | "onOpenChange" | "hideTrigger"> & {
  close: () => void;
}) {
  const { t, locale } = useI18n();
  const panel = useDialogFocus(close);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [imported, setImported] = useState<ImportSessionResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      request.current++;
      document.body.style.overflow = overflow;
    };
  }, []);
  const date = (time: number) =>
    new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(time);
  return (
    <div className="modal-backdrop session-manager-backdrop" onClick={close}>
      <section
        className="session-manager"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-manager-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Save size={20} />
            <h2 id="session-manager-title">{t("Saved duels")}</h2>
          </div>
          <button onClick={close} aria-label={t("Zatvori")}>
            <X size={20} />
          </button>
        </header>
        <SessionStatus controller={controller} />
        <p className="session-manager-intro">
          {t(
            "Keep a duel on this device, export it, or resume a recovery position.",
          )}
        </p>
        {controller.status === "failed" && (
          <p className="session-notice error" role="alert">
            {t(
              "This move could not be saved. The previous save is intact. Export the duel or try again.",
            )}
          </p>
        )}
        {controller.status === "unavailable" && (
          <p className="session-notice error" role="alert">
            {t(
              "This browser cannot save the duel. You can continue playing and export a file.",
            )}
          </p>
        )}
        {controller.backupFailed && (
          <p className="session-notice">
            {t(
              "The duel is saved, but a recovery position could not be stored.",
            )}
          </p>
        )}
        {controller.initialRead.source === "backup" && (
          <p className="session-notice">
            {t("The previous save was recovered from a backup position.")}
          </p>
        )}
        {controller.initialRead.damagedSave &&
          controller.initialRead.source !== "backup" && (
            <p className="session-notice">
              {t(
                "The previous save could not be read. Import a duel file to restore it.",
              )}
            </p>
          )}
        <CompatibilityNotice value={controller.compatibility} />
        <div className="session-manager-actions">
          <button
            disabled={!session.match}
            onClick={() => {
              setExportError("");
              try {
                const raw = exportSessionText(session);
                const url = URL.createObjectURL(
                  new Blob([raw], { type: "application/json" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = `riftbound-duel-${session.match?.seed}-${session.match?.revision ?? 0}.json`;
                link.click();
                // Keep the URL until the browser has started the download.
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch {
                setExportError(
                  "This duel could not be exported. Try again after the current event finishes.",
                );
              }
            }}
          >
            <Download size={17} />
            {t("Export duel")}
          </button>
          <button disabled={reading} onClick={() => input.current?.click()}>
            <FileUp size={17} />
            {t(reading ? "Reading duel…" : "Import duel")}
          </button>
          {session.match && controller.status !== "saved" && (
            <button onClick={controller.retry}>
              <Save size={17} />
              {t("Try saving again")}
            </button>
          )}
        </div>
        {exportError && (
          <p className="session-notice error" role="alert">
            {t(exportError)}
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="session-file-input"
          aria-label={t("Select a saved duel file")}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const currentRequest = ++request.current;
            setImported(null);
            setFileError("");
            setFileName(file.name);
            setReading(false);
            if (file.size > MAX_SESSION_FILE_BYTES) {
              setFileError(
                "The duel file is too large. The maximum size is 2 MB.",
              );
              return;
            }
            setReading(true);
            try {
              const result = importSessionText(await file.text());
              if (request.current !== currentRequest) return;
              setImported(result);
              if (!result.ok)
                setFileError(
                  result.error === "version"
                    ? "This duel file uses a newer save version. Update the app to open it."
                    : result.error === "too-large"
                      ? "The duel file is too large. The maximum size is 2 MB."
                      : "This file does not contain a valid Riftbound duel.",
                );
            } catch {
              if (request.current === currentRequest)
                setFileError(
                  "The duel file could not be read. Select another file.",
                );
            } finally {
              if (request.current === currentRequest) setReading(false);
            }
          }}
        />
        {fileError && (
          <p className="session-notice error" role="alert">
            {t(fileError)}
          </p>
        )}
        {imported?.ok && (
          <div className="session-import-preview">
            <strong>{fileName}</strong>
            <span>
              {t("Turn {turn} · {phase}", {
                turn: imported.session.match?.turn ?? 0,
                phase: t(phaseLabels[imported.session.match!.phase]),
              })}
            </span>
            <CompatibilityNotice value={imported.compatibility} />
            <button onClick={() => onRestore(imported.session)}>
              {t("Resume imported duel")}
            </button>
          </div>
        )}
        <section
          className="session-recovery"
          aria-labelledby="session-recovery-title"
        >
          <h3 id="session-recovery-title">
            <History size={17} />
            {t("Recovery positions")}
          </h3>
          <p>
            {t(
              "Up to 3 previous moves are kept. Recovery opens the completed position with playback paused.",
            )}
          </p>
          {controller.backups.length === 0 && (
            <p>{t("Recovery positions appear after you make a move.")}</p>
          )}
          <div className="session-recovery-list">
            {controller.backups.map((snapshot) => (
              <div className="session-recovery-item" key={snapshot.id}>
                <div>
                  <strong>
                    {t("Turn {turn} · {phase}", {
                      turn: snapshot.session.match?.turn ?? 0,
                      phase: t(phaseLabels[snapshot.session.match!.phase]),
                    })}
                  </strong>
                  <span>{date(snapshot.savedAt)}</span>
                  <CompatibilityNotice
                    value={sessionCompatibility(snapshot.session)}
                  />
                </div>
                <button onClick={() => onRestore(snapshot.session)}>
                  {t("Resume position")}
                </button>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
