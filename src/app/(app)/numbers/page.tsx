import Link from "next/link";
import { createBattleRoom, joinBattleRoom } from "@/lib/actions/battle";
import NumberPractice from "@/components/numbers/NumberPractice";
import SubmitButton from "@/components/ui/SubmitButton";
import BackButton from "@/components/ui/BackButton";

type Tab = "solo" | "multi";

/**
 * Number listening: a Japanese number is read out and you type it in. Solo
 * practice runs right here; multiplayer opens a battle room in numbers mode,
 * where the host picks the settings.
 */
export default async function NumbersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { tab: rawTab, error } = await searchParams;
  const tab: Tab = rawTab === "multi" ? "multi" : "solo";

  const header = (
    <>
      <BackButton href="/study/new" label="Study" />
      <div>
        <h1 className="text-xl font-bold">Number listening</h1>
        <p className="text-sm opacity-60">
          Hear a number in Japanese, type it in. Replay as often as you like.
        </p>
      </div>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      {/* Tabs live in the URL so back/forward and reloads keep the tab. */}
      <nav className="flex gap-2" aria-label="Players">
        {(
          [
            ["solo", "Single player"],
            ["multi", "Multiplayer"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={value === "solo" ? "/numbers" : "/numbers?tab=multi"}
            aria-current={tab === value ? "page" : undefined}
            className={`btn btn-sm ${tab === value ? "btn-primary" : "btn-outline"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {tab === "solo" ? (
        // Hides the page header during a run, so the game starts at the top.
        <NumberPractice header={header} />
      ) : (
        <>
          {header}
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 border border-iron p-4">
              <h2 className="text-subheading">Create a room</h2>
              <p className="text-sm opacity-60">
                You&apos;ll pick the numbers, rounds and hints in the room, then invite friends or
                share the code. First to get every number right wins.
              </p>
              <form action={createBattleRoom} className="flex flex-col gap-2">
                <input type="hidden" name="mode" value="numbers" />
                <input
                  name="name"
                  placeholder="Room name (optional)"
                  className="input input-bordered input-sm w-full"
                />
                <SubmitButton className="btn btn-primary btn-sm self-start" pendingText="Creating…">
                  Create room
                </SubmitButton>
              </form>
            </section>

            <section className="flex flex-col gap-3 border border-iron p-4">
              <h2 className="text-subheading">Join with a code</h2>
              <form action={joinBattleRoom} className="flex gap-2">
                <input
                  name="code"
                  placeholder="ABC123"
                  className="input input-bordered input-sm flex-1 uppercase"
                  maxLength={8}
                />
                <SubmitButton className="btn btn-outline btn-sm" pendingText="Joining…">
                  Join
                </SubmitButton>
              </form>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
