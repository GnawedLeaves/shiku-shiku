import type { QueueEntry } from "@/lib/supabase/database.types";

interface CardLike {
  id: string;
  /** Every group (tag) the card belongs to. */
  groupIds: string[];
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Builds a study queue from a flat list of cards.
 * - "random": individual cards, sampled without group bundling.
 * - "all": cards sharing a group are bundled into one queue entry so the whole
 *   group is shown together; ungrouped cards stay individual.
 *
 * A card can carry several groups, so each one is studied under the first
 * group in `groupOrder` it belongs to (falling back to its first group). That
 * keeps every card in exactly one place in the queue.
 */
export function buildQueue(
  cards: CardLike[],
  options: { mode: "all" | "random"; count?: number | "all"; groupOrder?: string[] }
): QueueEntry[] {
  if (options.mode === "random") {
    const requested = options.count === "all" || !options.count ? cards.length : options.count;
    const n = Math.min(requested, cards.length);
    return shuffle(cards)
      .slice(0, n)
      .map((c) => ({ type: "card", cardId: c.id, status: "pending" }) as const);
  }

  const preferred = options.groupOrder ?? [];
  const primaryGroup = (card: CardLike): string | null => {
    if (card.groupIds.length === 0) return null;
    return preferred.find((id) => card.groupIds.includes(id)) ?? card.groupIds[0];
  };

  const groupCardIds = new Map<string, string[]>();
  const order: Array<{ kind: "card" | "group"; id: string }> = [];

  for (const card of cards) {
    const groupId = primaryGroup(card);
    if (groupId) {
      if (!groupCardIds.has(groupId)) {
        groupCardIds.set(groupId, []);
        order.push({ kind: "group", id: groupId });
      }
      groupCardIds.get(groupId)!.push(card.id);
    } else {
      order.push({ kind: "card", id: card.id });
    }
  }

  return order.map((entry): QueueEntry => {
    if (entry.kind === "card") {
      return { type: "card", cardId: entry.id, status: "pending" };
    }
    const cardIds = groupCardIds.get(entry.id)!;
    return {
      type: "group",
      groupId: entry.id,
      cardIds,
      statuses: Object.fromEntries(cardIds.map((id) => [id, "pending" as const])),
    };
  });
}
