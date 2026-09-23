"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { fmtWhen } from "@/lib/format";
import {
  collectProblem,
  confirmCollect,
  confirmReturn,
  returnCondition,
  returnProblem,
  startCollect,
  startReturn,
  tagsOnLoan,
  type Collection,
  type KioskResult,
  type ReturnStart,
} from "./actions";

export type KioskNode = {
  id: string;
  name: string;
  place: string;
  battery_backup_ok: boolean;
  online: boolean;
  compartments: { number: number; size: "S" | "M" | "L" }[];
};

// Every screen the kiosk can show.
type Screen =
  | { kind: "idle" }
  | { kind: "collect-id"; pin: boolean }
  | { kind: "collect-open"; res: Collection; note?: string }
  | { kind: "collect-done"; item: string; dueAt: string; holiday: string | null }
  | { kind: "collect-stopped"; item: string; workOrder: string }
  | { kind: "return-id" }
  | { kind: "return-open"; ret: ReturnStart; note?: string }
  | { kind: "return-stopped"; workOrder: string }
  | { kind: "return-condition"; ret: ReturnStart; overdue: boolean; serviceDue: boolean; faultOpen: boolean }
  | { kind: "return-done"; item: string; workOrder: string | null; overdue: boolean; serviceDue: boolean; faultOpen: boolean };

const IDLE_AFTER = 20; // seconds without a tap before going back to the start

export default function Kiosk({
  node,
  cards,
  startMode,
  startTag,
}: {
  node: KioskNode;
  cards: { card_uid: string; label: string }[];
  startMode: "collect" | "return" | null;
  startTag: string;
}) {
  const [screen, setScreen] = useState<Screen>(
    startMode === "collect" ? { kind: "collect-id", pin: false } : startMode === "return" ? { kind: "return-id" } : { kind: "idle" },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  // Form fields
  const [card, setCard] = useState(cards[0]?.card_uid ?? "");
  const [pin, setPin] = useState("");
  const [tag, setTag] = useState(startTag);
  const [tags, setTags] = useState<{ tag: string; item_name: string }[]>([]);

  const go = useCallback((next: Screen) => {
    setError(null);
    setScreen(next);
  }, []);

  // Run a kiosk action; show its message if it fails.
  function run<T>(action: () => Promise<KioskResult<T>>, onOk: (data: T) => void) {
    setError(null);
    startBusy(async () => {
      const result = await action();
      if (result.ok) onOk(result.data);
      else setError(result.error);
    });
  }

  // ---- Back to the start after 20 seconds without a tap ----
  const idle = screen.kind === "idle";
  const lastTouch = useRef(0);
  const counting = useRef(false); // true while a timeout should apply
  useEffect(() => {
    counting.current = !idle && !busy;
  }, [idle, busy]);
  const [secondsLeft, setSecondsLeft] = useState(IDLE_AFTER);
  useEffect(() => {
    lastTouch.current = Date.now();
    const touch = () => {
      lastTouch.current = Date.now();
      setSecondsLeft(IDLE_AFTER);
    };
    const events = ["pointerdown", "keydown", "input"] as const;
    events.forEach((e) => window.addEventListener(e, touch));
    const timer = setInterval(() => {
      const left = Math.max(0, IDLE_AFTER - Math.floor((Date.now() - lastTouch.current) / 1000));
      setSecondsLeft(left);
      if (left === 0 && counting.current) {
        lastTouch.current = Date.now();
        setPin("");
        setTag("");
        setError(null);
        setScreen({ kind: "idle" });
      }
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(timer);
    };
  }, []);

  // Load the demo list of tags out on loan when return mode opens.
  const returnId = screen.kind === "return-id";
  useEffect(() => {
    if (!returnId) return;
    tagsOnLoan().then((r) => r.ok && setTags(r.data));
  }, [returnId]);

  // Move keyboard focus to the new screen's heading, so screen readers announce it.
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [screen]);

  const openNumber =
    screen.kind === "collect-open" ? screen.res.compartment : screen.kind === "return-open" ? screen.ret.compartment : null;

  return (
    <div className="min-h-dvh bg-kiosk text-[#EAF0F4]">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-[#2A3947] px-5 py-3 md:px-8">
        <p>
          <b className="text-[1.15em] text-white">{node.name}</b>
          <span className="text-[#9FB0BF]"> · {node.place}</span>
        </p>
        <p className={`text-[0.9em] ${node.battery_backup_ok ? "text-[#9FE3C9]" : "font-bold text-[#FFC98A]"}`}>
          {node.battery_backup_ok ? "Battery backup ready" : "Battery backup not ready: doors may not open in a power cut"}
        </p>
      </header>

      <div className="grid gap-6 px-5 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <main className="max-w-xl" aria-busy={busy}>
          {!node.online ? (
            <h1 className="text-[1.5em] font-bold text-white">This locker is offline. Please use another locker.</h1>
          ) : (
            <Screens
              screen={screen}
              go={go}
              run={run}
              busy={busy}
              heading={heading}
              node={node}
              cards={cards}
              card={card}
              setCard={setCard}
              pin={pin}
              setPin={setPin}
              tag={tag}
              setTag={setTag}
              tags={tags}
            />
          )}

          <div aria-live="assertive">
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-[#4A2219] px-3.5 py-3 text-[#FFD2C7]">
                {error}
              </p>
            )}
          </div>
          {!idle && secondsLeft <= 5 && (
            <p role="status" className="mt-4 text-[#FFC98A]">
              Going back to the start in {secondsLeft} s. Tap anywhere to stay.
            </p>
          )}
        </main>

        <section aria-label="Compartments">
          <p className="mb-2 text-[0.85em] text-[#9FB0BF]">
            {openNumber ? `Compartment ${openNumber} is open` : "All doors closed"}
          </p>
          <div aria-hidden="true" className="grid grid-cols-8 gap-1 sm:grid-cols-10">
            {node.compartments.map((c) => (
              <div
                key={c.number}
                className={`grid place-items-center rounded text-[0.7em] ${
                  c.size === "L" ? "aspect-[1/1.5]" : c.size === "M" ? "aspect-[1/1.2]" : "aspect-square"
                } ${
                  c.number === openNumber
                    ? "animate-pulse bg-teal font-bold text-(--on-teal) outline-3 outline-[#7FE3C2] motion-reduce:animate-none"
                    : "bg-[#2A3947] text-[#6D8193]"
                }`}
              >
                {c.number}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Heading({
  innerRef,
  children,
}: {
  innerRef: React.RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
}) {
  return (
    <h1 ref={innerRef} tabIndex={-1} className="mb-2 text-[1.5em] font-bold text-white outline-none">
      {children}
    </h1>
  );
}

const kbtn = "block w-full rounded-xl p-3.5 font-bold mt-2.5 disabled:opacity-50";
const kPrimary = `${kbtn} bg-teal text-(--on-teal)`;
const kLight = `${kbtn} bg-[#EAF0F4] text-kiosk`;
const kGhost = "block w-full rounded-xl p-3.5 mt-2.5 border-[1.5px] border-[#3E5366] text-[#C9D6E1] disabled:opacity-50";
const kField =
  "w-full rounded-xl border-[1.5px] border-[#3E5366] bg-kiosk-2 px-3.5 py-3 text-white placeholder:text-[#6D8193]";

function Screens({
  screen,
  go,
  run,
  busy,
  heading,
  node,
  cards,
  card,
  setCard,
  pin,
  setPin,
  tag,
  setTag,
  tags,
}: {
  screen: Screen;
  go: (s: Screen) => void;
  run: <T>(action: () => Promise<KioskResult<T>>, onOk: (data: T) => void) => void;
  busy: boolean;
  heading: React.RefObject<HTMLHeadingElement | null>;
  node: KioskNode;
  cards: { card_uid: string; label: string }[];
  card: string;
  setCard: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  tag: string;
  setTag: (v: string) => void;
  tags: { tag: string; item_name: string }[];
}) {
  const restart = (
    <button type="button" className={kGhost} onClick={() => go({ kind: "idle" })}>
      Start again
    </button>
  );

  switch (screen.kind) {
    case "idle":
      return (
        <>
          <Heading innerRef={heading}>Welcome to {node.name}</Heading>
          <p className="mb-2 text-[#C9D6E1]">Collect something you reserved, or return an item to any locker.</p>
          <button type="button" className={kPrimary} onClick={() => go({ kind: "collect-id", pin: false })}>
            Collect a reservation
          </button>
          <button type="button" className={kLight} onClick={() => go({ kind: "return-id" })}>
            Return an item
          </button>
          <p className="mt-6 text-[0.85em] text-[#9FB0BF]">
            Demo: this screen stands in for the locker&apos;s touchscreen.{" "}
            <Link href="/" className="underline">
              Back to the student app
            </Link>
          </p>
        </>
      );

    case "collect-id":
      return (
        <>
          <Heading innerRef={heading}>Collect your reservation</Heading>
          {!screen.pin ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => startCollect(node.id, card, null), (res) => go({ kind: "collect-open", res }));
              }}
            >
              <div className="my-4 grid place-items-center gap-3 rounded-2xl border-2 border-dashed border-[#3E5366] bg-kiosk-2 px-4 py-6">
                <svg viewBox="0 0 24 24" className="size-14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <rect x="3" y="6" width="13" height="9" rx="1.5" />
                  <path d="M18 8.5a4 4 0 0 1 0 5M20.5 6.5a7 7 0 0 1 0 9" />
                </svg>
                <p className="font-bold">Tap your student card on the reader</p>
                <label className="grid w-full max-w-xs gap-1 text-[0.85em] text-[#9FB0BF]">
                  Demo: which card to tap
                  <select className={kField} value={card} onChange={(e) => setCard(e.target.value)}>
                    {cards.map((c) => (
                      <option key={c.card_uid} value={c.card_uid}>
                        {c.card_uid} · {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className={`${kPrimary} max-w-xs`} disabled={busy || !card}>
                  {busy ? "Reading card…" : "Tap card"}
                </button>
              </div>
              <button type="button" className={kGhost} onClick={() => go({ kind: "collect-id", pin: true })}>
                Use backup PIN instead
              </button>
              {restart}
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^\d{4}$/.test(pin)) return run(async () => ({ ok: false, error: "Enter the 4-digit PIN from your phone." }), () => {});
                run(() => startCollect(node.id, null, pin), (res) => {
                  setPin("");
                  go({ kind: "collect-open", res });
                });
              }}
            >
              <label htmlFor="pin" className="mt-3 block">
                Enter the backup PIN shown on your phone
              </label>
              <input
                id="pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className={`${kField} mt-2 max-w-xs text-center text-[1.6em] tracking-[0.3em]`}
              />
              <button type="submit" className={`${kPrimary} max-w-xs`} disabled={busy}>
                {busy ? "Checking…" : "Open compartment"}
              </button>
              <button type="button" className={kGhost} onClick={() => go({ kind: "collect-id", pin: false })}>
                Tap my card instead
              </button>
              {restart}
            </form>
          )}
        </>
      );

    case "collect-open": {
      const { res } = screen;
      const problem = (reason: "door_did_not_open" | "wrong_item") =>
        run(
          () => collectProblem(res.reservation_id, reason),
          (r) =>
            r.moved && r.compartment
              ? go({
                  kind: "collect-open",
                  res: { ...res, compartment: r.compartment },
                  note: `Sorry about that. We've logged it as ${r.work_order}. Compartment ${r.compartment} is open instead.`,
                })
              : go({ kind: "collect-stopped", item: res.item_name, workOrder: r.work_order }),
        );
      return (
        <>
          <Heading innerRef={heading}>
            Hi {res.student}. Compartment {res.compartment} is open
          </Heading>
          {screen.note && <p className="mb-2 rounded-xl bg-kiosk-2 px-3.5 py-3 text-[#9FE3C9]">{screen.note}</p>}
          <p className="mb-2">Take your {res.item_name.toLowerCase()} and close the door.</p>
          <button
            type="button"
            className={kPrimary}
            disabled={busy}
            onClick={() =>
              run(
                () => confirmCollect(res.reservation_id),
                (r) => go({ kind: "collect-done", item: res.item_name, dueAt: r.due_at, holiday: r.holiday }),
              )
            }
          >
            I&apos;ve closed the door
          </button>
          <button type="button" className={kGhost} disabled={busy} onClick={() => problem("door_did_not_open")}>
            The door didn&apos;t open
          </button>
          <button type="button" className={kGhost} disabled={busy} onClick={() => problem("wrong_item")}>
            The wrong item is inside
          </button>
        </>
      );
    }

    case "collect-done":
      return (
        <>
          <Heading innerRef={heading}>Enjoy. It&apos;s yours until {fmtWhen(screen.dueAt)}</Heading>
          {screen.holiday && (
            <p className="mb-2 rounded-xl bg-[#3A2A12] px-3.5 py-3 text-[#FFE0B5]">
              <b>Due date moved.</b> It would have been due on {screen.holiday}, when no technicians are on campus, so
              it&apos;s due the next working morning instead.
            </p>
          )}
          <p className="mb-2">Your loan is in My loans on your phone. You can return it to any locker.</p>
          <button type="button" className={kPrimary} onClick={() => go({ kind: "idle" })}>
            Done
          </button>
        </>
      );

    case "collect-stopped":
      return (
        <>
          <Heading innerRef={heading}>Sorry, there&apos;s no other {screen.item.toLowerCase()} here</Heading>
          <p className="mb-2">
            We&apos;ve logged the problem as {screen.workOrder} and cancelled your reservation, so nothing is held
            against you. Reserve one at another locker on your phone.
          </p>
          <button type="button" className={kPrimary} onClick={() => go({ kind: "idle" })}>
            Done
          </button>
        </>
      );

    case "return-id":
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!tag.trim()) return run(async () => ({ ok: false, error: "Hold the item's tag to the reader first." }), () => {});
            run(() => startReturn(node.id, tag), (ret) => go({ kind: "return-open", ret }));
          }}
        >
          <Heading innerRef={heading}>Return an item</Heading>
          <div className="my-4 grid gap-3 rounded-2xl border-2 border-dashed border-[#3E5366] bg-kiosk-2 px-4 py-6">
            <p className="font-bold">Hold the item&apos;s tag to the reader</p>
            <label className="grid gap-1 text-[0.85em] text-[#9FB0BF]">
              Demo: the tag the reader sees (printed on the item, e.g. VC-0412)
              <input
                className={`${kField} uppercase`}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                autoComplete="off"
                list="tags-on-loan"
              />
            </label>
            <datalist id="tags-on-loan">
              {tags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.item_name}
                </option>
              ))}
            </datalist>
            <button type="submit" className={`${kPrimary} mt-0`} disabled={busy}>
              {busy ? "Reading tag…" : "Read tag"}
            </button>
          </div>
          {restart}
        </form>
      );

    case "return-open": {
      const { ret } = screen;
      return (
        <>
          <Heading innerRef={heading}>Compartment {ret.compartment} is open</Heading>
          {screen.note && <p className="mb-2 rounded-xl bg-kiosk-2 px-3.5 py-3 text-[#9FE3C9]">{screen.note}</p>}
          <p className="mb-2">
            Place the {ret.item_name.toLowerCase()} (tag {ret.tag}) inside and close the door.
          </p>
          <button
            type="button"
            className={kPrimary}
            disabled={busy}
            onClick={() =>
              run(
                () => confirmReturn(ret.loan_id, ret.compartment_id),
                (r) =>
                  go({ kind: "return-condition", ret, overdue: r.overdue, serviceDue: r.service_due, faultOpen: !!r.fault_open }),
              )
            }
          >
            I&apos;ve closed the door
          </button>
          <button
            type="button"
            className={kGhost}
            disabled={busy}
            onClick={() =>
              run(
                () => returnProblem(ret.loan_id, ret.compartment_id),
                (r) =>
                  r.moved && r.compartment_id && r.compartment
                    ? go({
                        kind: "return-open",
                        ret: { ...ret, compartment_id: r.compartment_id, compartment: r.compartment },
                        note: `Sorry about that. We've logged it as ${r.work_order}. Compartment ${r.compartment} is open instead.`,
                      })
                    : go({ kind: "return-stopped", workOrder: r.work_order }),
              )
            }
          >
            The door didn&apos;t open
          </button>
        </>
      );
    }

    case "return-stopped":
      return (
        <>
          <Heading innerRef={heading}>Sorry, no other compartment is free here</Heading>
          <p className="mb-2">
            We&apos;ve logged the door problem as {screen.workOrder}. Please return the item to another locker. It&apos;s
            still on loan to you until then.
          </p>
          <button type="button" className={kPrimary} onClick={() => go({ kind: "idle" })}>
            Done
          </button>
        </>
      );

    case "return-condition": {
      const { ret } = screen;
      const answer = (c: "good" | "minor" | "damaged") =>
        run(
          () => returnCondition(ret.loan_id, c),
          (r) =>
            go({
              kind: "return-done",
              item: ret.item_name,
              workOrder: r.work_order,
              overdue: screen.overdue,
              serviceDue: screen.serviceDue,
              faultOpen: screen.faultOpen,
            }),
        );
      return (
        <>
          <Heading innerRef={heading}>Returned: {ret.item_name}</Heading>
          <p className="mb-2 text-[#9FE3C9]">Tag {ret.tag} confirmed.</p>
          <p className="mb-1">How was it when you used it?</p>
          <button type="button" className={kLight} disabled={busy} onClick={() => answer("good")}>
            It worked fine
          </button>
          <button type="button" className={kGhost} disabled={busy} onClick={() => answer("minor")}>
            Minor problem
          </button>
          <button type="button" className={kGhost} disabled={busy} onClick={() => answer("damaged")}>
            It&apos;s damaged
          </button>
        </>
      );
    }

    case "return-done":
      return (
        <>
          <Heading innerRef={heading}>Returned. Thank you.</Heading>
          {screen.workOrder ? (
            <p className="mb-2">
              Thanks for telling us. We&apos;ve logged it as {screen.workOrder} and a technician will check it before
              it&apos;s lent again. You won&apos;t be charged for a fault you report.
            </p>
          ) : screen.faultOpen ? (
            <p className="mb-2">
              The loan is closed. There&apos;s a fault report open for this {screen.item.toLowerCase()}, so a technician
              will check it before it&apos;s lent again.
            </p>
          ) : screen.serviceDue ? (
            <p className="mb-2">
              The loan is closed. This {screen.item.toLowerCase()} is due for its routine service, so a technician will
              check it before it&apos;s lent again.
            </p>
          ) : (
            <p className="mb-2">The loan is closed and the {screen.item.toLowerCase()} is back in stock.</p>
          )}
          {screen.overdue && <p className="mb-2 text-[#FFC98A]">It was overdue. Thanks for bringing it back.</p>}
          <button type="button" className={kPrimary} onClick={() => go({ kind: "idle" })}>
            Done
          </button>
        </>
      );
  }
}
