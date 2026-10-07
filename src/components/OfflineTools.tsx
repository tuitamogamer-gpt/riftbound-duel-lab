import { useEffect, useRef, useState } from "react";
import { Download, Smartphone, WifiOff } from "lucide-react";
import { useI18n } from "../i18n";
import { cardsById } from "../data/cards";
import { cardArtUrl } from "../data/art";
import type { StarterDeck } from "../data/decks";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface CacheProgress {
  cached: number;
  failed: number;
  total: number;
  done: boolean;
  error?: string;
}

export function OfflineTools({
  decks,
}: {
  decks: (StarterDeck | undefined)[];
}) {
  const { t } = useI18n();
  const prompt = useRef<InstallPrompt | null>(null);
  const channel = useRef<MessagePort | null>(null);
  const watchdog = useRef<number | undefined>(undefined);
  const [instructions, setInstructions] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [offline, setOffline] = useState(false);
  const [progress, setProgress] = useState<CacheProgress | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const install = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
    };
    const status = () => setOffline(!navigator.onLine);
    const complete = () => {
      setInstalled(true);
      prompt.current = null;
    };
    status();
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", complete);
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    return () => {
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", complete);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
      channel.current?.close();
      window.clearTimeout(watchdog.current);
    };
  }, []);
  const install = async () => {
    if (!prompt.current) {
      setInstructions((value) => !value);
      return;
    }
    try {
      await prompt.current.prompt();
      const choice = await prompt.current.userChoice;
      if (choice.outcome === "accepted") setInstructions(false);
      prompt.current = null;
    } catch {
      setInstructions(true);
    }
  };
  const download = async () => {
    setError("");
    if (!("serviceWorker" in navigator)) {
      setError("Offline downloads are unavailable in this browser.");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration?.active) {
        setError("Offline setup is still loading. Try again shortly.");
        return;
      }
      const ids = decks.flatMap((deck) =>
        deck
          ? [
              deck.legendId,
              deck.championId,
              ...(deck.battlefieldIds || [deck.battlefieldId]),
              ...deck.main.map((entry) => entry.cardId),
              ...(deck.sideboard ?? []).map((entry) => entry.cardId),
              ...deck.runes.map((entry) => entry.cardId),
            ]
          : [],
      );
      const urls = [
        ...new Set(
          ids
            .map((id) => cardsById[id])
            .filter(Boolean)
            .map(cardArtUrl),
        ),
      ];
      if (!urls.length) return;
      const pair = new MessageChannel();
      channel.current?.close();
      channel.current = pair.port1;
      setProgress({ cached: 0, failed: 0, total: urls.length, done: false });
      const armWatchdog = () => {
        window.clearTimeout(watchdog.current);
        watchdog.current = window.setTimeout(() => {
          pair.port1.close();
          setProgress(null);
          setError(
            "Deck download failed. Check your connection and available storage.",
          );
        }, 45000);
      };
      armWatchdog();
      pair.port1.onmessage = (event: MessageEvent<CacheProgress>) => {
        setProgress(event.data);
        if (event.data.error) setError(event.data.error);
        if (event.data.done) {
          window.clearTimeout(watchdog.current);
          pair.port1.close();
        } else armWatchdog();
      };
      registration.active.postMessage({ type: "CACHE_DECK", urls }, [
        pair.port2,
      ]);
    } catch {
      window.clearTimeout(watchdog.current);
      setError(
        "Deck download failed. Check your connection and available storage.",
      );
      setProgress(null);
    }
  };
  return (
    <div className="offline-tools">
      <div className="product-tools">
        {!installed && (
          <button className="outline-button" onClick={install}>
            <Smartphone size={16} />
            {t("Install app")}
          </button>
        )}
        <button
          className="outline-button"
          disabled={Boolean(progress && !progress.done) || offline}
          onClick={download}
        >
          <Download size={16} />
          {t("Download selected decks")}
        </button>
      </div>
      {offline && (
        <p role="status">
          <WifiOff size={15} />
          {t("Offline practice is available. Private duels need a connection.")}
        </p>
      )}
      {instructions && (
        <p>
          {t(
            "Open your browser menu and choose Install app or Add to Home Screen. On iPhone, use Share → Add to Home Screen.",
          )}
        </p>
      )}
      {progress && (
        <p role="status">
          {progress.done
            ? t("{cached} deck images ready offline · {failed} unavailable", {
                cached: progress.cached,
                failed: progress.failed,
              })
            : t("Downloading deck images: {cached}/{total}", {
                cached: progress.cached,
                total: progress.total,
              })}
        </p>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}
